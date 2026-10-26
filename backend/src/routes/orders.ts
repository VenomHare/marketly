import { Router } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Address, Cart, CartItem, Coupon, CouponRedemption, InventoryMovement, Order, OrderItem, OrderStatusHistory, Payment, Product, ReturnRequest, Shipment, VendorOrder } from "../models";
import { AuthRequest, authenticate } from "../middleware/auth";
import { acquireRedisMutex, acquireRedisMutexes, RedisMutexTimeoutError } from "../utils/redisMutex.js";

const ordersRouter = Router();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const checkoutPreviewSchema = z.object({
  session_id: z.string().min(32).max(200).refine((value) => value.trim() === value),
  coupon_code: z.string().trim().min(1).max(100).optional(),
}).strict();

const checkoutSchema = z.object({
  cart_id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  session_id: z.string().min(32).max(200).refine((value) => value.trim() === value).optional(),
  address_id: z.string().regex(/^[a-f\d]{24}$/i),
  coupon_code: z.string().trim().min(1).max(100).optional(),
  idempotency_key: z.string().trim().min(8).max(200),
}).strict().refine((body) => Boolean(body.cart_id) !== Boolean(body.session_id));

const ordersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit));

const returnRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict();

ordersRouter.post("/checkout/preview", async (req, res) => {
  const validation = checkoutPreviewSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid request body" });

  try {
    const { session_id: sessionId, coupon_code: couponCode } = validation.data;
    const now = new Date();
    const cart = await Cart.findOne({
      session_id: sessionId,
      user_id: { $exists: false },
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
    });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const cartItems = await CartItem.find({ cart_id: cart.id }).sort({ added_at: 1, _id: 1 }).lean();
    const productIds = [...new Set(cartItems.map((item) => item.product_id))];
    const validProductIds = productIds.filter((productId) => /^[a-f\d]{24}$/i.test(productId));
    const products = await Product.find({ _id: { $in: validProductIds } }).lean();
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));
    const requestedByProduct = new Map<string, number>();
    for (const item of cartItems) {
      if (Number.isSafeInteger(item.quantity) && item.quantity > 0) {
        requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) ?? 0) + item.quantity);
      }
    }

    let subtotalPaise = 0;
    let itemsAvailable = cartItems.length > 0;
    const items = cartItems.map((item) => {
      const product = productsById.get(item.product_id);
      const validQuantity = Number.isSafeInteger(item.quantity) && item.quantity > 0;
      const validPrice = product && Number.isSafeInteger(product.price) && product.price > 0;
      const activeProduct = product?.status === "active" && validPrice ? product : undefined;
      const lineTotal = activeProduct && validQuantity ? activeProduct.price * item.quantity : null;
      const validLineTotal = lineTotal !== null && Number.isSafeInteger(lineTotal);
      const enoughStock = Boolean(activeProduct && validQuantity &&
        (requestedByProduct.get(item.product_id) ?? 0) <= activeProduct.stock);
      let subtotalSafe = true;
      if (lineTotal !== null && Number.isSafeInteger(lineTotal)) {
        const nextSubtotal = subtotalPaise + lineTotal;
        subtotalSafe = Number.isSafeInteger(nextSubtotal);
        if (subtotalSafe) subtotalPaise = nextSubtotal;
      }
      const available = Boolean(activeProduct && validQuantity && validLineTotal && enoughStock && subtotalSafe);
      if (!available) itemsAvailable = false;
      return {
        product_id: item.product_id,
        name: activeProduct?.name ?? null,
        sku: activeProduct?.sku ?? null,
        quantity: item.quantity,
        stock: activeProduct?.stock ?? 0,
        available: available && subtotalSafe,
        reason: !validQuantity ? "invalid_quantity" : !product || product.status !== "active" ? "product_unavailable" :
          !validPrice ? "invalid_price" : !validLineTotal || !subtotalSafe ? "invalid_total" : !enoughStock ? "insufficient_stock" : null,
        unit_price_paise: activeProduct?.price ?? null,
        line_total_paise: validLineTotal ? lineTotal : null,
      };
    });

    let discountPaise = 0;
    let couponResult: { code: string; valid: boolean; message?: string } | null = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: new RegExp(`^${escapeRegex(couponCode)}$`, "i") }).lean();
      if (!coupon) {
        couponResult = { code: couponCode, valid: false, message: "Coupon not found" };
      } else if (!coupon.is_active) {
        couponResult = { code: coupon.code, valid: false, message: "Coupon is inactive" };
      } else if (coupon.starts_at > now) {
        couponResult = { code: coupon.code, valid: false, message: "Coupon is not active yet" };
      } else if (coupon.expires_at <= now) {
        couponResult = { code: coupon.code, valid: false, message: "Coupon has expired" };
      } else if (coupon.min_order_paise !== undefined && subtotalPaise < coupon.min_order_paise) {
        couponResult = { code: coupon.code, valid: false, message: "Order does not meet the minimum amount" };
      } else if (coupon.usage_limit !== undefined &&
        await CouponRedemption.countDocuments({ coupon_id: coupon._id.toString() }) >= coupon.usage_limit) {
        couponResult = { code: coupon.code, valid: false, message: "Coupon usage limit has been reached" };
      } else {
        discountPaise = coupon.discount_type === "percentage"
          ? Math.floor(subtotalPaise * coupon.discount_value / 100)
          : coupon.discount_value;
        if (coupon.max_discount_paise !== undefined) discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
        discountPaise = Math.max(0, Math.min(discountPaise, subtotalPaise));
        couponResult = { code: coupon.code, valid: true };
      }
    }

    const shippingPaise = 0;
    const totalPaise = Math.max(0, subtotalPaise - discountPaise + shippingPaise);
    return res.json({
      cart_id: cart.id,
      valid: itemsAvailable && (couponResult?.valid ?? true),
      items,
      subtotal_paise: subtotalPaise,
      discount_paise: discountPaise,
      shipping_paise: shippingPaise,
      total_paise: totalPaise,
      coupon: couponResult,
    });
  } catch (error) {
    console.error("Checkout preview error:", error);
    return res.status(500).json({ message: "Failed to preview checkout" });
  }
});

