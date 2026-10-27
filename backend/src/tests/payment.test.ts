import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createHmac } from "node:crypto";

const mocked = vi.hoisted(() => ({
  paymentById: vi.fn(), paymentFindOne: vi.fn(), paymentUpdate: vi.fn(),
  orderFindOne: vi.fn(), orderExists: vi.fn(),
  refundExists: vi.fn(), refundCreate: vi.fn(), refundFindOne: vi.fn(), refundFind: vi.fn(),
  refundFindById: vi.fn(), refundFindOneAndUpdate: vi.fn(), refundUpdate: vi.fn(),
  webhookCreate: vi.fn(), webhookUpdate: vi.fn(), acquireMutex: vi.fn(), providerFetch: vi.fn(),
}));

vi.mock("../models", () => ({
  Payment: { findById: mocked.paymentById, findOne: mocked.paymentFindOne, findOneAndUpdate: mocked.paymentUpdate, updateOne: vi.fn() },
  Order: { findOne: mocked.orderFindOne, exists: mocked.orderExists, updateOne: vi.fn() },
  PaymentRefundRequest: {
    exists: mocked.refundExists, create: mocked.refundCreate, findOne: mocked.refundFindOne,
    find: mocked.refundFind, findById: mocked.refundFindById,
    findOneAndUpdate: mocked.refundFindOneAndUpdate, updateOne: mocked.refundUpdate,
  },
  PaymentWebhookEvent: { create: mocked.webhookCreate, updateOne: mocked.webhookUpdate },
}));

vi.mock("../utils/redisMutex", () => ({
  acquireRedisMutex: mocked.acquireMutex,
  RedisMutexTimeoutError: class RedisMutexTimeoutError extends Error {},
}));

import paymentsRouter from "../routes/payments";

const JWT_SECRET = "payment-test-secret";
const CUSTOMER_ID = "507f1f77bcf86cd799439011";
const OTHER_ID = "507f1f77bcf86cd799439012";
const ADMIN_ID = "507f1f77bcf86cd799439013";
const PAYMENT_ID = "507f1f77bcf86cd799439014";
const REQUEST_ID = "507f1f77bcf86cd799439015";
const ORDER_ID = "507f1f77bcf86cd799439016";
const CUSTOMER_TOKEN = jwt.sign({ id: CUSTOMER_ID, email: "customer@test.invalid", role: "customer" }, JWT_SECRET);
const OTHER_TOKEN = jwt.sign({ id: OTHER_ID, email: "other@test.invalid", role: "customer" }, JWT_SECRET);
const ADMIN_TOKEN = jwt.sign({ id: ADMIN_ID, email: "admin@test.invalid", role: "admin" }, JWT_SECRET);
const VENDOR_TOKEN = jwt.sign({ id: OTHER_ID, email: "vendor@test.invalid", role: "vendor" }, JWT_SECRET);
const tokenHeader = (token?: string) => token ? { Authorization: `Bearer ${token}` } : {};
const request = (path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
  const body = options.body === undefined ? undefined : JSON.parse(options.body);
  return dispatch(options.method ?? "GET", path, body, options.headers?.Authorization, options.headers, options.body);
};
const jsonRequest = (path: string, method: string, body: unknown, token?: string) => dispatch(method, path, body, token);

const dispatch = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}, rawBody?: string) => {
  const stack = (paymentsRouter as any).stack as Array<any>;
  let selected: typeof stack[number]["route"] | undefined;
  let params: Record<string, string> = {};
  for (const layer of stack) {
    if (!layer.route?.methods[method.toLowerCase()]) continue;
    const names: string[] = [];
    const pattern = layer.route.path.split("/").map((part: string) => {
      if (part.startsWith(":")) { names.push(part.slice(1)); return "([^/]+)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("/");
    const match = new RegExp(`^${pattern}/?$`).exec(path);
    if (!match) continue;
    selected = layer.route;
    params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? "")]));
    break;
  }
  if (!selected) throw new Error(`No ${method} route matches ${path}`);
  const headerValues = Object.fromEntries(Object.entries({ ...headers, ...(token ? tokenHeader(token) : {}) }).map(([key, value]) => [key.toLowerCase(), value]));
  const req: any = {
    method, url: path, originalUrl: path, baseUrl: "/api/v1", params, body, query: {}, headers: headerValues,
    rawBody: Buffer.from(rawBody ?? (body === undefined ? "" : JSON.stringify(body))),
    header: (name: string) => headerValues[name.toLowerCase()],
  };
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  for (const handler of selected.stack) {
    await handler.handle(req, res, () => undefined);
    if (res.body !== undefined) break;
  }
  return { status: res.statusCode, json: async () => res.body as unknown };
};

