import { createHash } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Order, Payment, PaymentRefundRequest, PaymentWebhookEvent } from "../models";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth";
import { acquireRedisMutex, RedisMutexTimeoutError } from "../utils/redisMutex";
import { createRazorpayOrder, createRazorpayRefund, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from "../utils/razorpay";

const paymentsRouter = Router();
const objectId = /^[a-f\d]{24}$/i;
const createSchema = z.object({ payment_id: z.string().regex(objectId) }).strict();
const verifySchema = z.object({ razorpay_order_id: z.string().min(1).max(100), razorpay_payment_id: z.string().min(1).max(100), razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i) }).strict();
const refundSchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
const paymentView = (payment: { id: string; order_id: string; status: string; amount_paise: number; currency: string; provider_order_id?: string; created_at: Date; updated_at: Date }) => ({
  id: payment.id,
  order_id: payment.order_id,
  status: payment.status,
  amount_paise: payment.amount_paise,
  currency: payment.currency,
  razorpay_order_id: payment.provider_order_id ?? null,
  created_at: payment.created_at,
  updated_at: payment.updated_at,
});

paymentsRouter.post("/payments/create", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid request body" });
  try {
    const release = await acquireRedisMutex(`payment-create:${parsed.data.payment_id}`);
    try {
      const payment = await Payment.findById(parsed.data.payment_id);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      const order = await Order.findOne({ _id: payment.order_id, user_id: req.user.id });
      if (!order) return res.status(404).json({ message: "Payment not found" });
      if (payment.provider !== "razorpay" || payment.status !== "created" || order.payment_status !== "pending" || order.status !== "pending") {
        return res.status(409).json({ message: "Payment cannot be started in its current state" });
      }
      if (!Number.isSafeInteger(payment.amount_paise) || payment.amount_paise <= 0 || payment.currency !== "INR") {
        return res.status(409).json({ message: "Payment amount is invalid" });
      }
      if (!payment.provider_order_id) {
        const razorpayOrder = await createRazorpayOrder(payment.amount_paise, payment.currency, payment.id);
        if (razorpayOrder.amount !== payment.amount_paise || razorpayOrder.currency !== payment.currency || typeof razorpayOrder.id !== "string") {
          console.error("Razorpay order response did not match the stored payment");
          return res.status(502).json({ message: "Payment provider returned an invalid response" });
        }
        const updated = await Payment.findOneAndUpdate(
          { _id: payment.id, status: "created", provider_order_id: { $exists: false } },
          { $set: { provider_order_id: razorpayOrder.id, updated_at: new Date() } },
          { new: true }
        );
        if (!updated) return res.status(409).json({ message: "Payment changed while it was being started" });
        return res.status(201).json({ payment: paymentView(updated), razorpay: { key_id: process.env.RAZORPAY_KEY_ID, order_id: razorpayOrder.id, amount: updated.amount_paise, currency: updated.currency } });
      }
      return res.json({ payment: paymentView(payment), razorpay: { key_id: process.env.RAZORPAY_KEY_ID, order_id: payment.provider_order_id, amount: payment.amount_paise, currency: payment.currency } });
    } finally {
      await release();
    }
  } catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Payment is already being processed" });
    console.error("Create Razorpay order error:", error);
    return res.status(502).json({ message: "Failed to start payment" });
  }
});

paymentsRouter.get("/payments/:uuid", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  try {
    const payment = await Payment.findById(req.params.uuid).lean();
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const order = await Order.findOne({ _id: payment.order_id, user_id: req.user.id }).select("_id").lean();
    if (!order) return res.status(404).json({ message: "Payment not found" });
    const refundRequest = await PaymentRefundRequest.findOne({ payment_id: payment._id.toString(), user_id: req.user.id }).sort({ created_at: -1 }).lean();
    return res.json({ payment: paymentView({ ...payment, id: payment._id.toString() }), refund_request: refundRequest ? { id: refundRequest._id.toString(), reason: refundRequest.reason, status: refundRequest.status, amount_paise: refundRequest.amount_paise, created_at: refundRequest.created_at } : null });
  } catch (error) {
    console.error("Get payment error:", error);
    return res.status(500).json({ message: "Failed to fetch payment" });
  }
});

paymentsRouter.get("/payments/:uuid/refund", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  try {
    const payment = await Payment.findById(req.params.uuid).select("_id order_id").lean();
    if (!payment || !await Order.exists({ _id: payment.order_id, user_id: req.user.id })) return res.status(404).json({ message: "Payment not found" });
    const request = await PaymentRefundRequest.findOne({ payment_id: payment._id.toString(), user_id: req.user.id }).sort({ created_at: -1 }).lean();
    if (!request) return res.status(404).json({ message: "Refund request not found" });
    return res.json({ refund_request: { id: request._id.toString(), payment_id: request.payment_id, reason: request.reason, status: request.status, amount_paise: request.amount_paise, created_at: request.created_at, updated_at: request.updated_at } });
  } catch (error) {
    console.error("Get refund request error:", error);
    return res.status(500).json({ message: "Failed to fetch refund request" });
  }
});