ordersRouter.post("/checkout", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const validation = checkoutSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid request body" });

  const { cart_id: cartId, session_id: sessionId, address_id: addressId, coupon_code: couponCode, idempotency_key: idempotencyKey } = validation.data;
  const customerId = req.user.id;
  let releaseLocks: (() => Promise<void>) | undefined;
  try {
    releaseLocks = await acquireRedisMutexes([
      `checkout-cart:${cartId ?? sessionId}`,
      ...(couponCode ? [`checkout-coupon:${couponCode.toLowerCase()}`] : []),
    ]);
  } catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Checkout is already being processed" });
    console.error("Acquire checkout mutex error:", error);
    return res.status(503).json({ message: "Checkout is temporarily unavailable" });
  }
  let session: mongoose.ClientSession;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    await releaseLocks();
    console.error("Start checkout transaction error:", error);
    return res.status(500).json({ message: "Failed to create checkout" });
  }
  let result: { status: number; body: Record<string, unknown> } | undefined;
  try {
    await session.withTransaction(async () => {
      const priorPayment = await Payment.findOne({ idempotency_key: idempotencyKey }).session(session);
      if (priorPayment) {
        const priorOrder = await Order.findOne({ _id: priorPayment.order_id, user_id: customerId }).session(session);
        if (!priorOrder) {
          result = { status: 409, body: { message: "Idempotency key has already been used" } };
          return;
        }
        result = {
          status: 200,
          body: {
            order: { id: priorOrder.id, status: priorOrder.status, total_paise: priorOrder.total_paise },
            payment: { id: priorPayment.id, status: priorPayment.status, amount_paise: priorPayment.amount_paise, currency: priorPayment.currency },
          },
        };
        return;
      }

      const now = new Date();
      const cart = await Cart.findOne({
        ...(cartId ? { _id: cartId, user_id: customerId } : { session_id: sessionId, user_id: { $exists: false } }),
        $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
      }).session(session);
      if (!cart) {
        result = { status: 404, body: { message: "Cart not found" } };
        return;
      }
      const address = await Address.findOne({ _id: addressId, user_id: customerId }).session(session);
      if (!address) {
        result = { status: 404, body: { message: "Address not found" } };
        return;
      }

      const cartItems = await CartItem.find({ cart_id: cart.id }).sort({ added_at: 1, _id: 1 }).session(session);
      if (cartItems.length === 0) {
        result = { status: 409, body: { message: "Cart is empty" } };
        return;
      }
      const productIds = [...new Set(cartItems.map((item) => item.product_id))];
      const validProductIds = productIds.filter((productId) => /^[a-f\d]{24}$/i.test(productId));
      const products = await Product.find({ _id: { $in: validProductIds } }).session(session);
      const productsById = new Map(products.map((product) => [product.id, product]));
      const quantities = new Map<string, number>();
      for (const item of cartItems) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
          result = { status: 409, body: { message: "Cart contains an invalid quantity" } };
          return;
        }
        const nextQuantity = (quantities.get(item.product_id) ?? 0) + item.quantity;
        if (!Number.isSafeInteger(nextQuantity)) {
          result = { status: 409, body: { message: "Cart quantity exceeds supported limits" } };
          return;
        }
        quantities.set(item.product_id, nextQuantity);
      }

      let subtotalPaise = 0;
      for (const [productId, quantity] of quantities) {
        const product = productsById.get(productId);
        if (!product || product.status !== "active" || !Number.isSafeInteger(product.price) || product.price <= 0 ||
          !Number.isSafeInteger(product.stock) || product.stock < quantity) {
          result = { status: 409, body: { message: "Cart contains an unavailable or out-of-stock product", product_id: productId } };
          return;
        }
        const lineTotal = product.price * quantity;
        const nextSubtotal = subtotalPaise + lineTotal;
        if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextSubtotal)) {
          result = { status: 409, body: { message: "Cart total exceeds supported limits" } };
          return;
        }
        subtotalPaise = nextSubtotal;
      }

      let coupon: Awaited<ReturnType<typeof Coupon.findOne>> = null;
      let discountPaise = 0;
      if (couponCode) {
        coupon = await Coupon.findOne({ code: new RegExp(`^${escapeRegex(couponCode)}$`, "i") }).session(session);
        if (!coupon || !coupon.is_active || coupon.starts_at > now || coupon.expires_at <= now ||
          (coupon.min_order_paise !== undefined && subtotalPaise < coupon.min_order_paise)) {
          result = { status: 400, body: { message: "Coupon is invalid or unavailable" } };
          return;
        }
        if (coupon.usage_limit !== undefined &&
          await CouponRedemption.countDocuments({ coupon_id: coupon.id }).session(session) >= coupon.usage_limit) {
          result = { status: 409, body: { message: "Coupon usage limit has been reached" } };
          return;
        }
        discountPaise = coupon.discount_type === "percentage"
          ? Math.floor(subtotalPaise * coupon.discount_value / 100)
          : coupon.discount_value;
        if (!Number.isSafeInteger(discountPaise) || discountPaise < 0) {
          result = { status: 409, body: { message: "Coupon has an invalid discount configuration" } };
          return;
        }
        if (coupon.max_discount_paise !== undefined) discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
        discountPaise = Math.min(discountPaise, subtotalPaise);
      }

      const shippingPaise = 0;
      const totalPaise = subtotalPaise - discountPaise + shippingPaise;
      for (const [productId, quantity] of quantities) {
        const updated = await Product.updateOne(
          { _id: productId, status: "active", stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session }
        );
        if (updated.modifiedCount !== 1) {
          throw Object.assign(new Error("Inventory changed during checkout"), { checkoutStatus: 409 });
        }
      }

      const [order] = await Order.create([{
        user_id: customerId,
        address_snapshot: {
          label: address.label,
          first_line: address.first_line,
          ...(address.second_line ? { second_line: address.second_line } : {}),
          postal_code: address.postal_code,
          city: address.city,
          state: address.state,
          country: address.country,
          addressee_name: address.addressee_name,
          contact_number: address.contact_number,
        },
        subtotal_paise: subtotalPaise,
        discount_paise: discountPaise,
        shipping_paise: shippingPaise,
        total_paise: totalPaise,
        payment_status: "pending",
        status: "pending",
      }], { session });
      if (!order) throw new Error("Failed to create order");

      let remainingDiscount = discountPaise;
      const orderItems = cartItems.map((item, index) => {
        const product = productsById.get(item.product_id)!;
        const grossPaise = product.price * item.quantity;
        const allocatedDiscount = index === cartItems.length - 1
          ? remainingDiscount
          : subtotalPaise > 0 ? Math.floor(discountPaise * grossPaise / subtotalPaise) : 0;
        remainingDiscount -= allocatedDiscount;
        return {
          order_id: order.id,
          product_id: item.product_id,
          vendor_id: product.vendor_id,
          product_name: product.name,
          sku: product.sku,
          unit_price_paise: product.price,
          quantity: item.quantity,
          discount_paise: allocatedDiscount,
          line_total_paise: grossPaise - allocatedDiscount,
        };
      });
      const createdItems = await OrderItem.create(orderItems, { session });
      await InventoryMovement.create(createdItems.map((item) => ({
        product_id: item.product_id,
        order_item_id: item.id,
        quantity_change: -item.quantity,
        reason: "purchase" as const,
      })), { session });
      if (coupon) {
        await CouponRedemption.create([{
          coupon_id: coupon.id,
          user_id: customerId,
          order_id: order.id,
          discount_paise: discountPaise,
        }], { session });
      }
      const [payment] = await Payment.create([{
        order_id: order.id,
        provider: "razorpay",
        status: "created",
        amount_paise: totalPaise,
        currency: "INR",
        idempotency_key: idempotencyKey,
      }], { session });
      await CartItem.deleteMany({ cart_id: cart.id }).session(session);
      await cart.deleteOne({ session });

      result = {
        status: 201,
        body: {
          order: { id: order.id, status: order.status, subtotal_paise: subtotalPaise, discount_paise: discountPaise, shipping_paise: shippingPaise, total_paise: totalPaise },
          payment: { id: payment!.id, status: payment!.status, amount_paise: payment!.amount_paise, currency: payment!.currency },
        },
      };
    });
    if (!result) return res.status(500).json({ message: "Failed to create checkout" });
    return res.status(result.status).json(result.body);
  } catch (error) {
    const checkoutStatus = (error as Error & { checkoutStatus?: number }).checkoutStatus;
    if (checkoutStatus === 409) return res.status(409).json({ message: "Inventory changed during checkout" });
    if ((error as Error & { code?: number }).code === 11000) {
      const priorPayment = await Payment.findOne({ idempotency_key: idempotencyKey });
      const priorOrder = priorPayment ? await Order.findOne({ _id: priorPayment.order_id, user_id: customerId }) : null;
      if (priorPayment && priorOrder) {
        return res.status(200).json({
          order: { id: priorOrder.id, status: priorOrder.status, total_paise: priorOrder.total_paise },
          payment: { id: priorPayment.id, status: priorPayment.status, amount_paise: priorPayment.amount_paise, currency: priorPayment.currency },
        });
      }
      return res.status(409).json({ message: "Idempotency key has already been used" });
    }
    console.error("Create checkout error:", error);
    return res.status(500).json({ message: "Failed to create checkout" });
  } finally {
    await session.endSession();
    await releaseLocks();
  }
});