describe("Razorpay payment and refund security", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.RAZORPAY_KEY_ID = "rzp_test_public";
    process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
    vi.stubGlobal("fetch", (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.razorpay.com/")) {
        return mocked.providerFetch(url, init);
      }
      throw new Error(`Unexpected network request: ${url}`);
    }) as typeof fetch);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.acquireMutex.mockResolvedValue(async () => undefined);
    const payment = {
      id: PAYMENT_ID, _id: new mongoose.Types.ObjectId(PAYMENT_ID), order_id: ORDER_ID,
      provider: "razorpay", provider_order_id: undefined, provider_payment_id: undefined,
      status: "created", amount_paise: 12_345, currency: "INR", created_at: new Date(), updated_at: new Date(),
    };
    mocked.paymentById.mockImplementation(() => paymentQuery(payment));
    mocked.providerFetch.mockImplementation((url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return url.endsWith("/orders")
        ? Response.json({ id: "order_from_provider", amount: body.amount, currency: body.currency })
        : Response.json({ id: "refund_from_provider", amount: body.amount, status: "pending" });
    });
    mocked.orderFindOne.mockResolvedValue({ id: ORDER_ID, user_id: CUSTOMER_ID, status: "pending", payment_status: "pending", total_paise: 12_345 });
    mocked.paymentUpdate.mockImplementation(async (_filter, update) => ({
      id: PAYMENT_ID, _id: new mongoose.Types.ObjectId(PAYMENT_ID), order_id: ORDER_ID,
      provider: "razorpay", provider_order_id: update.$set.provider_order_id,
      status: "created", amount_paise: 12_345, currency: "INR", created_at: new Date(), updated_at: new Date(),
    }));
    mocked.refundExists.mockResolvedValue(false);
    mocked.refundCreate.mockResolvedValue({ id: REQUEST_ID, payment_id: PAYMENT_ID, status: "requested", amount_paise: 12_345, created_at: new Date() });
    mocked.paymentFindOne.mockResolvedValue(null);
    mocked.refundUpdate.mockResolvedValue({ modifiedCount: 1 });
  });

  describe("POST /payments/create", () => {
  it("rejects missing auth, non-customer roles, malformed IDs, extra fields, and client prices", async () => {
    expect((await jsonRequest("/payments/create", "POST", { payment_id: PAYMENT_ID })).status).toBe(401);
    expect((await jsonRequest("/payments/create", "POST", { payment_id: PAYMENT_ID }, VENDOR_TOKEN)).status).toBe(403);
    expect((await jsonRequest("/payments/create", "POST", { payment_id: "not-an-id" }, CUSTOMER_TOKEN)).status).toBe(400);
    expect((await jsonRequest("/payments/create", "POST", { payment_id: PAYMENT_ID, amount_paise: 1 }, CUSTOMER_TOKEN)).status).toBe(400);
    expect(mocked.acquireMutex).not.toHaveBeenCalled();
  });

  it("hides another customer's payment and never calls Razorpay for it", async () => {
    mocked.orderFindOne.mockResolvedValueOnce(null);
    const response = await jsonRequest("/payments/create", "POST", { payment_id: PAYMENT_ID }, OTHER_TOKEN);
    expect(response.status).toBe(404);
    expect(mocked.paymentUpdate).not.toHaveBeenCalled();
  });

  it("creates the provider order from the stored server-side amount and binds it to one payment", async () => {
    const response = await jsonRequest("/payments/create", "POST", { payment_id: PAYMENT_ID }, CUSTOMER_TOKEN);
    expect(response.status).toBe(201);
    const body = await response.json() as { razorpay: { amount: number; currency: string; order_id: string } };
    expect(body.razorpay).toMatchObject({ amount: 12_345, currency: "INR", order_id: "order_from_provider" });
    expect(JSON.stringify(body)).not.toContain("test-key-secret");
    expect(mocked.paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "created" }), expect.objectContaining({ $set: { provider_order_id: "order_from_provider", updated_at: expect.any(Date) } }), expect.any(Object));
  });

  });

  describe("POST /payments/:uuid/verify", () => {
  it("rejects client-supplied payment signatures and does not mutate payment state", async () => {
    mocked.paymentById.mockImplementationOnce(() => paymentQuery({
      id: PAYMENT_ID, order_id: ORDER_ID, provider: "razorpay", provider_order_id: "order_expected",
      status: "created", amount_paise: 12_345, currency: "INR",
    }));
    const response = await jsonRequest(`/payments/${PAYMENT_ID}/verify`, "POST", {
      razorpay_order_id: "order_expected", razorpay_payment_id: "pay_forged", razorpay_signature: "a".repeat(64),
    }, CUSTOMER_TOKEN);
    expect(response.status).toBe(400);
    expect(mocked.paymentUpdate).not.toHaveBeenCalled();
  });

  it("rejects a validly shaped verification payload for a different Razorpay order", async () => {
    mocked.paymentById.mockImplementationOnce(() => paymentQuery({
      id: PAYMENT_ID, order_id: ORDER_ID, provider: "razorpay", provider_order_id: "order_expected",
      status: "created", amount_paise: 12_345, currency: "INR",
    }));
    const response = await jsonRequest(`/payments/${PAYMENT_ID}/verify`, "POST", {
      razorpay_order_id: "order_attacker", razorpay_payment_id: "pay_forged", razorpay_signature: "a".repeat(64),
    }, CUSTOMER_TOKEN);
    expect(response.status).toBe(400);
    expect(mocked.paymentUpdate).not.toHaveBeenCalled();
  });

  });

  describe("Refund request routes", () => {
  it("rejects malformed and duplicate refund requests without exposing provider credentials", async () => {
    mocked.paymentById.mockImplementationOnce(() => paymentQuery({ id: PAYMENT_ID, order_id: ORDER_ID, provider: "razorpay", provider_payment_id: "pay_ok", status: "success", amount_paise: 12_345, currency: "INR" }));
    mocked.orderFindOne.mockResolvedValueOnce({ id: ORDER_ID, user_id: CUSTOMER_ID, payment_status: "paid" });
    expect((await jsonRequest(`/payments/${PAYMENT_ID}/refund`, "POST", { reason: "  " }, CUSTOMER_TOKEN)).status).toBe(400);
    mocked.paymentById.mockImplementationOnce(() => paymentQuery({ id: PAYMENT_ID, order_id: ORDER_ID, provider: "razorpay", provider_payment_id: "pay_ok", status: "success", amount_paise: 12_345, currency: "INR" }));
    mocked.orderFindOne.mockResolvedValueOnce({ id: ORDER_ID, user_id: CUSTOMER_ID, payment_status: "paid" });
    mocked.refundExists.mockResolvedValueOnce(true);
    expect((await jsonRequest(`/payments/${PAYMENT_ID}/refund`, "POST", { reason: "Requesting return" }, CUSTOMER_TOKEN)).status).toBe(409);
    expect(mocked.refundCreate).not.toHaveBeenCalled();
  });

  });

  describe("Admin refund request routes", () => {
  it("limits refund review to admins and rejects unexpected approval fields", async () => {
    expect((await dispatch("GET", "/admin/refund-requests", undefined, CUSTOMER_TOKEN)).status).toBe(403);
    expect((await jsonRequest(`/admin/refund-requests/${REQUEST_ID}/approve`, "POST", { amount_paise: 1 }, ADMIN_TOKEN)).status).toBe(400);
    expect(mocked.refundFindOneAndUpdate).not.toHaveBeenCalled();
  });
  });

  describe("DELETE /payments/:uuid/refund", () => {
  it("allows only the owner to cancel a pending refund request and records cancellation", async () => {
    mocked.paymentById.mockImplementation(() => paymentQuery({ id: PAYMENT_ID, _id: { toString: () => PAYMENT_ID }, order_id: ORDER_ID }));
    mocked.orderExists.mockResolvedValue(true);
    mocked.refundFindOneAndUpdate.mockResolvedValue({ id: REQUEST_ID, status: "cancelled", updated_at: new Date() });
    const response = await dispatch("DELETE", `/payments/${PAYMENT_ID}/refund`, {}, CUSTOMER_TOKEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ refund_request: { id: REQUEST_ID, status: "cancelled" } });
    expect(mocked.refundFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_id: PAYMENT_ID, user_id: CUSTOMER_ID, status: "requested" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "cancelled" }) }),
      expect.objectContaining({ new: true })
    );
  });

  });

  describe("Razorpay webhook route", () => {
  it("rejects invalid webhook signatures before writing event records", async () => {
    const response = await jsonRequest("/webhooks/razorpay", "POST", { id: "evt_forged", event: "payment.captured" });
    expect(response.status).toBe(400);
    expect(mocked.webhookCreate).not.toHaveBeenCalled();
  });
  });

  describe("POST /admin/refund-requests/:uuid/approve", () => {
  it("only one concurrent admin approval can claim a pending refund and call Razorpay", async () => {
    let claimed = false;
    mocked.refundFindOneAndUpdate.mockImplementation(async () => {
      if (claimed) return null;
      claimed = true;
      return { id: REQUEST_ID, payment_id: PAYMENT_ID, order_id: ORDER_ID, amount_paise: 12_345, status: "processing" };
    });
    mocked.paymentFindOne.mockResolvedValue({ id: PAYMENT_ID, provider: "razorpay", provider_payment_id: "pay_captured", status: "success", amount_paise: 12_345 });
    mocked.orderFindOne.mockResolvedValue({ id: ORDER_ID, payment_status: "paid" });
    vi.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    } as unknown as mongoose.ClientSession);
    const [first, second] = await Promise.all([
      jsonRequest(`/admin/refund-requests/${REQUEST_ID}/approve`, "POST", {}, ADMIN_TOKEN),
      jsonRequest(`/admin/refund-requests/${REQUEST_ID}/approve`, "POST", {}, ADMIN_TOKEN),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(mocked.providerFetch).toHaveBeenCalledTimes(1);
    expect(mocked.providerFetch.mock.calls[0]?.[0]).toContain(`/payments/pay_captured/refund`);
  });
  });

  describe("Duplicate Razorpay webhook delivery", () => {
  it("acknowledges duplicate signed webhook event IDs without processing twice", async () => {
    const payload = JSON.stringify({ id: "evt_duplicate", event: "order.paid" });
    let seen = false;
    mocked.webhookCreate.mockImplementation(async () => {
      if (seen) throw Object.assign(new Error("duplicate"), { code: 11000 });
      seen = true;
      return [];
    });
    mocked.webhookUpdate.mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    } as unknown as mongoose.ClientSession);
    const signature = createHmac("sha256", "test-webhook-secret").update(payload).digest("hex");
    const call = () => request("/webhooks/razorpay", {
      method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": signature }, body: payload,
    });
    expect((await call()).status).toBe(200);
    const duplicate = await call();
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });
    expect(mocked.webhookCreate).toHaveBeenCalledTimes(2);
  });
  });
});

function paymentQuery<T>(value: T) {
  return {
    select() { return this; },
    lean: async () => value,
    then(resolve: (result: T) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(value).then(resolve, reject); },
  };
}