paymentsRouter.post("/payments/:uuid/verify", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid request body" });
  let release: (() => Promise<void>);
  try { release = await acquireRedisMutex(`payment-update:${req.params.uuid}`); }
  catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Payment is already being processed" });
    console.error("Acquire payment verification mutex error:", error);
    return res.status(503).json({ message: "Payment verification is temporarily unavailable" });
  }
  try {
    const payment = await Payment.findById(req.params.uuid);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const order = await Order.findOne({ _id: payment.order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ message: "Payment not found" });
    if (!payment.provider_order_id || parsed.data.razorpay_order_id !== payment.provider_order_id) return res.status(400).json({ message: "Payment verification failed" });
    if (!verifyRazorpayPaymentSignature(payment.provider_order_id, parsed.data.razorpay_payment_id, parsed.data.razorpay_signature)) return res.status(400).json({ message: "Payment verification failed" });
    if (payment.status === "success" && payment.provider_payment_id === parsed.data.razorpay_payment_id && order.payment_status === "paid") return res.json({ payment: paymentView(payment) });
    if (payment.status !== "created" && payment.status !== "processing") return res.status(409).json({ message: "Payment cannot be verified in its current state" });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await Payment.updateOne({ _id: payment.id, status: { $in: ["created", "processing"] }, provider_order_id: payment.provider_order_id, provider_payment_id: { $in: [null, parsed.data.razorpay_payment_id] } }, { $set: { status: "success", provider_payment_id: parsed.data.razorpay_payment_id, updated_at: new Date() } }, { session });
        if (changed.modifiedCount !== 1) throw new Error("Payment state changed during verification");
        const paid = await Order.updateOne({ _id: order.id, user_id: req.user!.id, payment_status: "pending", status: "pending", total_paise: payment.amount_paise }, { $set: { payment_status: "paid", status: "placed", updated_at: new Date() } }, { session });
        if (paid.modifiedCount !== 1) throw new Error("Order state changed during verification");
      });
    } finally { await session.endSession(); }
    const verifiedPayment = await Payment.findById(payment.id);
    return res.json({ payment: paymentView(verifiedPayment!) });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(409).json({ message: "Payment could not be verified" });
  } finally { await release(); }
});

paymentsRouter.post("/payments/:uuid/retry", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  try {
    const payment = await Payment.findById(req.params.uuid);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const order = await Order.findOne({ _id: payment.order_id, user_id: req.user.id, status: "pending", payment_status: "pending" });
    if (!order) return res.status(404).json({ message: "Payment not found" });
    if (payment.status !== "created") return res.status(409).json({ message: "Payment cannot be retried in its current state" });
    if (payment.provider_order_id) return res.json({ payment: paymentView(payment), razorpay: { key_id: process.env.RAZORPAY_KEY_ID, order_id: payment.provider_order_id, amount: payment.amount_paise, currency: payment.currency } });
    return res.status(409).json({ message: "Create the Razorpay order using POST /payments/create" });
  } catch (error) {
    console.error("Retry payment error:", error);
    return res.status(500).json({ message: "Failed to retry payment" });
  }
});

paymentsRouter.post("/payments/:uuid/refund", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  const parsed = refundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid request body" });
  let release: (() => Promise<void>);
  try { release = await acquireRedisMutex(`payment-refund-request:${req.params.uuid}`); }
  catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Refund request is already being processed" });
    console.error("Acquire refund request mutex error:", error);
    return res.status(503).json({ message: "Refund request is temporarily unavailable" });
  }
  try {
    const payment = await Payment.findById(req.params.uuid);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const order = await Order.findOne({ _id: payment.order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ message: "Payment not found" });
    if (payment.status !== "success" || !payment.provider_payment_id || order.payment_status !== "paid") return res.status(409).json({ message: "Payment is not eligible for a refund request" });
    if (await PaymentRefundRequest.exists({ payment_id: payment.id, status: { $in: ["requested", "processing", "refunded"] } })) return res.status(409).json({ message: "A refund request already exists" });
    const request = await PaymentRefundRequest.create({ payment_id: payment.id, order_id: payment.order_id, user_id: req.user.id, reason: parsed.data.reason, amount_paise: payment.amount_paise, status: "requested" });
    return res.status(201).json({ refund_request: { id: request.id, payment_id: request.payment_id, status: request.status, amount_paise: request.amount_paise, created_at: request.created_at } });
  } catch (error) {
    if ((error as Error & { code?: number }).code === 11000) return res.status(409).json({ message: "A refund request already exists" });
    console.error("Create refund request error:", error);
    return res.status(500).json({ message: "Failed to create refund request" });
  } finally { await release(); }
});