ordersRouter.get("/orders", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const validation = ordersListQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const { page, limit } = validation.data;
    const filter = { user_id: req.user.id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return res.json({
      orders: orders.map((order) => ({
        id: order._id.toString(),
        status: order.status,
        payment_status: order.payment_status,
        subtotal_paise: order.subtotal_paise,
        discount_paise: order.discount_paise,
        shipping_paise: order.shipping_paise,
        total_paise: order.total_paise,
        created_at: order.created_at,
        updated_at: order.updated_at,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("List orders error:", error);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

ordersRouter.get("/orders/:uuid", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const orderId = req.params.uuid;
  if (typeof orderId !== "string" || !/^[a-f\d]{24}$/i.test(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  if (Object.keys(req.query).length > 0) return res.status(400).json({ message: "Unsupported query parameter" });

  try {
    const order = await Order.findOne({ _id: orderId, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const [items, payment] = await Promise.all([
      OrderItem.find({ order_id: order._id.toString() }).sort({ _id: 1 }).lean(),
      Payment.findOne({ order_id: order._id.toString() }).sort({ created_at: -1, _id: -1 }).lean(),
    ]);
    return res.json({
      order: {
        id: order._id.toString(),
        status: order.status,
        payment_status: order.payment_status,
        address_snapshot: order.address_snapshot,
        subtotal_paise: order.subtotal_paise,
        discount_paise: order.discount_paise,
        shipping_paise: order.shipping_paise,
        total_paise: order.total_paise,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
      items: items.map((item) => ({
        id: item._id.toString(),
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        unit_price_paise: item.unit_price_paise,
        quantity: item.quantity,
        discount_paise: item.discount_paise,
        line_total_paise: item.line_total_paise,
      })),
      payment: payment ? {
        id: payment._id.toString(),
        provider: payment.provider,
        status: payment.status,
        amount_paise: payment.amount_paise,
        currency: payment.currency,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
      } : null,
    });
  } catch (error) {
    console.error("Get order error:", error);
    return res.status(500).json({ message: "Failed to fetch order" });
  }
});

ordersRouter.post("/orders/:uuid/cancel", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const orderId = req.params.uuid;
  if (typeof orderId !== "string" || !/^[a-f\d]{24}$/i.test(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  if (req.body !== undefined) {
    const bodyValidation = z.object({}).strict().safeParse(req.body);
    if (!bodyValidation.success) return res.status(400).json({ message: "Invalid request body" });
  }
  if (Object.keys(req.query).length > 0) return res.status(400).json({ message: "Unsupported query parameter" });

  let releaseLock: (() => Promise<void>);
  try {
    releaseLock = await acquireRedisMutex(`order:${orderId}`);
  } catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Order update is already in progress" });
    console.error("Acquire order cancellation mutex error:", error);
    return res.status(503).json({ message: "Order cancellation is temporarily unavailable" });
  }
  let session: mongoose.ClientSession;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    await releaseLock();
    console.error("Start order cancellation transaction error:", error);
    return res.status(500).json({ message: "Failed to cancel order" });
  }
  let result: { status: number; body: Record<string, unknown> } | undefined;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: orderId, user_id: req.user!.id }).session(session);
      if (!order) {
        result = { status: 404, body: { message: "Order not found" } };
        return;
      }
      if (order.status === "cancelled") {
        result = { status: 409, body: { message: "Order is already cancelled" } };
        return;
      }
      if (order.status !== "pending" || order.payment_status === "paid" || order.payment_status === "partially_refunded" ||
        order.payment_status === "refunded") {
        result = { status: 409, body: { message: "Order cannot be cancelled in its current state" } };
        return;
      }

      const payments = await Payment.find({ order_id: order.id }).session(session);
      if (payments.some((payment) => payment.status === "processing" || payment.status === "success" || payment.status === "refunded")) {
        result = { status: 409, body: { message: "Payment is already processing or completed" } };
        return;
      }
      const items = await OrderItem.find({ order_id: order.id }).session(session);
      for (const item of items) {
        await Product.updateOne({ _id: item.product_id }, { $inc: { stock: item.quantity } }, { session });
      }
      if (items.length > 0) {
        await InventoryMovement.create(items.map((item) => ({
          product_id: item.product_id,
          order_item_id: item.id,
          quantity_change: item.quantity,
          reason: "cancellation" as const,
        })), { session });
      }
      await Payment.updateMany({ order_id: order.id, status: { $in: ["created", "failed"] } }, { status: "failed" }, { session });
      await CouponRedemption.deleteMany({ order_id: order.id }).session(session);
      order.status = "cancelled";
      order.payment_status = "failed";
      order.updated_at = new Date();
      await order.save({ session });
      result = {
        status: 200,
        body: { id: order.id, status: order.status, payment_status: order.payment_status, updated_at: order.updated_at },
      };
    });
    if (!result) return res.status(500).json({ message: "Failed to cancel order" });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ message: "Failed to cancel order" });
  } finally {
    await session.endSession();
    await releaseLock();
  }
});

ordersRouter.post("/orders/:uuid/return", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const orderId = req.params.uuid;
  if (typeof orderId !== "string" || !/^[a-f\d]{24}$/i.test(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  if (Object.keys(req.query).length > 0) return res.status(400).json({ message: "Unsupported query parameter" });
  const validation = returnRequestSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid request body" });

  let releaseLock: () => Promise<void>;
  try {
    releaseLock = await acquireRedisMutex(`order:${orderId}`);
  } catch (error) {
    if (error instanceof RedisMutexTimeoutError) return res.status(409).json({ message: "Order update is already in progress" });
    console.error("Acquire order return mutex error:", error);
    return res.status(503).json({ message: "Order return is temporarily unavailable" });
  }

  try {
    const order = await Order.findOne({ _id: orderId, user_id: req.user.id }).select("_id status payment_status");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "completed" || order.payment_status !== "paid") {
      return res.status(409).json({ message: "Order is not eligible for return" });
    }
    if (await ReturnRequest.exists({ order_id: order.id })) {
      return res.status(409).json({ message: "A return has already been requested for this order" });
    }

    const returnRequest = await ReturnRequest.create({
      order_id: order.id,
      user_id: req.user.id,
      reason: validation.data.reason,
    });
    return res.status(201).json({
      return_request: {
        id: returnRequest.id,
        order_id: returnRequest.order_id,
        reason: returnRequest.reason,
        status: returnRequest.status,
        created_at: returnRequest.created_at,
      },
    });
  } catch (error) {
    if ((error as Error & { code?: number }).code === 11000) {
      return res.status(409).json({ message: "A return has already been requested for this order" });
    }
    console.error("Request order return error:", error);
    return res.status(500).json({ message: "Failed to request order return" });
  } finally {
    await releaseLock();
  }
});

ordersRouter.get("/orders/:uuid/tracking", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const orderId = req.params.uuid;
  if (typeof orderId !== "string" || !/^[a-f\d]{24}$/i.test(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  if (Object.keys(req.query).length > 0) return res.status(400).json({ message: "Unsupported query parameter" });

  try {
    const order = await Order.findOne({ _id: orderId, user_id: req.user.id }).select("_id status").lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const vendorOrders = await VendorOrder.find({ order_id: order._id.toString() }).sort({ created_at: 1, _id: 1 }).lean();
    const vendorOrderIds = vendorOrders.map((vendorOrder) => vendorOrder._id.toString());
    const [shipments, history] = await Promise.all([
      Shipment.find({ vendor_order_id: { $in: vendorOrderIds } }).sort({ shipped_at: 1, _id: 1 }).lean(),
      OrderStatusHistory.find({ vendor_order_id: { $in: vendorOrderIds } }).sort({ created_at: 1, _id: 1 }).lean(),
    ]);
    const shipmentsByVendorOrder = new Map<string, typeof shipments>();
    for (const shipment of shipments) {
      const current = shipmentsByVendorOrder.get(shipment.vendor_order_id) ?? [];
      current.push(shipment);
      shipmentsByVendorOrder.set(shipment.vendor_order_id, current);
    }
    const historyByVendorOrder = new Map<string, typeof history>();
    for (const statusEvent of history) {
      const current = historyByVendorOrder.get(statusEvent.vendor_order_id) ?? [];
      current.push(statusEvent);
      historyByVendorOrder.set(statusEvent.vendor_order_id, current);
    }

    return res.json({
      order_id: order._id.toString(),
      order_status: order.status,
      vendor_orders: vendorOrders.map((vendorOrder) => {
        const id = vendorOrder._id.toString();
        return {
          id,
          status: vendorOrder.status,
          created_at: vendorOrder.created_at,
          updated_at: vendorOrder.updated_at,
          shipments: (shipmentsByVendorOrder.get(id) ?? []).map((shipment) => ({
            id: shipment._id.toString(),
            carrier: shipment.carrier,
            tracking_number: shipment.tracking_number,
            tracking_url: shipment.tracking_url,
            shipped_at: shipment.shipped_at,
            delivered_at: shipment.delivered_at,
          })),
          status_history: (historyByVendorOrder.get(id) ?? []).map((event) => ({
            previous_status: event.previous_status ?? null,
            new_status: event.new_status,
            created_at: event.created_at,
          })),
        };
      }),
    });
  } catch (error) {
    console.error("Get order tracking error:", error);
    return res.status(500).json({ message: "Failed to fetch order tracking" });
  }
});

export default ordersRouter;
