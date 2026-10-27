import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import OrderItem from "../models/OrderItem.js";
import OrderStatusHistory from "../models/OrderStatusHistory.js";
import Shipment from "../models/Shipment.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import VendorOrder from "../models/VendorOrder.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const suffix = new mongoose.Types.ObjectId().toString();
const emails = [`vendor-orders-${suffix}@test.invalid`, `vendor-orders-other-${suffix}@test.invalid`];

describe("Vendor Order Routes", () => {
  let vendorUser: any;
  let otherVendorUser: any;
  let vendor: any;
  let vendorToken: string;
  let customerToken: string;
  let vendorOrderId: string;
  let statusVendorOrderId: string;
  let noShipmentVendorOrderId: string;
  let foreignVendorOrderId: string;

  const getVendorOrders = (query = "", token?: string) => fetch(`${BASE_URL}/vendor-orders${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    await User.deleteMany({ email: { $in: emails } });
    [vendorUser, otherVendorUser] = await User.create([
      { name: "Vendor orders test", email: emails[0], password_hash: "unused", role: "vendor", status: "active" },
      { name: "Other vendor orders test", email: emails[1], password_hash: "unused", role: "vendor", status: "active" },
    ]);
    [vendor] = await Vendor.create([{
      user_id: vendorUser.id, name: "Vendor orders test", display_name: "Vendor orders test",
      address: "1 Test St", postal_code: "10000", kyc_status: "verified", commission_rate_bps: 0,
    }]);
    const otherVendor = await Vendor.create({
      user_id: otherVendorUser.id, name: "Other vendor", display_name: "Other vendor",
      address: "2 Test St", postal_code: "20000", kyc_status: "verified", commission_rate_bps: 0,
    });
    vendorToken = jwt.sign({ id: vendorUser.id, email: vendorUser.email, role: "vendor" }, JWT_SECRET);
    customerToken = jwt.sign({ id: vendorUser.id, email: vendorUser.email, role: "customer" }, JWT_SECRET);

    await VendorOrder.deleteMany({ vendor_id: { $in: [vendor.id, otherVendor.id] } });
    await OrderItem.deleteMany({ vendor_id: { $in: [vendor.id, otherVendor.id] } });
    const [newestOrder, statusOrder, noShipmentOrder, foreignOrder] = await VendorOrder.create([
      { order_id: `vendor-orders-newest-${suffix}`, vendor_id: vendor.id, status: "placed", created_at: new Date("2025-02-02") },
      { order_id: `vendor-orders-status-${suffix}`, vendor_id: vendor.id, status: "placed", created_at: new Date("2025-02-01") },
      { order_id: `vendor-orders-no-shipment-${suffix}`, vendor_id: vendor.id, status: "placed", created_at: new Date("2025-01-31") },
      { order_id: `vendor-orders-foreign-${suffix}`, vendor_id: otherVendor.id, status: "placed" },
    ]);
    vendorOrderId = newestOrder!.id;
    statusVendorOrderId = statusOrder!.id;
    noShipmentVendorOrderId = noShipmentOrder!.id;
    foreignVendorOrderId = foreignOrder!.id;
    await OrderItem.create({
      order_id: newestOrder!.order_id, product_id: new mongoose.Types.ObjectId().toString(), vendor_id: vendor.id,
      product_name: "Detail fixture item", sku: `DETAIL-${suffix}`, unit_price_paise: 1200, quantity: 2,
      discount_paise: 100, line_total_paise: 2300,
    });
    await Shipment.create({
      vendor_order_id: newestOrder!.id, carrier: "Test carrier", tracking_number: `TRACK-${suffix}`,
    });
    await OrderStatusHistory.create([
      {
        vendor_order_id: newestOrder!.id, previous_status: "placed", new_status: "packed",
        changed_by_user_id: vendorUser.id, created_at: new Date("2025-02-03T00:00:00.000Z"),
      },
      {
        vendor_order_id: newestOrder!.id, previous_status: "packed", new_status: "shipped",
        changed_by_user_id: vendorUser.id, created_at: new Date("2025-02-04T00:00:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    const users = await User.find({ email: { $in: emails } }).select("_id");
    const vendors = await Vendor.find({ user_id: { $in: users.map((user) => user.id) } }).select("_id");
    const vendorOrders = await VendorOrder.find({ vendor_id: { $in: vendors.map((item) => item.id) } }).select("_id");
    await OrderStatusHistory.deleteMany({ vendor_order_id: { $in: vendorOrders.map((item) => item.id) } });
    await Shipment.deleteMany({ vendor_order_id: { $in: vendorOrders.map((item) => item.id) } });
    await OrderItem.deleteMany({ vendor_id: { $in: vendors.map((item) => item.id) } });
    await VendorOrder.deleteMany({ vendor_id: { $in: vendors.map((item) => item.id) } });
    await Vendor.deleteMany({ user_id: { $in: users.map((user) => user.id) } });
    await User.deleteMany({ email: { $in: emails } });
    await mongoose.connection.close();
  });

  describe("GET /vendor-orders", () => {

    it("requires an authenticated vendor", async () => {
      expect((await getVendorOrders()).status).toBe(401);
      expect((await getVendorOrders("", "not-a-jwt")).status).toBe(401);
      expect((await getVendorOrders("", customerToken)).status).toBe(403);
    });

    it("returns only the vendor's orders newest first with default pagination", async () => {
      const response = await getVendorOrders("", vendorToken);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        orders: Array<{ order_id: string; vendor_id?: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(body.orders.map((order) => order.order_id)).toEqual([
        `vendor-orders-newest-${suffix}`, `vendor-orders-status-${suffix}`, `vendor-orders-no-shipment-${suffix}`,
      ]);
      expect(body.pagination).toEqual({ page: 1, limit: 20, total: 3, pages: 1 });
      expect(body.orders[0]).not.toHaveProperty("vendor_id");
    });

    it("paginates and rejects negative, malformed, repeated, and unsupported query parameters", async () => {
      const page = await getVendorOrders("?page=2&limit=1", vendorToken);
      expect(page.status).toBe(200);
      expect(await page.json()).toMatchObject({
        orders: [{ order_id: `vendor-orders-status-${suffix}` }],
        pagination: { page: 2, limit: 1, total: 3, pages: 3 },
      });

      for (const query of [
        "?page=0", "?page=-1", "?page=1.5", "?page=nope", "?page=", "?page=1&page=2",
        "?page=9007199254740992", "?limit=0", "?limit=101", "?limit=1.5", "?limit=nope",
        "?limit=", "?limit=1&limit=2", "?unexpected=true",
      ]) {
        expect((await getVendorOrders(query, vendorToken)).status, query).toBe(400);
      }
      expect((await getVendorOrders("?limit=100", vendorToken)).status).toBe(200);
    });
  });

  describe("GET /vendor-orders/:uuid", () => {
    it("returns the vendor-owned order, its items, and shipment details", async () => {
      const response = await fetch(`${BASE_URL}/vendor-orders/${vendorOrderId}`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      expect(response.status).toBe(200);
      const body = await response.json() as {
        id: string;
        order_id: string;
        status: string;
        items: Array<Record<string, unknown>>;
        shipment: { carrier?: string; tracking_number?: string } | null;
      };
      expect(body).toMatchObject({
        id: vendorOrderId,
        order_id: `vendor-orders-newest-${suffix}`,
        status: "placed",
        items: [{
          product_name: "Detail fixture item", sku: `DETAIL-${suffix}`, unit_price_paise: 1200,
          quantity: 2, discount_paise: 100, line_total_paise: 2300,
        }],
        shipment: { carrier: "Test carrier", tracking_number: `TRACK-${suffix}` },
      });
      expect(body).not.toHaveProperty("vendor_id");
    });

    it("rejects missing auth, invalid IDs, missing orders, and orders owned by another vendor", async () => {
      expect((await fetch(`${BASE_URL}/vendor-orders/${vendorOrderId}`)).status).toBe(401);
      expect((await fetch(`${BASE_URL}/vendor-orders/not-an-id`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(400);
      expect((await fetch(`${BASE_URL}/vendor-orders/${new mongoose.Types.ObjectId()}`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(404);
      expect((await fetch(`${BASE_URL}/vendor-orders/${foreignVendorOrderId}`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(404);
    });
  });

  describe("PATCH /vendor-orders/:uuid/status", () => {
    const updateStatus = (uuid: string, body: unknown, token?: string) => fetch(`${BASE_URL}/vendor-orders/${uuid}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    it("advances status and records who made the change", async () => {
      const response = await updateStatus(statusVendorOrderId, { status: "packed" }, vendorToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id: statusVendorOrderId, status: "packed" });
      const history = await OrderStatusHistory.find({ vendor_order_id: statusVendorOrderId }).lean();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        previous_status: "placed", new_status: "packed", changed_by_user_id: vendorUser.id,
      });
    });

    it("rejects missing auth, invalid IDs and bodies, and out-of-order transitions", async () => {
      expect((await updateStatus(statusVendorOrderId, { status: "shipped" })).status).toBe(401);
      expect((await updateStatus("invalid-id", { status: "packed" }, vendorToken)).status).toBe(400);
      for (const body of [{}, { status: "unknown" }, { status: "placed" }, { status: "packed", extra: true }]) {
        expect((await updateStatus(statusVendorOrderId, body, vendorToken)).status).toBe(400);
      }
      expect((await updateStatus(statusVendorOrderId, { status: "delivered" }, vendorToken)).status).toBe(409);
    });

    it("hides missing and other vendors' orders", async () => {
      expect((await updateStatus(new mongoose.Types.ObjectId().toString(), { status: "packed" }, vendorToken)).status).toBe(404);
      expect((await updateStatus(foreignVendorOrderId, { status: "packed" }, vendorToken)).status).toBe(404);
    });
  });

  describe("POST /vendor-orders/:uuid/shipment", () => {
    const createShipment = (uuid: string, body: unknown, token?: string) => fetch(`${BASE_URL}/vendor-orders/${uuid}/shipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    it("creates tracking details for the vendor's order", async () => {
      const response = await createShipment(statusVendorOrderId, {
        carrier: "New carrier", tracking_number: `NEW-${suffix}`,
        tracking_url: `https://tracking.example.test/${suffix}`, shipped_at: "2026-01-02T03:04:05.000Z",
      }, vendorToken);
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        shipment: {
          carrier: "New carrier", tracking_number: `NEW-${suffix}`,
          tracking_url: `https://tracking.example.test/${suffix}`, shipped_at: "2026-01-02T03:04:05.000Z",
        },
      });
    });

    it("rejects missing auth, invalid IDs and bodies, duplicate shipments, and foreign orders", async () => {
      expect((await createShipment(statusVendorOrderId, { tracking_number: "T-1" })).status).toBe(401);
      expect((await createShipment("bad-id", { tracking_number: "T-1" }, vendorToken)).status).toBe(400);
      for (const body of [{}, { carrier: "Carrier" }, { tracking_number: " " }, { tracking_number: "T-1", tracking_url: "javascript:bad" }, { tracking_number: "T-1", extra: true }]) {
        expect((await createShipment(statusVendorOrderId, body, vendorToken)).status).toBe(400);
      }
      expect((await createShipment(statusVendorOrderId, { tracking_number: "T-2" }, vendorToken)).status).toBe(409);
      expect((await createShipment(foreignVendorOrderId, { tracking_number: "T-3" }, vendorToken)).status).toBe(404);
    });
  });

  describe("PATCH /vendor-orders/:uuid/shipment", () => {
    const updateShipment = (uuid: string, body: unknown, token?: string) => fetch(`${BASE_URL}/vendor-orders/${uuid}/shipment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    it("updates existing tracking details", async () => {
      const response = await updateShipment(statusVendorOrderId, {
        tracking_number: `UPDATED-${suffix}`, delivered_at: "2026-02-03T04:05:06.000Z",
      }, vendorToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        shipment: { carrier: "New carrier", tracking_number: `UPDATED-${suffix}`, delivered_at: "2026-02-03T04:05:06.000Z" },
      });
    });

    it("rejects missing auth, invalid IDs and bodies, missing shipments, and foreign orders", async () => {
      expect((await updateShipment(statusVendorOrderId, { tracking_number: "T-1" })).status).toBe(401);
      expect((await updateShipment("bad-id", { tracking_number: "T-1" }, vendorToken)).status).toBe(400);
      for (const body of [{}, { tracking_number: " " }, { tracking_url: "not-a-url" }, { carrier: "Carrier", extra: true }]) {
        expect((await updateShipment(statusVendorOrderId, body, vendorToken)).status).toBe(400);
      }
      expect((await updateShipment(noShipmentVendorOrderId, { tracking_number: "T-1" }, vendorToken)).status).toBe(404);
      expect((await updateShipment(foreignVendorOrderId, { tracking_number: "T-1" }, vendorToken)).status).toBe(404);
    });
  });

  describe("GET /vendor-orders/:uuid/history", () => {
    it("returns status changes in chronological order without exposing actor IDs", async () => {
      const response = await fetch(`${BASE_URL}/vendor-orders/${vendorOrderId}/history`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      expect(response.status).toBe(200);
      const body = await response.json() as {
        history: Array<{ previous_status: string | null; new_status: string; created_at: string; changed_by_user_id?: string }>;
      };
      expect(body.history).toHaveLength(2);
      expect(body.history.map((event: { new_status: string }) => event.new_status)).toEqual(["packed", "shipped"]);
      expect(body.history[0]).toMatchObject({
        previous_status: "placed", new_status: "packed", created_at: "2025-02-03T00:00:00.000Z",
      });
      expect(body.history[0]).not.toHaveProperty("changed_by_user_id");
    });

    it("returns an empty list for orders without status changes", async () => {
      const response = await fetch(`${BASE_URL}/vendor-orders/${noShipmentVendorOrderId}/history`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ history: [] });
    });

    it("rejects missing auth and invalid IDs, and hides missing or foreign orders", async () => {
      expect((await fetch(`${BASE_URL}/vendor-orders/${vendorOrderId}/history`)).status).toBe(401);
      expect((await fetch(`${BASE_URL}/vendor-orders/not-an-id/history`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(400);
      expect((await fetch(`${BASE_URL}/vendor-orders/${new mongoose.Types.ObjectId()}/history`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(404);
      expect((await fetch(`${BASE_URL}/vendor-orders/${foreignVendorOrderId}/history`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      })).status).toBe(404);
    });
  });
});