paymentsRouter.delete("/payments/:uuid/refund", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid payment id" });
  if (!z.object({}).strict().safeParse(req.body ?? {}).success) return res.status(400).json({ message: "Invalid request body" });
  try {
    const payment = await Payment.findById(req.params.uuid).select("_id order_id").lean();
    if (!payment || !await Order.exists({ _id: payment.order_id, user_id: req.user.id })) return res.status(404).json({ message: "Payment not found" });
    const request = await PaymentRefundRequest.findOneAndUpdate(
      { payment_id: req.params.uuid, user_id: req.user.id, status: "requested" },
      { $set: { status: "cancelled", updated_at: new Date() } },
      { new: true, sort: { created_at: -1 } }
    );
    if (!request) return res.status(409).json({ message: "No pending refund request can be cancelled" });
    return res.json({ refund_request: { id: request.id, status: request.status, updated_at: request.updated_at } });
  } catch (error) {
    console.error("Cancel refund request error:", error);
    return res.status(500).json({ message: "Failed to cancel refund request" });
  }
});

paymentsRouter.get("/admin/refund-requests", authenticate, requireAdmin, async (_req, res) => {
  try {
    const requests = await PaymentRefundRequest.find().sort({ created_at: 1, _id: 1 }).limit(100).lean();
    return res.json({ refund_requests: requests.map((request) => ({ id: request._id.toString(), payment_id: request.payment_id, order_id: request.order_id, user_id: request.user_id, reason: request.reason, status: request.status, amount_paise: request.amount_paise, created_at: request.created_at })) });
  } catch (error) {
    console.error("List refund requests error:", error);
    return res.status(500).json({ message: "Failed to fetch refund requests" });
  }
});

paymentsRouter.get("/admin/refund-requests/:uuid", authenticate, requireAdmin, async (req, res) => {
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid refund request id" });
  try {
    const request = await PaymentRefundRequest.findById(req.params.uuid).lean();
    if (!request) return res.status(404).json({ message: "Refund request not found" });
    return res.json({ refund_request: { id: request._id.toString(), payment_id: request.payment_id, order_id: request.order_id, user_id: request.user_id, reason: request.reason, status: request.status, amount_paise: request.amount_paise, provider_refund_id: request.provider_refund_id ?? null, reviewed_by: request.reviewed_by ?? null, reviewed_at: request.reviewed_at ?? null, created_at: request.created_at, updated_at: request.updated_at } });
  } catch (error) {
    console.error("Get refund request error:", error);
    return res.status(500).json({ message: "Failed to fetch refund request" });
  }
});

paymentsRouter.post("/admin/refund-requests/:uuid/approve", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid refund request id" });
  const bodyValid = z.object({}).strict().safeParse(req.body);
  if (!bodyValid.success) return res.status(400).json({ message: "Invalid request body" });
  let release: (() => Promise<void>);
  try { release = await acquireRedisMutex(`refund-approval:${req.params.uuid}`); }
  catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Refund is already being processed" });
    console.error("Acquire refund approval mutex error:", error);
    return res.status(503).json({ message: "Refund approval is temporarily unavailable" });
  }
  try {
    const request = await PaymentRefundRequest.findOneAndUpdate({ _id: req.params.uuid, status: "requested" }, { $set: { status: "processing", reviewed_by: req.user!.id, reviewed_at: new Date() } }, { new: true });
    if (!request) return res.status(409).json({ message: "Refund request is no longer awaiting review" });
    const payment = await Payment.findOne({ _id: request.payment_id, status: "success", provider: "razorpay", provider_payment_id: { $exists: true } });
    const order = await Order.findOne({ _id: request.order_id, payment_status: "paid" });
    if (!payment || !order || request.amount_paise !== payment.amount_paise) {
      await PaymentRefundRequest.updateOne({ _id: request.id, status: "processing" }, { $set: { status: "failed" } });
      return res.status(409).json({ message: "Payment is no longer eligible for a refund" });
    }
    const razorpayRefund = await createRazorpayRefund(payment.provider_payment_id!, request.amount_paise, request.id);
    if (razorpayRefund.amount !== request.amount_paise || typeof razorpayRefund.id !== "string" || !["processed", "pending"].includes(razorpayRefund.status)) throw new Error("Razorpay refund response did not match the request");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const requestUpdate = await PaymentRefundRequest.updateOne({ _id: request.id, status: "processing" }, { $set: { status: razorpayRefund.status === "processed" ? "refunded" : "processing", provider_refund_id: razorpayRefund.id } }, { session });
        if (requestUpdate.modifiedCount !== 1) throw new Error("Refund request changed during processing");
        if (razorpayRefund.status === "processed") {
          const paymentUpdate = await Payment.updateOne({ _id: payment.id, status: "success" }, { $set: { status: "refunded", updated_at: new Date() } }, { session });
          const orderUpdate = await Order.updateOne({ _id: order.id, payment_status: "paid" }, { $set: { payment_status: "refunded", updated_at: new Date() } }, { session });
          if (paymentUpdate.modifiedCount !== 1 || orderUpdate.modifiedCount !== 1) throw new Error("Payment changed during refund processing");
        }
      });
    } finally { await session.endSession(); }
    return res.json({ refund_request: { id: request.id, status: razorpayRefund.status === "processed" ? "refunded" : "processing", amount_paise: request.amount_paise, razorpay_refund_id: razorpayRefund.id } });
  } catch (error) {
    await PaymentRefundRequest.updateOne({ _id: req.params.uuid, status: "processing", provider_refund_id: { $exists: false } }, { $set: { status: "failed" } }).catch(() => undefined);
    console.error("Approve refund request error:", error);
    return res.status(502).json({ message: "Failed to process refund" });
  } finally { await release(); }
});

