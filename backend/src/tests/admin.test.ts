import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { AdminAuditLog, Category, User, Vendor, VendorKyc } from "../models";

config();
const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ADMIN_EMAIL = `admin-routes-${suffix}@test.invalid`;
const CUSTOMER_EMAIL = `admin-routes-customer-${suffix}@test.invalid`;

describe("Admin routes", () => {
  let admin: any;
  let customer: any;
  let vendor: any;
  let adminToken: string;
  let customerToken: string;
  let category: any;
  let childCategory: any;
  const tokenFor = (user: any) => jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  const request = (path: string, method = "GET", body?: unknown, token = adminToken) => fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    await User.deleteMany({ email: { $in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } });
    [admin, customer] = await User.create([
      { name: "Admin route test", email: ADMIN_EMAIL, password_hash: "unused", role: "admin", status: "active" },
      { name: "Customer route test", email: CUSTOMER_EMAIL, password_hash: "unused", role: "customer", status: "active" },
    ]);
    vendor = await Vendor.create({ user_id: customer.id, name: "Admin Route Vendor", display_name: "Admin Route Vendor", address: "1 Test Road", postal_code: "10000", commission_rate_bps: 1000 });
    await VendorKyc.create({ vendor_id: vendor.id, address_proof_key: `kyc/${vendor.id}/address.pdf`, identity_proof_key: `kyc/${vendor.id}/identity.pdf`, status: "pending" });
    category = await Category.create({ name: "Admin Route Test", slug: `admin-route-test-${suffix}` });
    childCategory = await Category.create({ name: "Admin Route Child", slug: `admin-route-child-${suffix}`, parent_id: category.id });
    adminToken = tokenFor(admin);
    customerToken = tokenFor(customer);
  });

  afterAll(async () => {
    if (vendor) {
      await VendorKyc.deleteMany({ vendor_id: vendor.id });
      await Vendor.deleteOne({ _id: vendor.id });
    }
    if (category) await Category.deleteMany({ _id: { $in: [category.id, childCategory?.id].filter(Boolean) } });
    if (admin || customer) await AdminAuditLog.deleteMany({ admin_user_id: { $in: [admin?.id, customer?.id] } });
    await User.deleteMany({ email: { $in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } });
    await mongoose.connection.close();
  });

  it("protects the whole admin namespace against missing, forged, and non-admin tokens", async () => {
    // The admin router is mounted at /api/v1; its guard must not capture public APIs.
    expect((await request("/products", "GET", undefined, "")).status).toBe(200);
    expect((await request("/admin/vendors", "GET", undefined, "")).status).toBe(401);
    expect((await request("/admin/vendors", "GET", undefined, "not-a-token")).status).toBe(401);
    expect((await request("/admin/vendors", "GET", undefined, customerToken)).status).toBe(403);
    const forgedRole = jwt.sign({ id: customer.id, email: customer.email, role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const nonexistentAdmin = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "missing@test.invalid", role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    expect((await request("/admin/vendors", "GET", undefined, forgedRole)).status).toBe(403);
    expect((await request("/admin/vendors", "GET", undefined, nonexistentAdmin)).status).toBe(403);
    await User.updateOne({ _id: admin.id }, { $set: { status: "suspended" } });
    expect((await request("/admin/vendors")).status).toBe(403);
    await User.updateOne({ _id: admin.id }, { $set: { status: "active" } });
    expect((await request("/admin/categories", "POST", { name: "Injected", slug: "injected" }, customerToken)).status).toBe(403);
    for (const path of ["/admin/coupons", "/admin/orders", "/admin/settlements", "/admin/analytics/overview", "/admin/search/index-status"]) {
      expect((await request(path, "GET", undefined, customerToken)).status, path).toBe(403);
    }
    expect((await request("/admin/search/reindex", "POST", { confirm: true }, customerToken)).status).toBe(403);
  });

  it("lists vendors with pagination and rejects malformed filters and extra query keys", async () => {
    const response = await request("/admin/vendors?status=pending&page=1&limit=100");
    expect(response.status).toBe(200);
    const body = await response.json() as { vendors: Array<{ id: string; kyc_status: string }>; pagination: { page: number; limit: number } };
    expect(body.vendors).toContainEqual(expect.objectContaining({ id: vendor.id, kyc_status: "pending" }));
    expect(body.pagination).toMatchObject({ page: 1, limit: 100 });
    for (const query of ["?page=0", "?limit=101", "?status=approved", "?unexpected=true"]) expect((await request(`/admin/vendors${query}`)).status).toBe(400);
    expect((await request("/admin/vendors/not-an-id")).status).toBe(400);
    expect((await request(`/admin/vendors/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it("redacts KYC internals and enforces single-review decisions with audit trail", async () => {
    const kyc = await request(`/admin/vendors/${vendor.id}/kyc`);
    expect(kyc.status).toBe(200);
    expect(await kyc.json()).toMatchObject({ vendor_id: vendor.id, status: "pending" });
    const docs = await request(`/admin/vendors/${vendor.id}/kyc/documents`);
    expect(await docs.json()).toEqual({ address_proof_key: `kyc/${vendor.id}/address.pdf`, identity_proof_key: `kyc/${vendor.id}/identity.pdf`, status: "pending" });
    expect((await request(`/admin/vendors/${vendor.id}/verify`, "PATCH", { status: "rejected" })).status).toBe(400);
    expect((await request(`/admin/vendors/${vendor.id}/verify`, "PATCH", { status: "verified", reviewed_by_user_id: customer.id })).status).toBe(400);
    const approved = await request(`/admin/vendors/${vendor.id}/verify`, "PATCH", { status: "verified" });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ vendor: { id: vendor.id, kyc_status: "verified" }, kyc: { status: "verified", reviewed_by_user_id: admin.id } });
    expect((await request(`/admin/vendors/${vendor.id}/verify`, "PATCH", { status: "rejected", rejection_reason: "duplicate" })).status).toBe(409);
    expect((await Vendor.findById(vendor.id))?.kyc_status).toBe("verified");
    expect(await AdminAuditLog.exists({ admin_user_id: admin.id, action: "vendor.kyc.verified", entity_id: vendor.id })).toBeTruthy();
  });

  it("requires a reason for KYC rejection and refuses missing submissions", async () => {
    const secondVendor = await Vendor.create({ user_id: new mongoose.Types.ObjectId().toString(), name: "Reject Test", display_name: "Reject Test", address: "2 Test Road", postal_code: "10001", commission_rate_bps: 1000 });
    try {
      expect((await request(`/admin/vendors/${secondVendor.id}/verify`, "PATCH", { status: "rejected" })).status).toBe(400);
      expect((await request(`/admin/vendors/${secondVendor.id}/verify`, "PATCH", { status: "verified" })).status).toBe(404);
    } finally { await Vendor.deleteOne({ _id: secondVendor.id }); }
  });

  it("validates category inputs, enforces unique slugs, and prevents deleting categories in use", async () => {
    expect((await request("/admin/categories", "POST", { name: " ", slug: "bad slug", is_admin: true })).status).toBe(400);
    expect((await request("/admin/categories", "POST", { name: "Missing parent", slug: `missing-parent-${suffix}`, parent_id: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
    expect((await request("/admin/categories", "POST", { name: "Duplicate", slug: category.slug })).status).toBe(409);
    expect((await request(`/admin/categories/${category.id}`, "PATCH", { parent_id: category.id })).status).toBe(400);
    expect((await request(`/admin/categories/${category.id}`, "PATCH", { parent_id: childCategory.id })).status).toBe(400);
    expect((await request(`/admin/categories/${category.id}`, "DELETE")).status).toBe(409);
    expect((await request(`/admin/categories/${childCategory.id}`, "DELETE")).status).toBe(204);
    expect((await request(`/admin/categories/${category.id}`, "DELETE")).status).toBe(204);
  });

  it("prevents self-lockout and rejects invalid user IDs or status escalation fields", async () => {
    expect((await request(`/admin/users/${admin.id}/status`, "PATCH", { status: "suspended" })).status).toBe(409);
    expect((await request(`/admin/users/${customer.id}/status`, "PATCH", { status: "admin", role: "admin" })).status).toBe(400);
    expect((await request("/admin/users/not-an-id")).status).toBe(400);
  });
});
