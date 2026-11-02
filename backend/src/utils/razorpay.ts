import { createHmac, timingSafeEqual } from "node:crypto";

type RazorpayOrder = { id: string; amount: number; currency: string; receipt?: string; status?: string };
type RazorpayRefund = { id: string; amount: number; status: string };

const credentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return { keyId, keySecret };
};

const apiRequest = async <T>(path: string, body: Record<string, unknown>, idempotencyKey: string, idempotencyHeader = "X-Razorpay-Idempotency"): Promise<T> => {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      [idempotencyHeader]: idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Razorpay API returned ${response.status}`);
  return response.json() as Promise<T>;
};

export const createRazorpayOrder = (amount: number, currency: string, receipt: string) =>
  apiRequest<RazorpayOrder>("/orders", { amount, currency, receipt, payment_capture: 1 }, `order-${receipt}`);

export const createRazorpayRefund = (paymentId: string, amount: number, receipt: string) =>
  apiRequest<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount, receipt }, `refund-${receipt}`, "X-Refund-Idempotency");

export const createRazorpayTransfer = async (paymentId: string, account: string, amount: number, receipt: string) => {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/transfers`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json", "X-Transfer-Idempotency": `transfer-${receipt}` },
    body: JSON.stringify({ transfers: [{ account, amount, currency: "INR", notes: { settlement_id: receipt } }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Razorpay transfer API returned ${response.status}`);
  const result = await response.json() as { items?: Array<{ id: string; status?: string; amount: number }> };
  const transfer = result.items?.[0];
  if (!transfer || transfer.amount !== amount || typeof transfer.id !== "string") throw new Error("Razorpay transfer response did not match settlement");
  return transfer;
};

const signatureMatches = (message: string, signature: string | undefined, secret: string | undefined) => {
  if (!signature || !secret || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const verifyRazorpayPaymentSignature = (orderId: string, paymentId: string, signature: string) =>
  signatureMatches(`${orderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET);

export const verifyRazorpayWebhookSignature = (rawBody: Buffer, signature: string | undefined) =>
  signatureMatches(rawBody.toString("utf8"), signature, process.env.RAZORPAY_WEBHOOK_SECRET);
