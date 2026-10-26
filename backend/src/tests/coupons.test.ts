import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Coupon, { ICoupon } from "../models/Coupon.js";
import CouponRedemption from "../models/CouponRedemption.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const TEST_PREFIX = "COUPONS-GET-ROUTE-TEST";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const CUSTOMER_TOKEN = jwt.sign({ id: CUSTOMER_ID, email: "coupon-history@test.invalid", role: "customer" }, JWT_SECRET);
const OTHER_CUSTOMER_TOKEN = jwt.sign({ id: OTHER_CUSTOMER_ID, email: "other-coupon-history@test.invalid", role: "customer" }, JWT_SECRET);
const VENDOR_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "coupon-vendor@test.invalid", role: "vendor" }, JWT_SECRET);
const EMPTY_CUSTOMER_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "empty-coupon-history@test.invalid", role: "customer" }, JWT_SECRET);
const validateCouponRequest = (body: unknown) => fetch(`${BASE_URL}/coupons/validate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const getUserCoupons = (query = "", token?: string) => fetch(`${BASE_URL}/users/me/coupons${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

describe("Coupon routes", () => {
  let activeCoupons: ICoupon[];
  let unavailableCoupons: ICoupon[];

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const existingCoupons = await Coupon.find({ code: new RegExp(`^${TEST_PREFIX}`) }).select("_id");
    await CouponRedemption.deleteMany({ coupon_id: { $in: existingCoupons.map((coupon) => coupon.id) } });
    await Coupon.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`) });
    const now = Date.now();
    activeCoupons = await Coupon.create([
      {
        code: `${TEST_PREFIX}-EARLIER`, discount_type: "percentage", discount_value: 10,
        max_discount_paise: 5000, min_order_paise: 10000, usage_limit: 25,
        starts_at: new Date(now - 60_000), expires_at: new Date(now + 60 * 60_000), is_active: true,
      },
      {
        code: `${TEST_PREFIX}-LATER`, discount_type: "fixed", discount_value: 500,
        starts_at: new Date(now - 60_000), expires_at: new Date(now + 2 * 60 * 60_000), is_active: true,
      },
    ]);
    unavailableCoupons = await Coupon.create([
      {
        code: `${TEST_PREFIX}-INACTIVE`, discount_type: "fixed", discount_value: 100,
        starts_at: new Date(now - 60_000), expires_at: new Date(now + 60 * 60_000), is_active: false,
      },
      {
        code: `${TEST_PREFIX}-NOT-STARTED`, discount_type: "percentage", discount_value: 15,
        starts_at: new Date(now + 60 * 60_000), expires_at: new Date(now + 2 * 60 * 60_000), is_active: true,
      },
      {
        code: `${TEST_PREFIX}-EXPIRED`, discount_type: "percentage", discount_value: 15,
        starts_at: new Date(now - 2 * 60 * 60_000), expires_at: new Date(now - 60_000), is_active: true,
      },
    ]);
    const exhaustedCoupon = await Coupon.create({
      code: `${TEST_PREFIX}-EXHAUSTED`, discount_type: "fixed", discount_value: 100,
      starts_at: new Date(now - 60_000), expires_at: new Date(now + 60 * 60_000),
      is_active: true, usage_limit: 1,
    });
    await CouponRedemption.create({
      coupon_id: exhaustedCoupon.id,
      user_id: new mongoose.Types.ObjectId().toString(),
      order_id: new mongoose.Types.ObjectId().toString(),
      discount_paise: 100,
    });
    await CouponRedemption.create([
      {
        coupon_id: activeCoupons[0]!.id, user_id: CUSTOMER_ID,
        order_id: new mongoose.Types.ObjectId().toString(), discount_paise: 1000,
        redeemed_at: new Date("2024-01-01T00:00:00Z"),
      },
      {
        coupon_id: activeCoupons[1]!.id, user_id: CUSTOMER_ID,
        order_id: new mongoose.Types.ObjectId().toString(), discount_paise: 500,
        redeemed_at: new Date("2025-01-01T00:00:00Z"),
      },
      {
        coupon_id: new mongoose.Types.ObjectId().toString(), user_id: CUSTOMER_ID,
        order_id: new mongoose.Types.ObjectId().toString(), discount_paise: 250,
        redeemed_at: new Date("2026-01-01T00:00:00Z"),
      },
      {
        coupon_id: activeCoupons[0]!.id, user_id: OTHER_CUSTOMER_ID,
        order_id: new mongoose.Types.ObjectId().toString(), discount_paise: 999,
        redeemed_at: new Date("2026-02-01T00:00:00Z"),
      },
    ]);
  });

  afterAll(async () => {
    await CouponRedemption.deleteMany({ user_id: { $in: [CUSTOMER_ID, OTHER_CUSTOMER_ID] } });
    const testCoupons = await Coupon.find({ code: new RegExp(`^${TEST_PREFIX}`) }).select("_id");
    await CouponRedemption.deleteMany({ coupon_id: { $in: testCoupons.map((coupon) => coupon.id) } });
    await Coupon.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`) });
    await mongoose.connection.close();
  });

  describe("GET /coupons", () => {
    it("lists only active coupons within their validity window, ordered by expiry", async () => {
      const response = await fetch(`${BASE_URL}/coupons`);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        coupons: Array<Record<string, unknown> & { id: string; code: string }>;
        pagination: { page: number; limit: number; total: number; total_pages: number };
      };
      const activeCodes = new Set(activeCoupons.map((coupon) => coupon.code));
      const returned = body.coupons.filter((coupon) => activeCodes.has(coupon.code));

      expect(returned.map((coupon) => coupon.code)).toEqual([
        `${TEST_PREFIX}-EARLIER`, `${TEST_PREFIX}-LATER`,
      ]);
      for (const coupon of unavailableCoupons) {
        expect(body.coupons.some((item) => item.id === coupon.id)).toBe(false);
      }
      expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(returned[0]).toMatchObject({
        id: activeCoupons[0]!.id,
        code: activeCoupons[0]!.code,
        discount_type: "percentage",
        discount_value: 10,
        max_discount_paise: 5000,
        min_order_paise: 10000,
        usage_limit: 25,
      });
      expect(returned[1]).toMatchObject({ discount_type: "fixed", discount_value: 500 });
      for (const coupon of returned) {
        expect(coupon).not.toHaveProperty("_id");
        expect(coupon).not.toHaveProperty("__v");
      }
    });

    it("paginates and returns an empty page beyond the last result", async () => {
      const allResponse = await fetch(`${BASE_URL}/coupons?limit=100`);
      expect(allResponse.status).toBe(200);
      const allBody = await allResponse.json() as { coupons: Array<{ code: string }> };

      const first = await fetch(`${BASE_URL}/coupons?limit=1&page=1`);
      expect(first.status).toBe(200);
      const firstBody = await first.json() as {
        coupons: Array<{ code: string }>;
        pagination: { page: number; limit: number; total: number; total_pages: number };
      };
      expect(firstBody.coupons[0]?.code).toBe(allBody.coupons[0]?.code);
      expect(firstBody.pagination).toMatchObject({ page: 1, limit: 1, total_pages: expect.any(Number) });
      expect(firstBody.pagination.total).toBeGreaterThanOrEqual(2);

      const beyond = await fetch(`${BASE_URL}/coupons?limit=1&page=999999`);
      expect(beyond.status).toBe(200);
      const beyondBody = await beyond.json() as { coupons: unknown[]; pagination: { page: number; total: number } };
      expect(beyondBody.coupons).toEqual([]);
      expect(beyondBody.pagination).toMatchObject({ page: 999999, total: firstBody.pagination.total });
    });

    it("rejects invalid pagination, duplicate values, and unknown query parameters", async () => {
      for (const query of [
        "?page=0", "?page=-1", "?page=1.5", "?page=nope", "?page=", "?page=1&page=2",
        "?limit=0", "?limit=101", "?limit=1.5", "?limit=nope", "?limit=", "?limit=1&limit=2",
        "?unexpected=true",
      ]) {
        const response = await fetch(`${BASE_URL}/coupons${query}`);
        expect(response.status, query).toBe(400);
      }

      const maxLimit = await fetch(`${BASE_URL}/coupons?limit=100`);
      expect(maxLimit.status).toBe(200);
    });
  });

  describe("GET /coupons/:uuid", () => {
    it("returns a currently available coupon by ID without Mongo internal fields", async () => {
      const coupon = activeCoupons[0]!;
      const response = await fetch(`${BASE_URL}/coupons/${coupon.id}`);
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        id: coupon.id,
        code: coupon.code,
        discount_type: "percentage",
        discount_value: 10,
        max_discount_paise: 5000,
        min_order_paise: 10000,
        usage_limit: 25,
        is_active: true,
      });
      expect(body).not.toHaveProperty("_id");
      expect(body).not.toHaveProperty("__v");
    });

    it("rejects malformed IDs and hides unavailable or missing coupons", async () => {
      for (const id of ["not-an-id", "123", "507f1f77bcf86cd79943901g"]) {
        const response = await fetch(`${BASE_URL}/coupons/${id}`);
        expect(response.status, id).toBe(400);
      }

      const missing = await fetch(`${BASE_URL}/coupons/${new mongoose.Types.ObjectId()}`);
      expect(missing.status).toBe(404);

      for (const coupon of unavailableCoupons) {
        const response = await fetch(`${BASE_URL}/coupons/${coupon.id}`);
        expect(response.status, coupon.code).toBe(404);
      }
    });
  });

  describe("POST /coupons/validate", () => {
    it("calculates percentage and fixed discounts with caps and case-insensitive codes", async () => {
      const percentage = await validateCouponRequest({
        code: ` ${activeCoupons[0]!.code.toLowerCase()} `,
        subtotal_paise: 20_000,
      });
      expect(percentage.status).toBe(200);
      expect(await percentage.json()).toMatchObject({
        valid: true,
        coupon_id: activeCoupons[0]!.id,
        code: activeCoupons[0]!.code,
        discount_paise: 2_000,
      });

      const capped = await validateCouponRequest({ code: activeCoupons[0]!.code, subtotal_paise: 100_000 });
      expect(await capped.json()).toMatchObject({ valid: true, discount_paise: 5_000 });

      const fixed = await validateCouponRequest({ code: activeCoupons[1]!.code, subtotal_paise: 300 });
      expect(await fixed.json()).toMatchObject({ valid: true, discount_paise: 300 });
    });

    it("returns invalid for unknown, unavailable, below-minimum, and exhausted coupons", async () => {
      const cases: Array<{ code: string; subtotal_paise: number; message: string }> = [
        { code: `${TEST_PREFIX}-MISSING`, subtotal_paise: 20_000, message: "Coupon not found" },
        { code: unavailableCoupons[0]!.code, subtotal_paise: 20_000, message: "Coupon is inactive" },
        { code: unavailableCoupons[1]!.code, subtotal_paise: 20_000, message: "Coupon is not active yet" },
        { code: unavailableCoupons[2]!.code, subtotal_paise: 20_000, message: "Coupon has expired" },
        { code: activeCoupons[0]!.code, subtotal_paise: 9_999, message: "Order does not meet the minimum amount" },
        { code: `${TEST_PREFIX}-EXHAUSTED`, subtotal_paise: 20_000, message: "Coupon usage limit has been reached" },
      ];

      for (const payload of cases) {
        const { code, subtotal_paise, message } = payload;
        const response = await validateCouponRequest({ code, subtotal_paise });
        const responseBody = await response.json();
        expect(response.status, `${payload.code}: ${JSON.stringify(responseBody)}`).toBe(200);
        expect(responseBody, payload.code).toMatchObject({ valid: false, message });
      }
    });

    it("rejects malformed bodies, invalid amounts, and unknown fields", async () => {
      for (const body of [
        null,
        [],
        {},
        { code: "", subtotal_paise: 100 },
        { code: "   ", subtotal_paise: 100 },
        { code: "VALID", subtotal_paise: -1 },
        { code: "VALID", subtotal_paise: 1.5 },
        { code: "VALID", subtotal_paise: Number.MAX_SAFE_INTEGER + 1 },
        { code: "VALID", subtotal_paise: 100, extra: true },
      ]) {
        const response = await validateCouponRequest(body);
        expect(response.status).toBe(400);
      }
    });
  });

  describe("GET /users/me/coupons", () => {
    it("returns only the customer's redemption history, newest first", async () => {
      const response = await getUserCoupons("", CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        coupons: Array<{ coupon_id: string; code: string | null; discount_paise: number; redeemed_at: string }>;
        pagination: { page: number; limit: number; total: number; total_pages: number };
      };
      expect(body.coupons).toHaveLength(3);
      expect(body.coupons.map((coupon) => coupon.redeemed_at)).toEqual(
        [...body.coupons.map((coupon) => coupon.redeemed_at)].sort().reverse(),
      );
      expect(body.coupons[0]).toMatchObject({ code: null, discount_paise: 250 });
      expect(body.coupons[1]).toMatchObject({ code: activeCoupons[1]!.code, discount_paise: 500 });
      expect(body.coupons[2]).toMatchObject({ code: activeCoupons[0]!.code, discount_paise: 1000 });
      expect(body.pagination).toEqual({ page: 1, limit: 20, total: 3, total_pages: 1 });
      expect(body.coupons[0]).not.toHaveProperty("_id");
      expect(body.coupons[0]).not.toHaveProperty("user_id");
      expect(body.coupons[0]).not.toHaveProperty("__v");
    });

    it("requires customer authentication and returns an empty history when appropriate", async () => {
      expect((await getUserCoupons()).status).toBe(401);
      expect((await getUserCoupons("", "invalid-token")).status).toBe(401);
      expect((await getUserCoupons("", VENDOR_TOKEN)).status).toBe(403);

      const empty = await getUserCoupons("", EMPTY_CUSTOMER_TOKEN);
      expect(empty.status).toBe(200);
      expect(await empty.json()).toEqual({
        coupons: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
      });
    });

    it("paginates independently and rejects invalid or unsupported query parameters", async () => {
      const page = await getUserCoupons("?page=2&limit=1", CUSTOMER_TOKEN);
      expect(page.status).toBe(200);
      expect(await page.json()).toMatchObject({
        coupons: [{ code: activeCoupons[1]!.code, discount_paise: 500 }],
        pagination: { page: 2, limit: 1, total: 3, total_pages: 3 },
      });

      const beyond = await getUserCoupons("?page=4&limit=1", CUSTOMER_TOKEN);
      expect(await beyond.json()).toMatchObject({
        coupons: [], pagination: { page: 4, limit: 1, total: 3, total_pages: 3 },
      });

      for (const query of [
        "?page=0", "?page=-1", "?page=1.5", "?page=nope", "?page=", "?page=1&page=2",
        "?page=9007199254740992", "?limit=0", "?limit=101", "?limit=1.5", "?limit=nope",
        "?limit=", "?limit=1&limit=2", "?unexpected=true",
      ]) {
        const invalid = await getUserCoupons(query, CUSTOMER_TOKEN);
        expect(invalid.status, query).toBe(400);
      }

      expect((await getUserCoupons("?limit=100", CUSTOMER_TOKEN)).status).toBe(200);
    });
  });
});