paymentsRouter.post("/admin/refund-requests/:uuid/reject", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  if (typeof req.params.uuid !== "string" || !objectId.test(req.params.uuid)) return res.status(400).json({ message: "Invalid refund request id" });
  if (!z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ message: "Invalid request body" });
  try {
    const request = await PaymentRefundRequest.findOneAndUpdate({ _id: req.params.uuid, status: "requested" }, { $set: { status: "rejected", reviewed_by: req.user!.id, reviewed_at: new Date() } }, { new: true });
    if (!request) return res.status(409).json({ message: "Refund request is no longer awaiting review" });
    return res.json({ refund_request: { id: request.id, status: request.status } });
  } catch (error) {
    console.error("Reject refund request error:", error);
    return res.status(500).json({ message: "Failed to reject refund request" });
  }
});

paymentsRouter.post("/webhooks/razorpay", async (req, res) => {
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const signature = req.header("x-razorpay-signature");
  if (!rawBody || !verifyRazorpayWebhookSignature(rawBody, signature)) return res.status(400).json({ message: "Invalid webhook signature" });
  const event = req.body as { event?: unknown; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; refund?: { entity?: { id?: string; payment_id?: string; status?: string } } }; id?: string };
  if (typeof event?.event !== "string") return res.status(400).json({ message: "Invalid webhook event" });
  const eventId = typeof event.id === "string" && event.id ? event.id : createHash("sha256").update(rawBody).digest("hex");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PaymentWebhookEvent.create([{ provider: "razorpay", provider_event_id: eventId, event_type: event.event as string, status: "received" }], { session });
      if (event.event === "payment.captured") {
        const entity = event.payload?.payment?.entity;
        if (entity?.id && entity.order_id) {
          const payment = await Payment.findOne({ provider: "razorpay", provider_order_id: entity.order_id }).session(session);
          if (payment && payment.amount_paise > 0 && ["created", "processing"].includes(payment.status)) {
            const order = await Order.findOne({ _id: payment.order_id, payment_status: "pending", status: "pending", total_paise: payment.amount_paise }).session(session);
            if (order) {
              payment.status = "success"; payment.provider_payment_id = entity.id; payment.updated_at = new Date(); await payment.save({ session });
              order.payment_status = "paid"; order.status = "placed"; order.updated_at = new Date(); await order.save({ session });
            }
          }
        }
      }
      await PaymentWebhookEvent.updateOne({ provider: "razorpay", provider_event_id: eventId }, { $set: { status: "processed", processed_at: new Date() } }, { session });
    });
    return res.json({ received: true });
  } catch (error) {
    if ((error as Error & { code?: number }).code === 11000) return res.json({ received: true, duplicate: true });
    console.error("Process Razorpay webhook error:", error);
    return res.status(500).json({ message: "Failed to process webhook" });
  } finally { await session.endSession(); }
});

paymentsRouter.post("/webhooks/stripe", (_req, res) => res.status(501).json({ message: "Payment provider is not enabled" }));
paymentsRouter.get("/vendor/settlements", authenticate, (_req, res) => res.status(501).json({ message: "Vendor settlements are not enabled" }));

export default paymentsRouter;
