import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { AdminAuditLog, Category, Product, User, Vendor, VendorKyc } from "../models";

/** Black-box tests against a running API. All application state is accessed over HTTP. */
config();
const BASE_URL = (process.env.API_BASE_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");
type Json = Record<string, any>;
type Result = { response: Response; body: Json };

async function request(path: string, options: RequestInit = {}): Promise<Result> {
  const response = await fetch(`${BASE_URL}${path}`, options);
  return { response, body: response.status === 204 ? {} : await response.json() as Json };
}

function send(method: string, body?: unknown, token?: string): RequestInit {
  return {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function suffix() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

let createdProductId: string | undefined;
let productPromise: Promise<Json> | undefined;
let fixtureVendorToken: string | undefined;
let fixtureVendorId: string | undefined;
let fixtureCategoryId: string | undefined;
let fixtureAdminId: string | undefined;
const fixtureSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fixtureAdminEmail = `marketly-e2e-admin-${fixtureSuffix}@example.invalid`;
const fixtureAdminPassword = `Admin-${fixtureSuffix}-Password!`;

beforeAll(async () => {
  // The application intentionally has no public admin bootstrap route. Seed only the
  // test administrator identity, then exercise every fixture operation over HTTP.
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
  const admin = await User.create({
    name: "Marketly E2E Admin",
    email: fixtureAdminEmail,
    password_hash: await bcrypt.hash(fixtureAdminPassword, 10),
    role: "admin",
    status: "active",
  });
  fixtureAdminId = admin.id;
});

afterAll(async () => {
  if (createdProductId && fixtureVendorToken) {
    const cleanup = await request(`/products/${createdProductId}`, send("DELETE", undefined, fixtureVendorToken));
    expect(cleanup.response.status, `Failed to archive E2E product ${createdProductId}`).toBe(204);
    await Product.deleteOne({ _id: createdProductId });
  }
  if (fixtureCategoryId) await Category.deleteOne({ _id: fixtureCategoryId });
  if (fixtureVendorId) {
    await VendorKyc.deleteMany({ vendor_id: fixtureVendorId });
    const vendor = await Vendor.findById(fixtureVendorId).select("user_id").lean();
    await Vendor.deleteOne({ _id: fixtureVendorId });
    if (vendor) await User.deleteOne({ _id: vendor.user_id });
  }
  if (fixtureAdminId) {
    await AdminAuditLog.deleteMany({ admin_user_id: fixtureAdminId });
    await User.deleteOne({ _id: fixtureAdminId });
  }
  await mongoose.connection.close();
});

async function customer(): Promise<{ token: string; email: string; password: string }> {
  const id = suffix();
  const email = `marketly-e2e-${id}@example.invalid`;
  const password = `E2e-${id}-Password!`;
  const result = await request("/auth/register", send("POST", { name: "Marketly E2E", email, password }));
  expect(result.response.status, JSON.stringify(result.body)).toBe(201);
  return { token: result.body.token, email, password };
}

async function resolveProduct(): Promise<Json> {
  const adminLogin = await request("/auth/login", send("POST", { email: fixtureAdminEmail, password: fixtureAdminPassword }));
  expect(adminLogin.response.status, JSON.stringify(adminLogin.body)).toBe(200);
  const adminToken = adminLogin.body.token as string;

  const vendorUser = await customer();
  const application = await request("/vendors", send("POST", {
    name: `Marketly E2E Shop ${fixtureSuffix}`, display_name: `E2E Shop ${fixtureSuffix}`,
    address: "1 Test Street", postal_code: "560001",
  }, vendorUser.token));
  expect(application.response.status, JSON.stringify(application.body)).toBe(201);
  fixtureVendorId = application.body.id as string;

  const vendorLogin = await request("/auth/login", send("POST", { email: vendorUser.email, password: vendorUser.password }));
  expect(vendorLogin.response.status, JSON.stringify(vendorLogin.body)).toBe(200);
  fixtureVendorToken = vendorLogin.body.token as string;
  const kyc = await request("/vendors/me/kyc", send("POST", {
    address_proof_key: `kyc/${fixtureVendorId}/address-proof.pdf`,
    identity_proof_key: `kyc/${fixtureVendorId}/identity-proof.pdf`,
  }, fixtureVendorToken));
  expect([200, 201], JSON.stringify(kyc.body)).toContain(kyc.response.status);
  const verified = await request(`/admin/vendors/${fixtureVendorId}/verify`, send("PATCH", { status: "verified" }, adminToken));
  expect(verified.response.status, JSON.stringify(verified.body)).toBe(200);

  const categories = await request("/categories");
  expect(categories.response.status, JSON.stringify(categories.body)).toBe(200);
  let category = categories.body.categories[0];
  if (!category) {
    const createdCategory = await request("/admin/categories", send("POST", {
      name: `Marketly E2E Category ${fixtureSuffix}`, slug: `marketly-e2e-${fixtureSuffix}`,
    }, adminToken));
    expect(createdCategory.response.status, JSON.stringify(createdCategory.body)).toBe(201);
    category = createdCategory.body;
    fixtureCategoryId = category.id as string;
  }

  const id = suffix();
  const created = await request("/products", send("POST", {
    category_id: category.id,
    name: `Marketly E2E Product ${id}`,
    description: "Temporary product created and archived by the HTTP end-to-end suite.",
    sku: `E2E-${id}`,
    price: 1234,
    stock: 100,
  }, fixtureVendorToken));
  expect(created.response.status, JSON.stringify(created.body)).toBe(201);
  createdProductId = created.body.id;

  const activated = await request(`/products/${createdProductId}/status`, send("PATCH", { status: "active" }, fixtureVendorToken));
  expect(activated.response.status, JSON.stringify(activated.body)).toBe(200);
  return activated.body;
}

async function product(): Promise<Json> {
  productPromise ??= resolveProduct();
  return productPromise;
}

async function address(token: string): Promise<string> {
  const result = await request("/addresses", send("POST", {
    label: "Home", first_line: "1 Test Street", postal_code: "560001", city: "Bengaluru",
    state: "Karnataka", country: "India", addressee_name: "Marketly E2E", contact_number: "+919876543210",
  }, token));
  expect(result.response.status, JSON.stringify(result.body)).toBe(201);
  return result.body.address.id;
}

async function addToCart(itemId: string, session: string, quantity = 1): Promise<Result> {
  return request("/cart/items", send("POST", { session_id: session, product_id: itemId, quantity }));
}

async function checkout(token: string, session: string, addressId: string, key = `marketly-e2e-${suffix()}`): Promise<Result> {
  return request("/checkout", send("POST", { session_id: session, address_id: addressId, idempotency_key: key }, token));
}

describe("HTTP end-to-end workflows (requires a running API)", () => {
  it("catalog browsing, category filters, sorting, details, related items, reviews, and vendor storefront", async () => {
    const item = await product();
    const categories = await request("/categories");
    expect(categories.response.status).toBe(200);
    expect(Array.isArray(categories.body.categories)).toBe(true);
    const category = categories.body.categories.find((row: Json) => row.id === item.category_id);
    expect(category).toBeTruthy();

    const categoryDetail = await request(`/categories/${category.id}`);
    expect(categoryDetail.response.status).toBe(200);
    const categoryProducts = await request(`/categories/${category.id}/products?page=1&limit=10`);
    expect(categoryProducts.response.status).toBe(200);
    expect(categoryProducts.body.products.some((row: Json) => row.id === item.id)).toBe(true);

    const byPrice = await request("/products?sort=price_asc&page=1&limit=20");
    expect(byPrice.response.status).toBe(200);
    expect(byPrice.body.products.every((row: Json) => row.status === "active")).toBe(true);
    const searched = await request(`/products?search=${encodeURIComponent(item.name)}&category_id=${item.category_id}`);
    expect(searched.response.status).toBe(200);
    expect(searched.body.products.some((row: Json) => row.id === item.id)).toBe(true);

    const detail = await request(`/products/${item.id}`);
    expect(detail.response.status).toBe(200);
    expect(detail.body).toMatchObject({ id: item.id, category_id: item.category_id, status: "active" });
    expect((await request(`/products/${item.id}/related?limit=10`)).response.status).toBe(200);
    expect((await request(`/products/${item.id}/reviews?page=1&limit=10`)).response.status).toBe(200);

    const vendor = await request(`/vendors/${item.vendor_id}`);
    expect(vendor.response.status).toBe(200);
    const vendorProducts = await request(`/vendors/${item.vendor_id}/products`);
    expect(vendorProducts.response.status).toBe(200);
    expect(vendorProducts.body.products.some((row: Json) => row.id === item.id)).toBe(true);
  });

  it("search results, filters, suggestions, and trending products", async () => {
    // Search relies on the configured search service; run this against the same live stack as the API.
    const browse = await request("/search/products?limit=10&sortBy=price&order=asc");
    expect([200, 502]).toContain(browse.response.status);
    if (browse.response.status === 502) expect(browse.body.message).toBe("Product search is temporarily unavailable");
    else expect(Array.isArray(browse.body.products)).toBe(true);
    const found = await request(`/search/products?q=${encodeURIComponent("product")}&page=1&limit=10`);
    expect([200, 502]).toContain(found.response.status);
    const filtered = await request(`/search/products?category=${encodeURIComponent((await product()).category_id)}&minPrice=0&maxPrice=1000000&sortBy=price&order=asc`);
    expect([200, 502]).toContain(filtered.response.status);
    const suggestions = await request("/search/suggestions?q=pro&limit=5");
    expect([200, 502]).toContain(suggestions.response.status);
    if (suggestions.response.status === 200) expect(Array.isArray(suggestions.body.suggestions)).toBe(true);
    else expect(suggestions.body.message).toBe("Search suggestions are temporarily unavailable");
    const trending = await request("/search/trending?limit=5");
    expect([200, 502]).toContain(trending.response.status);
    if (trending.response.status === 200) expect(Array.isArray(trending.body.products)).toBe(true);
    else expect(trending.body.message).toBe("Trending products are temporarily unavailable");
  });

  it("customer registration, login, profile, refresh, password change, logout, and auth errors", async () => {
    const user = await customer();
    expect((await request("/auth/register", send("POST", { name: "Duplicate", email: user.email, password: user.password }))).response.status).toBe(400);
    expect((await request("/auth/register", send("POST", { name: "Bad Email", email: "not-an-email", password: "x" }))).response.status).toBe(400);
    const me = await request("/me", { headers: { Authorization: `Bearer ${user.token}` } });
    expect(me.response.status).toBe(200);
    expect(me.body.email).toBe(user.email);

    const login = await request("/auth/login", send("POST", { email: user.email, password: user.password }));
    expect(login.response.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    const refresh = await request("/auth/refresh", send("POST", { refreshToken: login.body.refreshToken }));
    expect(refresh.response.status).toBe(200);
    const token = refresh.body.token as string;

    const profile = await request("/users/me", send("PATCH", { name: "Updated E2E Customer" }, token));
    expect(profile.response.status).toBe(200);
    const passwordChange = await request("/users/me/password", send("PATCH", {
      currentPassword: user.password, newPassword: `Changed-${suffix()}-Password!`,
    }, token));
    expect(passwordChange.response.status).toBe(200);
    expect((await request("/auth/logout", send("POST", { refreshToken: refresh.body.refreshToken }, token))).response.status).toBe(200);
    expect((await request("/me")).response.status).toBe(401);
    expect((await request("/auth/login", send("POST", { email: user.email, password: "wrong-password" }))).response.status).toBe(401);
  });

  it("customer vendor application, vendor profile, and KYC submission lifecycle", async () => {
    const user = await customer();
    const application = await request("/vendors", send("POST", {
      name: "E2E Test Shop", display_name: "E2E Shop", address: "1 Test Street", postal_code: "560001",
    }, user.token));
    expect(application.response.status).toBe(201);
    expect(application.body.kyc_status).toBe("pending");

    // Registration issued a customer token; logging in picks up the new vendor role.
    const login = await request("/auth/login", send("POST", { email: user.email, password: user.password }));
    expect(login.response.status).toBe(200);
    const token = login.body.token as string;
    expect((await request("/vendors/me", { headers: { Authorization: `Bearer ${token}` } })).response.status).toBe(200);
    expect((await request("/vendors/me/kyc", { headers: { Authorization: `Bearer ${token}` } })).response.status).toBe(200);
    const submitted = await request("/vendors/me/kyc", send("POST", {
      address_proof_key: `kyc/${application.body.id}/address-proof.pdf`,
      identity_proof_key: `kyc/${application.body.id}/identity-proof.pdf`,
    }, token));
    expect([200, 201]).toContain(submitted.response.status);
    expect(submitted.body.status).toBe("pending");
    expect((await request("/vendors/me/dashboard", { headers: { Authorization: `Bearer ${token}` } })).response.status).toBe(200);
  });

  it("address create, list, retrieve, update, delete, and invalid input", async () => {
    const user = await customer();
    const token = user.token;
    expect((await request("/addresses")).response.status).toBe(401);
    const created = await request("/addresses", send("POST", {
      label: "Home", first_line: "1 Test Street", postal_code: "560001", city: "Bengaluru",
      state: "Karnataka", country: "India", addressee_name: "Marketly E2E", contact_number: "+919876543210",
    }, token));
    expect(created.response.status).toBe(201);
    const id = created.body.address.id as string;
    expect((await request("/addresses", { headers: { Authorization: `Bearer ${token}` } })).body.addresses).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    expect((await request(`/addresses/${id}`, { headers: { Authorization: `Bearer ${token}` } })).response.status).toBe(200);
    const updated = await request(`/addresses/${id}`, send("PATCH", { label: "Work" }, token));
    expect(updated.response.status).toBe(200);
    expect(updated.body.address.label).toBe("Work");
    expect((await request("/addresses", send("POST", {}, token))).response.status).toBe(400);
    const other = await customer();
    expect((await request(`/addresses/${id}`, { headers: { Authorization: `Bearer ${other.token}` } })).response.status).toBe(404);
    expect((await request(`/addresses/${id}`, send("DELETE", undefined, token))).response.status).toBe(204);
    expect((await request(`/addresses/${id}`, { headers: { Authorization: `Bearer ${token}` } })).response.status).toBe(404);
  });

  it("guest cart add, read, increment, update, validate, remove, and clear", async () => {
    const item = await product();
    const session = `marketly-e2e-${suffix()}`;
    expect((await addToCart(item.id, session)).response.status).toBe(201);
    const first = await request(`/cart?session_id=${encodeURIComponent(session)}`);
    expect(first.response.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    const cartItemId = first.body.items[0].id as string;
    expect((await addToCart(item.id, session)).response.status).toBe(200);
    expect((await request(`/cart?session_id=${encodeURIComponent(session)}`)).body.items[0].quantity).toBe(2);

    const patched = await request(`/cart/items/${cartItemId}`, send("PATCH", { session_id: session, quantity: 1 }));
    expect(patched.response.status).toBe(200);
    const validate = await request("/cart/validate", send("POST", { session_id: session }));
    expect(validate.response.status).toBe(200);
    expect(validate.body.valid).toBe(true);

    const removed = await request(`/cart/items/${cartItemId}?session_id=${encodeURIComponent(session)}`, send("DELETE"));
    expect(removed.response.status).toBe(204);
    await addToCart(item.id, session);
    const cleared = await request(`/cart?session_id=${encodeURIComponent(session)}`, send("DELETE"));
    expect(cleared.response.status).toBe(204);
    expect((await request(`/cart?session_id=${encodeURIComponent(session)}`)).body.items).toEqual([]);
  });

  it("guest cart merge, duplicate quantities, cart ownership, and invalid cart inputs", async () => {
    const item = await product();
    const user = await customer();
    const session = `marketly-e2e-${suffix()}`;
    await addToCart(item.id, session);
    const merged = await request("/cart/merge", send("POST", { session_id: session }, user.token));
    expect(merged.response.status).toBe(200);
    expect(merged.body.merged).toEqual(expect.arrayContaining([expect.objectContaining({ product_id: item.id, quantity: 1 })]));
    expect((await request("/cart/items", send("POST", { session_id: session, product_id: "bad-id", quantity: 1 }))).response.status).toBe(400);
    expect((await request("/cart/items", send("POST", { session_id: session, product_id: item.id, quantity: 0 }))).response.status).toBe(400);
    expect((await request("/cart?unsupported=1")).response.status).toBe(400);
  });

  it("checkout preview, coupon handling, successful order creation, idempotency, history, and tracking", async () => {
    const item = await product();
    const user = await customer();
    const addressId = await address(user.token);
    const session = `marketly-e2e-${suffix()}`;
    await addToCart(item.id, session);
    expect((await request("/checkout/preview", send("POST", { session_id: session }))).body.valid).toBe(true);
    const previewWithBadCoupon = await request("/checkout/preview", send("POST", { session_id: session, coupon_code: `missing-${suffix()}` }));
    expect(previewWithBadCoupon.response.status).toBe(200);
    expect(previewWithBadCoupon.body.valid).toBe(false);

    const key = `marketly-e2e-${suffix()}`;
    const result = await checkout(user.token, session, addressId, key);
    expect(result.response.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.order.total_paise).toBe(item.price);
    expect(result.body.payment).toMatchObject({ status: "created", amount_paise: item.price, currency: "INR" });

    const replay = await checkout(user.token, session, addressId, key);
    expect(replay.response.status).toBe(200);
    expect(replay.body.order.id).toBe(result.body.order.id);
    const list = await request("/orders?page=1&limit=20", { headers: { Authorization: `Bearer ${user.token}` } });
    expect(list.response.status).toBe(200);
    expect(list.body.orders.some((row: Json) => row.id === result.body.order.id)).toBe(true);
    const detail = await request(`/orders/${result.body.order.id}`, { headers: { Authorization: `Bearer ${user.token}` } });
    expect(detail.response.status).toBe(200);
    expect(detail.body.order.id).toBe(result.body.order.id);
    const otherCustomer = await customer();
    expect((await request(`/orders/${result.body.order.id}`, { headers: { Authorization: `Bearer ${otherCustomer.token}` } })).response.status).toBe(404);
    const tracking = await request(`/orders/${result.body.order.id}/tracking`, { headers: { Authorization: `Bearer ${user.token}` } });
    expect(tracking.response.status).toBe(200);
    expect(tracking.body.order_id).toBe(result.body.order.id);
  }, 60_000);

  it("checkout rejects empty carts, bad addresses, duplicate keys, and customers can cancel pending orders", async () => {
    const user = await customer();
    const addressId = await address(user.token);
    const emptySession = `marketly-e2e-${suffix()}`;
    expect((await checkout(user.token, emptySession, addressId)).response.status).toBe(404);

    const item = await product();
    const session = `marketly-e2e-${suffix()}`;
    await addToCart(item.id, session);
    expect((await request("/checkout", send("POST", { session_id: session, address_id: "bad", idempotency_key: "bad-key-000" }, user.token))).response.status).toBe(400);
    const result = await checkout(user.token, session, addressId);
    expect(result.response.status).toBe(201);
    const cancelled = await request(`/orders/${result.body.order.id}/cancel`, send("POST", {}, user.token));
    expect(cancelled.response.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect((await request(`/orders/${result.body.order.id}/cancel`, send("POST", {}, user.token))).response.status).toBe(409);
    expect((await request(`/orders/${result.body.order.id}`, { headers: { Authorization: `Bearer ${user.token}` } })).response.status).toBe(200);
    expect((await request(`/orders/${result.body.order.id}/return`, send("POST", { reason: "Changed my mind" }, user.token))).response.status).toBe(409);
  }, 60_000);

  it("payment reads and retry, Razorpay order creation, and forged verification rejection", async () => {
    const item = await product();
    const user = await customer();
    const addressId = await address(user.token);
    const session = `marketly-e2e-${suffix()}`;
    await addToCart(item.id, session);
    const order = await checkout(user.token, session, addressId);
    expect(order.response.status).toBe(201);
    const paymentId = order.body.payment.id as string;
    expect((await request(`/payments/${paymentId}`, { headers: { Authorization: `Bearer ${user.token}` } })).response.status).toBe(200);
    expect((await request(`/payments/${paymentId}/retry`, send("POST", {}, user.token))).response.status).toBe(409);
    expect((await request(`/payments/${paymentId}/verify`, send("POST", {
      razorpay_order_id: "forged-order", razorpay_payment_id: "forged-payment", razorpay_signature: "a".repeat(64),
    }, user.token))).response.status).toBe(400);

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const created = await request("/payments/create", send("POST", { payment_id: paymentId }, user.token));
      expect([200, 201]).toContain(created.response.status);
      expect(created.body.razorpay).toMatchObject({ amount: item.price, currency: "INR" });
    }
  }, 60_000);

  it("vendor fulfillment advances packed to shipped to in transit to delivered and customer sees tracking", async () => {
    const vendorToken = fixtureVendorToken;
    if (!vendorToken) throw new Error("E2E vendor fixture was not initialized");
    const vendorProducts = await request("/vendors/me/products?page=1&limit=100", { headers: { Authorization: `Bearer ${vendorToken}` } });
    expect(vendorProducts.response.status).toBe(200);
    const item = vendorProducts.body.products.find((row: Json) => row.status === "active" && row.stock > 0 && Number.isSafeInteger(row.price) && row.price > 0);
    expect(item, "the configured vendor needs an active, in-stock product").toBeTruthy();
    const user = await customer();
    const addressId = await address(user.token);
    const session = `marketly-e2e-${suffix()}`;
    await addToCart(item.id, session);
    const order = await checkout(user.token, session, addressId);
    expect(order.response.status).toBe(201);

    const vendorList = await request("/vendor-orders?page=1&limit=100", { headers: { Authorization: `Bearer ${vendorToken}` } });
    expect(vendorList.response.status).toBe(200);
    const vendorOrder = vendorList.body.orders.find((row: Json) => row.order_id === order.body.order.id);
    expect(vendorOrder, "E2E_VENDOR_TOKEN must belong to the vendor that owns the selected product").toBeTruthy();
    const id = vendorOrder.id as string;

    for (const status of ["packed", "shipped", "in_transit", "delivered"]) {
      const changed = await request(`/vendor-orders/${id}/status`, send("PATCH", { status }, vendorToken));
      expect(changed.response.status, JSON.stringify(changed.body)).toBe(200);
      if (status === "shipped") {
        const shipment = await request(`/vendor-orders/${id}/shipment`, send("POST", {
          carrier: "E2E Carrier", tracking_number: `E2E-${suffix()}`, tracking_url: "https://example.com/track/e2e",
        }, vendorToken));
        expect(shipment.response.status).toBe(201);
      }
    }
    const vendorHistory = await request(`/vendor-orders/${id}/history`, { headers: { Authorization: `Bearer ${vendorToken}` } });
    expect(vendorHistory.response.status).toBe(200);
    const customerTracking = await request(`/orders/${order.body.order.id}/tracking`, { headers: { Authorization: `Bearer ${user.token}` } });
    expect(customerTracking.response.status).toBe(200);
    expect(customerTracking.body.vendor_orders[0].status).toBe("delivered");
    expect(customerTracking.body.vendor_orders[0].shipments.length).toBeGreaterThan(0);
  }, 60_000);

  it("coupon discovery and validation endpoints", async () => {
    const listed = await request("/coupons?page=1&limit=10");
    expect(listed.response.status).toBe(200);
    expect(Array.isArray(listed.body.coupons)).toBe(true);
    if (listed.body.coupons[0]) {
      expect((await request(`/coupons/${listed.body.coupons[0].id}`)).response.status).toBe(200);
    }
    const invalid = await request("/coupons/validate", send("POST", { code: `missing-${suffix()}`, subtotal_paise: 1000 }));
    expect([200, 400, 404]).toContain(invalid.response.status);
    const user = await customer();
    const mine = await request("/users/me/coupons", { headers: { Authorization: `Bearer ${user.token}` } });
    expect(mine.response.status).toBe(200);
  });
});
