import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import VendorKyc from "../models/VendorKyc.js";
import Product from "../models/Product.js";
import VendorOrder from "../models/VendorOrder.js";
import VendorSettlement from "../models/VendorSettlement.js";
import OrderItem from "../models/OrderItem.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const TEST_EMAILS = [
  "vendor-application-test@test.com",
  "vendor-existing-application-test@test.com",
  "vendor-suspended-test@test.com",
  "vendor-existing-profile-test@test.com",
  "vendor-admin-test@test.com",
  "vendor-no-profile-test@test.com",
  "vendor-suspended-profile-test@test.com",
  "vendor-public-products-test@test.com",
];

describe("Vendor Routes", () => {
  let applicant: any;
  let existingApplicationCustomer: any;
  let suspendedCustomer: any;
  let existingVendorUser: any;
  let admin: any;
  let vendorWithoutProfile: any;
  let suspendedVendor: any;
  let customerToken: string;
  let vendorToken: string;
  let kycVendorToken: string;
  let vendorWithoutProfileToken: string;
  let suspendedVendorToken: string;
  let suspendedToken: string;
  let adminToken: string;
  let applicantVendor: any;
  let kycVendor: any;
  let publicProductsUser: any;
  let publicProductsVendor: any;

  const vendorPayload = {
    name: "Applicant Shop",
    display_name: "Applicant Storefront",
    address: "1 Main St",
    postal_code: "12345",
  };

  const tokenFor = (user: any) => jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const postApplication = (body: unknown, token?: string) => fetch(`${BASE_URL}/vendors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const previousUsers = await User.find({ email: { $in: TEST_EMAILS } }).select("_id");
    const previousUserIds = previousUsers.map((user) => user.id);
    const previousVendors = await Vendor.find({ user_id: { $in: previousUserIds } }).select("_id");
    await VendorKyc.deleteMany({ vendor_id: { $in: previousVendors.map((vendor) => vendor.id) } });
    await Product.deleteMany({ vendor_id: { $in: previousVendors.map((vendor) => vendor.id) } });
    await VendorOrder.deleteMany({ vendor_id: { $in: previousVendors.map((vendor) => vendor.id) } });
    await VendorSettlement.deleteMany({ vendor_id: { $in: previousVendors.map((vendor) => vendor.id) } });
    await OrderItem.deleteMany({ vendor_id: { $in: previousVendors.map((vendor) => vendor.id) } });
    await Vendor.deleteMany({ user_id: { $in: previousUserIds } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });

    const password_hash = await bcrypt.hash("password123", 10);
    [applicant, existingApplicationCustomer, suspendedCustomer, existingVendorUser, admin, vendorWithoutProfile, suspendedVendor, publicProductsUser] = await User.create([
      { name: "Applicant", email: TEST_EMAILS[0], password_hash, role: "customer", status: "active" },
      { name: "Existing Application", email: TEST_EMAILS[1], password_hash, role: "customer", status: "active" },
      { name: "Suspended Customer", email: TEST_EMAILS[2], password_hash, role: "customer", status: "suspended" },
      { name: "Existing Vendor", email: TEST_EMAILS[3], password_hash, role: "vendor", status: "active" },
      { name: "Admin", email: TEST_EMAILS[4], password_hash, role: "admin", status: "active" },
      { name: "Vendor Without Profile", email: TEST_EMAILS[5], password_hash, role: "vendor", status: "active" },
      { name: "Suspended Vendor", email: TEST_EMAILS[6], password_hash, role: "vendor", status: "suspended" },
      { name: "Public Products Vendor", email: TEST_EMAILS[7], password_hash, role: "vendor", status: "active" },
    ]);

    await Vendor.create({
      user_id: existingApplicationCustomer.id,
      name: "Existing Shop",
      display_name: "Existing Storefront",
      address: "2 Main St",
      postal_code: "54321",
      commission_rate_bps: 0,
    });
    kycVendor = await Vendor.create({
      user_id: existingVendorUser.id,
      name: "KYC Test Shop",
      display_name: "KYC Test Storefront",
      address: "3 Main St",
      postal_code: "11111",
      commission_rate_bps: 0,
    });
    await Vendor.create({
      user_id: suspendedVendor.id,
      name: "Suspended Shop",
      display_name: "Suspended Storefront",
      address: "4 Main St",
      postal_code: "22222",
      commission_rate_bps: 0,
    });
    publicProductsVendor = await Vendor.create({
      user_id: publicProductsUser.id,
      name: "Public Products Shop",
      display_name: "Public Products Storefront",
      address: "5 Main St",
      postal_code: "33333",
      kyc_status: "verified",
      commission_rate_bps: 0,
    });

    customerToken = tokenFor(applicant);
    suspendedToken = tokenFor(suspendedCustomer);
    vendorToken = tokenFor(existingVendorUser);
    kycVendorToken = tokenFor(existingVendorUser);
    vendorWithoutProfileToken = tokenFor(vendorWithoutProfile);
    suspendedVendorToken = tokenFor(suspendedVendor);
    adminToken = tokenFor(admin);
  });

  afterAll(async () => {
    const users = await User.find({ email: { $in: TEST_EMAILS } }).select("_id");
    const userIds = users.map((user) => user.id);
    const vendors = await Vendor.find({ user_id: { $in: userIds } }).select("_id");
    await VendorKyc.deleteMany({ vendor_id: { $in: vendors.map((vendor) => vendor.id) } });
    await Product.deleteMany({ vendor_id: { $in: vendors.map((vendor) => vendor.id) } });
    await VendorOrder.deleteMany({ vendor_id: { $in: vendors.map((vendor) => vendor.id) } });
    await VendorSettlement.deleteMany({ vendor_id: { $in: vendors.map((vendor) => vendor.id) } });
    await OrderItem.deleteMany({ vendor_id: { $in: vendors.map((vendor) => vendor.id) } });
    await Vendor.deleteMany({ user_id: { $in: userIds } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await mongoose.connection.close();
  });

  describe("POST /vendors", () => {
    it("requires a bearer token", async () => {
      const response = await postApplication(vendorPayload);
      expect(response.status).toBe(401);
      expect(await response.json()).toHaveProperty("message", "No token provided");
    });

    it("rejects malformed, invalid, and expired bearer tokens", async () => {
      const invalidTokenResponse = await postApplication(vendorPayload, "not-a-jwt");
      expect(invalidTokenResponse.status).toBe(401);
      expect(await invalidTokenResponse.json()).toHaveProperty("message", "Invalid or expired token");

      const expiredToken = jwt.sign(
        { id: applicant.id, email: applicant.email, role: "customer" },
        JWT_SECRET,
        { expiresIn: -1 }
      );
      const expiredTokenResponse = await postApplication(vendorPayload, expiredToken);
      expect(expiredTokenResponse.status).toBe(401);
    });

    it("rejects missing, blank, and unexpected application fields", async () => {
      const invalidPayloads = [
        {},
        { ...vendorPayload, address: "   " },
        { ...vendorPayload, postal_code: "" },
        { ...vendorPayload, role: "admin" },
      ];

      for (const payload of invalidPayloads) {
        const response = await postApplication(payload, customerToken);
        expect(response.status).toBe(400);
        expect(await response.json()).toHaveProperty("message", "Invalid parameters");
      }
    });

    it("rejects tokens for users that do not exist", async () => {
      const token = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "missing@test.com", role: "customer" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      const response = await postApplication(vendorPayload, token);
      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty("message", "Active customer account required");
    });

    it("rejects suspended customers", async () => {
      const response = await postApplication(vendorPayload, suspendedToken);
      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty("message", "Active customer account required");
    });

    it("rejects vendor and admin accounts", async () => {
      const vendorResponse = await postApplication(vendorPayload, vendorToken);
      expect(vendorResponse.status).toBe(409);
      expect(await vendorResponse.json()).toHaveProperty("message", "Only customers can apply to become a vendor");

      const adminResponse = await postApplication(vendorPayload, adminToken);
      expect(adminResponse.status).toBe(409);
      expect(await adminResponse.json()).toHaveProperty("message", "Only customers can apply to become a vendor");
    });

    it("rejects a customer who already has a vendor application", async () => {
      const response = await postApplication(vendorPayload, tokenFor(existingApplicationCustomer));
      expect(response.status).toBe(409);
      expect(await response.json()).toHaveProperty("message", "Vendor application already exists");
    });

    it("creates a pending vendor application and promotes the customer", async () => {
      const response = await postApplication(vendorPayload, customerToken);
      expect(response.status).toBe(201);
      const body: any = await response.json();
      expect(body).toMatchObject({
        user_id: applicant.id,
        ...vendorPayload,
        kyc_status: "pending",
        commission_rate_bps: 0,
      });
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("created_at");
      expect(body).toHaveProperty("updated_at");
      expect((await User.findById(applicant.id))?.role).toBe("vendor");
      applicantVendor = await Vendor.findOne({ user_id: applicant.id });
      vendorToken = tokenFor({ ...applicant.toObject(), id: applicant.id, role: "vendor" });

      const duplicateResponse = await postApplication(vendorPayload, customerToken);
      expect(duplicateResponse.status).toBe(409);
    });

  });

  describe("GET /vendors/me", () => {
    it("requires an authenticated vendor", async () => {
      const noTokenResponse = await fetch(`${BASE_URL}/vendors/me`);
      expect(noTokenResponse.status).toBe(401);

      const customerResponse = await fetch(`${BASE_URL}/vendors/me`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(customerResponse.status).toBe(403);
      expect(await customerResponse.json()).toHaveProperty("message", "Vendor access required");
    });

    it("returns 403 when a vendor account has no vendor profile", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me`, {
        headers: { Authorization: `Bearer ${vendorWithoutProfileToken}` },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty("message", "Vendor profile not found");
    });

    it("rejects a suspended vendor account", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me`, {
        headers: { Authorization: `Bearer ${suspendedVendorToken}` },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty("message", "Active vendor account required");
    });

    it("returns only the authenticated vendor's profile", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body).toMatchObject({
        id: kycVendor.id,
        user_id: existingVendorUser.id,
        name: "KYC Test Shop",
        display_name: "KYC Test Storefront",
        address: "3 Main St",
        postal_code: "11111",
        kyc_status: "pending",
        commission_rate_bps: 0,
      });
      expect(body).toHaveProperty("created_at");
      expect(body).toHaveProperty("updated_at");
      expect(body).not.toHaveProperty("password_hash");
      expect(body).not.toHaveProperty("address_proof_key");
      expect(body).not.toHaveProperty("identity_proof_key");
    });
  });

  describe("GET /vendors/me/dashboard", () => {
    it("requires an authenticated vendor with an active profile", async () => {
      const anonymous = await fetch(`${BASE_URL}/vendors/me/dashboard`);
      expect(anonymous.status).toBe(401);

      const customer = await fetch(`${BASE_URL}/vendors/me/dashboard`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(customer.status).toBe(403);

      const missingProfile = await fetch(`${BASE_URL}/vendors/me/dashboard`, {
        headers: { Authorization: `Bearer ${vendorWithoutProfileToken}` },
      });
      expect(missingProfile.status).toBe(403);

      const suspended = await fetch(`${BASE_URL}/vendors/me/dashboard`, {
        headers: { Authorization: `Bearer ${suspendedVendorToken}` },
      });
      expect(suspended.status).toBe(403);
      expect(await suspended.json()).toHaveProperty("message", "Active vendor account required");
    });

    it("returns zero metrics when the vendor has no products, orders, or settlements", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me/dashboard`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        active_products: 0,
        total_orders: 0,
        open_orders: 0,
        gross_sales_paise: 0,
        refund_paise: 0,
        net_earnings_paise: 0,
        pending_payout_paise: 0,
      });
    });

    it("returns metrics scoped to the authenticated vendor", async () => {
      await Product.create([
        { vendor_id: kycVendor.id, category_id: "category-d", name: "Dashboard Active", description: "Active", sku: "DASH-1", price: 100, stock: 2, status: "active" },
        { vendor_id: kycVendor.id, category_id: "category-d", name: "Dashboard Draft", description: "Draft", sku: "DASH-2", price: 100, stock: 2, status: "draft" },
      ]);
      const openOrder = await VendorOrder.create({ order_id: "dashboard-order-open", vendor_id: kycVendor.id, status: "shipped" });
      await VendorOrder.create({ order_id: "dashboard-order-closed", vendor_id: kycVendor.id, status: "delivered" });
      await VendorSettlement.create([
        { vendor_order_id: openOrder.id, vendor_id: kycVendor.id, gross_paise: 1000, commission_paise: 100, refund_paise: 50, net_paise: 850, status: "pending" },
        { vendor_order_id: "dashboard-order-closed", vendor_id: kycVendor.id, gross_paise: 500, commission_paise: 50, refund_paise: 0, net_paise: 450, status: "paid" },
        { vendor_order_id: "other-vendor-order", vendor_id: publicProductsVendor.id, gross_paise: 9000, commission_paise: 900, refund_paise: 0, net_paise: 8100, status: "pending" },
      ]);

      const response = await fetch(`${BASE_URL}/vendors/me/dashboard`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        active_products: 1,
        total_orders: 2,
        open_orders: 1,
        gross_sales_paise: 1500,
        refund_paise: 50,
        net_earnings_paise: 1300,
        pending_payout_paise: 850,
      });
    });
  });

  describe("GET /vendors/me/orders", () => {
    it("requires an authenticated vendor with an active profile", async () => {
      const anonymous = await fetch(`${BASE_URL}/vendors/me/orders`);
      expect(anonymous.status).toBe(401);

      const customer = await fetch(`${BASE_URL}/vendors/me/orders`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(customer.status).toBe(403);

      const missingProfile = await fetch(`${BASE_URL}/vendors/me/orders`, {
        headers: { Authorization: `Bearer ${vendorWithoutProfileToken}` },
      });
      expect(missingProfile.status).toBe(403);

      const suspended = await fetch(`${BASE_URL}/vendors/me/orders`, {
        headers: { Authorization: `Bearer ${suspendedVendorToken}` },
      });
      expect(suspended.status).toBe(403);
      expect(await suspended.json()).toHaveProperty("message", "Active vendor account required");
    });

    it("returns only the vendor's orders and items with pagination", async () => {
      await VendorOrder.deleteMany({ vendor_id: kycVendor.id });
      await OrderItem.deleteMany({ vendor_id: kycVendor.id });
      const newest = await VendorOrder.create({
        order_id: "vendor-orders-newest",
        vendor_id: kycVendor.id,
        status: "placed",
        created_at: new Date("2025-02-02"),
      });
      await VendorOrder.create({
        order_id: "vendor-orders-older",
        vendor_id: kycVendor.id,
        status: "delivered",
        created_at: new Date("2025-02-01"),
      });
      await OrderItem.create([
        { order_id: newest.order_id, product_id: "product-a", vendor_id: kycVendor.id, product_name: "Vendor Item", sku: "VENDOR-A", unit_price_paise: 1200, quantity: 2, discount_paise: 100, line_total_paise: 2300 },
        { order_id: newest.order_id, product_id: "product-b", vendor_id: publicProductsVendor.id, product_name: "Other Vendor Item", sku: "OTHER-B", unit_price_paise: 900, quantity: 1, discount_paise: 0, line_total_paise: 900 },
      ]);

      const response = await fetch(`${BASE_URL}/vendors/me/orders?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0]).toMatchObject({
        id: newest.id,
        order_id: newest.order_id,
        status: "placed",
        items: [{
          product_id: "product-a",
          product_name: "Vendor Item",
          sku: "VENDOR-A",
          unit_price_paise: 1200,
          quantity: 2,
          discount_paise: 100,
          line_total_paise: 2300,
        }],
      });
      expect(body.orders[0].items).toHaveLength(1);

      const invalidPage = await fetch(`${BASE_URL}/vendors/me/orders?page=0`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(invalidPage.status).toBe(400);
    });

    it("returns an empty paginated list when the vendor has no orders", async () => {
      await VendorOrder.deleteMany({ vendor_id: kycVendor.id });
      const response = await fetch(`${BASE_URL}/vendors/me/orders`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        orders: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
    });
  });

  describe("GET /vendors/me/settlements", () => {
    it("requires an authenticated vendor with an active profile", async () => {
      const anonymous = await fetch(`${BASE_URL}/vendors/me/settlements`);
      expect(anonymous.status).toBe(401);

      const customer = await fetch(`${BASE_URL}/vendors/me/settlements`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(customer.status).toBe(403);

      const missingProfile = await fetch(`${BASE_URL}/vendors/me/settlements`, {
        headers: { Authorization: `Bearer ${vendorWithoutProfileToken}` },
      });
      expect(missingProfile.status).toBe(403);

      const suspended = await fetch(`${BASE_URL}/vendors/me/settlements`, {
        headers: { Authorization: `Bearer ${suspendedVendorToken}` },
      });
      expect(suspended.status).toBe(403);
      expect(await suspended.json()).toHaveProperty("message", "Active vendor account required");
    });

    it("returns only the vendor's settlements with pagination and hides transfer identifiers", async () => {
      await VendorSettlement.deleteMany({ vendor_id: kycVendor.id });
      const older = await VendorSettlement.create({
        vendor_order_id: "settlement-order-older",
        vendor_id: kycVendor.id,
        gross_paise: 1800,
        commission_paise: 180,
        refund_paise: 0,
        net_paise: 1620,
        status: "paid",
        provider_transfer_id: "private-transfer-older",
        created_at: new Date("2025-03-01"),
      });
      await VendorSettlement.create({
        vendor_order_id: "settlement-order-newer",
        vendor_id: kycVendor.id,
        gross_paise: 1000,
        commission_paise: 100,
        refund_paise: 50,
        net_paise: 850,
        status: "pending",
        provider_transfer_id: "private-transfer-newer",
        created_at: new Date("2025-03-02"),
      });
      await VendorSettlement.create({
        vendor_order_id: "settlement-other-vendor-order",
        vendor_id: publicProductsVendor.id,
        gross_paise: 9000,
        commission_paise: 900,
        refund_paise: 0,
        net_paise: 8100,
        status: "processing",
      });

      const response = await fetch(`${BASE_URL}/vendors/me/settlements?page=2&limit=1`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body.pagination).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
      expect(body.settlements).toHaveLength(1);
      expect(body.settlements[0]).toMatchObject({
        id: older.id,
        vendor_order_id: "settlement-order-older",
        gross_paise: 1800,
        commission_paise: 180,
        refund_paise: 0,
        net_paise: 1620,
        status: "paid",
      });
      expect(body.settlements[0]).not.toHaveProperty("provider_transfer_id");

      const invalidPage = await fetch(`${BASE_URL}/vendors/me/settlements?page=0`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(invalidPage.status).toBe(400);
    });

    it("returns an empty paginated list when the vendor has no settlements", async () => {
      await VendorSettlement.deleteMany({ vendor_id: kycVendor.id });
      const response = await fetch(`${BASE_URL}/vendors/me/settlements`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        settlements: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
    });
  });

  describe("GET /vendors/:uuid", () => {
    it("rejects malformed vendor IDs", async () => {
      const response = await fetch(`${BASE_URL}/vendors/not-a-vendor-id`);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("message", "Invalid vendor id");
    });

    it("returns 404 for a vendor that does not exist", async () => {
      const missingId = new mongoose.Types.ObjectId().toString();
      const response = await fetch(`${BASE_URL}/vendors/${missingId}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toHaveProperty("message", "Vendor not found");
    });

    it("returns a public profile without exposing private vendor fields", async () => {
      const response = await fetch(`${BASE_URL}/vendors/${kycVendor.id}`);
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body).toMatchObject({
        id: kycVendor.id,
        name: "KYC Test Shop",
        display_name: "KYC Test Storefront",
      });
      expect(body).toHaveProperty("created_at");
      expect(body).not.toHaveProperty("user_id");
      expect(body).not.toHaveProperty("address");
      expect(body).not.toHaveProperty("postal_code");
      expect(body).not.toHaveProperty("kyc_status");
      expect(body).not.toHaveProperty("commission_rate_bps");
    });

    it("hides profiles belonging to suspended vendor accounts", async () => {
      const suspendedProfile = await Vendor.findOne({ user_id: suspendedVendor.id });
      const response = await fetch(`${BASE_URL}/vendors/${suspendedProfile!.id}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toHaveProperty("message", "Vendor not found");
    });
  });

  describe("GET /vendors/:uuid/products", () => {
    it("rejects malformed vendor IDs and invalid pagination", async () => {
      const malformedId = await fetch(`${BASE_URL}/vendors/not-an-id/products`);
      expect(malformedId.status).toBe(400);

      const invalidPage = await fetch(`${BASE_URL}/vendors/${publicProductsVendor.id}/products?page=0`);
      expect(invalidPage.status).toBe(400);

      const invalidLimit = await fetch(`${BASE_URL}/vendors/${publicProductsVendor.id}/products?limit=101`);
      expect(invalidLimit.status).toBe(400);
    });

    it("returns only active products with deterministic pagination", async () => {
      await Product.deleteMany({ vendor_id: publicProductsVendor.id });
      const products = await Product.create([
        { vendor_id: publicProductsVendor.id, category_id: "category-a", name: "Listed One", description: "First", sku: "PUBLIC-1", price: 100, stock: 8, status: "active", created_at: new Date("2025-01-01") },
        { vendor_id: publicProductsVendor.id, category_id: "category-a", name: "Listed Two", description: "Second", sku: "PUBLIC-2", price: 200, stock: 5, status: "active", created_at: new Date("2025-01-02") },
        { vendor_id: publicProductsVendor.id, category_id: "category-a", name: "Draft", description: "Hidden", sku: "PUBLIC-3", price: 300, stock: 1, status: "draft" },
        { vendor_id: publicProductsVendor.id, category_id: "category-a", name: "Archived", description: "Hidden", sku: "PUBLIC-4", price: 400, stock: 0, status: "archived" },
      ]);

      const response = await fetch(`${BASE_URL}/vendors/${publicProductsVendor.id}/products?page=1&limit=1`);
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body.products).toHaveLength(1);
      expect(body.products[0]).toMatchObject({
        id: products[1]?.id,
        name: "Listed Two",
        description: "Second",
        price: 200,
      });
      expect(body.products[0]).not.toHaveProperty("sku");
      expect(body.products[0]).not.toHaveProperty("stock");
      expect(body.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });

      const secondPage = await fetch(`${BASE_URL}/vendors/${publicProductsVendor.id}/products?page=2&limit=1`);
      expect((await secondPage.json()).products[0].name).toBe("Listed One");
    });

    it("returns an empty paginated list when the page has no results", async () => {
      await Product.deleteMany({ vendor_id: publicProductsVendor.id });
      const response = await fetch(`${BASE_URL}/vendors/${publicProductsVendor.id}/products?page=3`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        products: [],
        pagination: { page: 3, limit: 20, total: 0, pages: 0 },
      });
    });

    it("hides products for missing, unverified, and suspended vendors", async () => {
      const unknownId = new mongoose.Types.ObjectId().toString();
      const unknown = await fetch(`${BASE_URL}/vendors/${unknownId}/products`);
      expect(unknown.status).toBe(404);

      const unverified = await fetch(`${BASE_URL}/vendors/${kycVendor.id}/products`);
      expect(unverified.status).toBe(404);

      const suspendedProfile = await Vendor.findOne({ user_id: suspendedVendor.id });
      const suspended = await fetch(`${BASE_URL}/vendors/${suspendedProfile!.id}/products`);
      expect(suspended.status).toBe(404);
    });
  });

  describe("PATCH /vendors/me", () => {
    it("requires an authenticated vendor with an active profile", async () => {
      const noTokenResponse = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Updated Storefront" }),
      });
      expect(noTokenResponse.status).toBe(401);

      const customerResponse = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ display_name: "Updated Storefront" }),
      });
      expect(customerResponse.status).toBe(403);

      const missingProfileResponse = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorWithoutProfileToken}` },
        body: JSON.stringify({ display_name: "Updated Storefront" }),
      });
      expect(missingProfileResponse.status).toBe(403);

      const suspendedResponse = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${suspendedVendorToken}` },
        body: JSON.stringify({ display_name: "Updated Storefront" }),
      });
      expect(suspendedResponse.status).toBe(403);
      expect(await suspendedResponse.json()).toHaveProperty("message", "Active vendor account required");
    });

    it("rejects empty, blank, and protected profile fields", async () => {
      const invalidPayloads = [
        {},
        { display_name: "   " },
        { role: "admin" },
        { user_id: applicant.id },
        { kyc_status: "verified" },
        { commission_rate_bps: 1 },
        { address: "Changed address" },
        { postal_code: "99999" },
      ];

      for (const payload of invalidPayloads) {
        const response = await fetch(`${BASE_URL}/vendors/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
          body: JSON.stringify(payload),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toHaveProperty("message", "Invalid parameters");
      }
    });

    it.each([
      ["address", { address: "Changed address" }],
      ["postal code", { postal_code: "99999" }],
    ])("does not allow changing %s", async (_field, payload) => {
      const response = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("message", "Invalid parameters");

      const savedVendor = await Vendor.findById(kycVendor.id);
      expect(savedVendor?.address).toBe("3 Main St");
      expect(savedVendor?.postal_code).toBe("11111");
    });

    it("updates allowed fields and leaves address and postal code unchanged", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify({ display_name: "  Updated Storefront  " }),
      });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body).toMatchObject({
        id: kycVendor.id,
        user_id: existingVendorUser.id,
        name: "KYC Test Shop",
        display_name: "Updated Storefront",
        address: "3 Main St",
        postal_code: "11111",
        kyc_status: "pending",
        commission_rate_bps: 0,
      });
      expect(body).toHaveProperty("updated_at");

      const savedVendor = await Vendor.findById(kycVendor.id);
      expect(savedVendor?.display_name).toBe("Updated Storefront");
      expect(savedVendor?.address).toBe("3 Main St");
      expect(savedVendor?.postal_code).toBe("11111");
    });
  });

  describe("GET /vendors/me/kyc", () => {
    it("requires an authenticated vendor", async () => {
      const getWithoutToken = await fetch(`${BASE_URL}/vendors/me/kyc`);
      expect(getWithoutToken.status).toBe(401);

      const customerResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(customerResponse.status).toBe(403);
    });

    it("reports not_submitted before the vendor uploads documents", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        vendor_id: kycVendor.id,
        status: "not_submitted",
        documents: { address_proof: false, identity_proof: false },
      });
    });

    it("returns submitted status without exposing object keys", async () => {
      await VendorKyc.create({
        vendor_id: kycVendor.id,
        address_proof_key: `kyc/${kycVendor.id}/address/address-proof.png`,
        identity_proof_key: `kyc/${kycVendor.id}/identity/identity-proof.jpg`,
        status: "pending",
      });
      const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        headers: { Authorization: `Bearer ${kycVendorToken}` },
      });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body).toMatchObject({
        vendor_id: kycVendor.id,
        status: "pending",
        documents: { address_proof: true, identity_proof: true },
      });
      expect(body).not.toHaveProperty("address_proof_key");
      expect(body).not.toHaveProperty("identity_proof_key");
    });
  });

  describe("POST /vendors/me/kyc", () => {
    beforeAll(async () => {
      await VendorKyc.deleteMany({ vendor_id: kycVendor.id });
      await Vendor.updateOne({ _id: kycVendor.id }, { kyc_status: "pending" });
    });

    it("requires an authenticated vendor", async () => {
      const noTokenResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(noTokenResponse.status).toBe(401);

      const customerResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({}),
      });
      expect(customerResponse.status).toBe(403);
    });

    it("rejects malformed, duplicate, or foreign document keys", async () => {
      const ownPrefix = `kyc/${kycVendor.id}`;
      const invalidPayloads = [
        {},
        { address_proof_key: `${ownPrefix}/same.png`, identity_proof_key: `${ownPrefix}/same.png` },
        { address_proof_key: `${ownPrefix}/../other.png`, identity_proof_key: `${ownPrefix}/identity.png` },
        { address_proof_key: `${ownPrefix}/address.png`, identity_proof_key: "kyc/another-vendor/identity.png" },
        { address_proof_key: `${ownPrefix}/address.png`, identity_proof_key: `${ownPrefix}/identity.png`, role: "admin" },
      ];

      for (const payload of invalidPayloads) {
        const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
          body: JSON.stringify(payload),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toHaveProperty("message", "Invalid parameters");
      }
    });

    it("submits both owned document keys and returns status without exposing keys", async () => {
      const payload = {
        address_proof_key: `kyc/${kycVendor.id}/address/address-proof.png`,
        identity_proof_key: `kyc/${kycVendor.id}/identity/identity-proof.jpg`,
      };
      const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        vendor_id: kycVendor.id,
        status: "pending",
        documents: { address_proof: true, identity_proof: true },
      });

      const savedSubmission = await VendorKyc.findOne({ vendor_id: kycVendor.id });
      expect(savedSubmission).toMatchObject({ ...payload, status: "pending" });
    });

    it("rejects duplicate submission while review is pending", async () => {
      const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify({
          address_proof_key: `kyc/${kycVendor.id}/address/address-proof.png`,
          identity_proof_key: `kyc/${kycVendor.id}/identity/identity-proof.jpg`,
        }),
      });
      expect(response.status).toBe(409);
    });

    it("allows resubmission after rejection and blocks resubmission after verification", async () => {
      await VendorKyc.updateOne(
        { vendor_id: kycVendor.id },
        { status: "rejected", rejection_reason: "Image is unreadable", reviewed_at: new Date() }
      );
      await Vendor.updateOne({ _id: kycVendor.id }, { kyc_status: "rejected" });

      const resubmission = {
        address_proof_key: `kyc/${kycVendor.id}/address/revised.png`,
        identity_proof_key: `kyc/${kycVendor.id}/identity/revised.png`,
      };
      const response = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify(resubmission),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "pending" });

      const resubmittedRecord = await VendorKyc.findOne({ vendor_id: kycVendor.id });
      expect(resubmittedRecord).toMatchObject({ ...resubmission, status: "pending" });
      expect(resubmittedRecord?.rejection_reason).toBeUndefined();
      expect((await Vendor.findById(kycVendor.id))?.kyc_status).toBe("pending");

      await VendorKyc.updateOne({ vendor_id: kycVendor.id }, { status: "verified" });
      await Vendor.updateOne({ _id: kycVendor.id }, { kyc_status: "verified" });
      const verifiedResponse = await fetch(`${BASE_URL}/vendors/me/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${kycVendorToken}` },
        body: JSON.stringify(resubmission),
      });
      expect(verifiedResponse.status).toBe(409);
    });
  });
});
