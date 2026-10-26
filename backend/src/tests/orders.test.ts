import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Address from "../models/Address.js";
import Cart from "../models/Cart.js";
import CartItem from "../models/CartItem.js";
import Coupon from "../models/Coupon.js";
import CouponRedemption from "../models/CouponRedemption.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import OrderStatusHistory from "../models/OrderStatusHistory.js";
import Payment from "../models/Payment.js";
import Product from "../models/Product.js";
import ReturnRequest from "../models/ReturnRequest.js";
import Shipment from "../models/Shipment.js";
import VendorOrder from "../models/VendorOrder.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const FIXTURE_ID = new mongoose.Types.ObjectId().toString();
const SESSION_PREFIX = `checkout-preview-${FIXTURE_ID}`;
const SKU_PREFIX = `CHECKOUT-PREVIEW-${FIXTURE_ID}`;
const COUPON_CODE = `CHECKOUT-${FIXTURE_ID}`;
const VALID_SESSION_ID = `${SESSION_PREFIX}-valid`;
const EMPTY_SESSION_ID = `${SESSION_PREFIX}-empty`;
const INVALID_SESSION_ID = `${SESSION_PREFIX}-invalid`;
const EXPIRED_SESSION_ID = `${SESSION_PREFIX}-expired`;
const STOCK_RACE_SESSION_ID = `${SESSION_PREFIX}-stock-conflict`;
const ADDRESS_CHECK_SESSION_ID = `${SESSION_PREFIX}-address-check`;
const CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const LIST_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const LIST_OTHER_CUSTOMER_ID = new mongoose.Types.ObjectId().toString();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const CUSTOMER_TOKEN = jwt.sign({ id: CUSTOMER_ID, email: "checkout-customer@test.invalid", role: "customer" }, JWT_SECRET);
const OTHER_CUSTOMER_TOKEN = jwt.sign({ id: OTHER_CUSTOMER_ID, email: "checkout-other@test.invalid", role: "customer" }, JWT_SECRET);
const VENDOR_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "checkout-vendor@test.invalid", role: "vendor" }, JWT_SECRET);
const LIST_CUSTOMER_TOKEN = jwt.sign({ id: LIST_CUSTOMER_ID, email: "orders-list-customer@test.invalid", role: "customer" }, JWT_SECRET);
const LIST_EMPTY_CUSTOMER_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "orders-list-empty@test.invalid", role: "customer" }, JWT_SECRET);
const LIST_VENDOR_TOKEN = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "orders-list-vendor@test.invalid", role: "vendor" }, JWT_SECRET);
const IDEMPOTENCY_KEY = `checkout-${FIXTURE_ID}`;

const previewCheckout = (body: unknown) => fetch(`${BASE_URL}/checkout/preview`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const createCheckout = (body: unknown, token?: string) => fetch(`${BASE_URL}/checkout`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
const getOrders = (query = "", token?: string) => fetch(`${BASE_URL}/orders${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
const getOrder = (orderId: string, query = "", token?: string) => fetch(`${BASE_URL}/orders/${orderId}${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
const getOrderTracking = (orderId: string, query = "", token?: string) => fetch(`${BASE_URL}/orders/${orderId}/tracking${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
const cancelOrder = (orderId: string, token?: string, body?: unknown, query = "") => fetch(`${BASE_URL}/orders/${orderId}/cancel${query}`, {
  method: "POST",
  headers: {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const requestReturn = (orderId: string, body: unknown, token?: string, query = "") => fetch(`${BASE_URL}/orders/${orderId}/return${query}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

describe("Order routes", () => {
  let activeProductIds: string[];
  let inactiveProductId: string;
  let outOfStockProductId: string;
  let checkoutProductId: string;
  let checkoutCartId: string;
  let foreignCartId: string;
  let addressId: string;
  let otherAddressId: string;
  let listOrderIds: string[];
  let trackingVendorOrderId: string;
  let createdCheckoutOrderId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const oldCarts = await Cart.find({ session_id: { $in: [VALID_SESSION_ID, EMPTY_SESSION_ID, INVALID_SESSION_ID, EXPIRED_SESSION_ID] } }).select("_id");
    await CartItem.deleteMany({ cart_id: { $in: oldCarts.map((cart) => cart.id) } });
    await Cart.deleteMany({ _id: { $in: oldCarts.map((cart) => cart._id) } });
    await Coupon.deleteMany({ code: COUPON_CODE });
    await Product.deleteMany({ sku: { $regex: `^${SKU_PREFIX}` } });

    const products = await Product.create([
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Checkout Preview Available One", description: "Available preview fixture", sku: `${SKU_PREFIX}-ONE`,
        price: 12_500, stock: 5, status: "active",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Checkout Preview Available Two", description: "Available preview fixture", sku: `${SKU_PREFIX}-TWO`,
        price: 25_000, stock: 3, status: "active",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Checkout Preview Draft", description: "Unavailable preview fixture", sku: `${SKU_PREFIX}-DRAFT`,
        price: 5_000, stock: 3, status: "draft",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Checkout Preview Low Stock", description: "Low stock preview fixture", sku: `${SKU_PREFIX}-LOW`,
        price: 2_000, stock: 1, status: "active",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Checkout Create Order Product", description: "Order creation fixture", sku: `${SKU_PREFIX}-ORDER`,
        price: 6_000, stock: 5, status: "active",
      },
    ]);
    activeProductIds = [products[0]!.id, products[1]!.id];
    inactiveProductId = products[2]!.id;
    outOfStockProductId = products[3]!.id;
    checkoutProductId = products[4]!.id;

    const validCart = await Cart.create({ session_id: VALID_SESSION_ID });
    await CartItem.create([
      { cart_id: validCart.id, product_id: activeProductIds[0]!, quantity: 2 },
      { cart_id: validCart.id, product_id: activeProductIds[1]!, quantity: 1 },
    ]);

    const invalidCart = await Cart.create({ session_id: INVALID_SESSION_ID });
    await CartItem.create([
      { cart_id: invalidCart.id, product_id: outOfStockProductId, quantity: 2 },
      { cart_id: invalidCart.id, product_id: inactiveProductId, quantity: 1 },
      { cart_id: invalidCart.id, product_id: new mongoose.Types.ObjectId().toString(), quantity: 1 },
      { cart_id: invalidCart.id, product_id: "malformed-product-id", quantity: 1 },
      { cart_id: invalidCart.id, product_id: activeProductIds[0]!, quantity: 0 },
    ]);
    await Cart.create({ session_id: EMPTY_SESSION_ID });
    await Cart.create({ session_id: EXPIRED_SESSION_ID, expires_at: new Date("2000-01-01T00:00:00Z") });
    const customerCart = await Cart.create({ user_id: CUSTOMER_ID });
    checkoutCartId = customerCart.id;
    await CartItem.create({ cart_id: customerCart.id, product_id: checkoutProductId, quantity: 2 });
    const foreignCart = await Cart.create({ user_id: OTHER_CUSTOMER_ID });
    foreignCartId = foreignCart.id;
    await CartItem.create({ cart_id: foreignCart.id, product_id: checkoutProductId, quantity: 1 });
    const addressCheckCart = await Cart.create({ session_id: ADDRESS_CHECK_SESSION_ID });
    await CartItem.create({ cart_id: addressCheckCart.id, product_id: activeProductIds[0]!, quantity: 1 });
    const stockRaceCart = await Cart.create({ session_id: STOCK_RACE_SESSION_ID });
    await CartItem.create({ cart_id: stockRaceCart.id, product_id: outOfStockProductId, quantity: 2 });
    const address = await Address.create({
      user_id: CUSTOMER_ID, label: "Home", first_line: "1 Checkout Street", postal_code: "12345",
      city: "Test City", state: "Test State", country: "IN", addressee_name: "Checkout Customer", contact_number: "9999999999",
    });
    addressId = address.id;
    const otherAddress = await Address.create({
      user_id: OTHER_CUSTOMER_ID, label: "Other Home", first_line: "2 Checkout Street", postal_code: "54321",
      city: "Other City", state: "Other State", country: "IN", addressee_name: "Other Customer", contact_number: "8888888888",
    });
    otherAddressId = otherAddress.id;
    const listOrders = await Order.create([
      {
        user_id: LIST_CUSTOMER_ID, address_snapshot: { first_line: "Older Order Address" },
        subtotal_paise: 1_000, discount_paise: 0, shipping_paise: 0, total_paise: 1_000,
        payment_status: "paid", status: "completed", created_at: new Date("2024-01-01T00:00:00Z"), updated_at: new Date("2024-01-01T00:00:00Z"),
      },
      {
        user_id: LIST_CUSTOMER_ID, address_snapshot: { first_line: "Newer Order Address" },
        subtotal_paise: 2_000, discount_paise: 200, shipping_paise: 0, total_paise: 1_800,
        payment_status: "pending", status: "pending", created_at: new Date("2025-01-01T00:00:00Z"), updated_at: new Date("2025-01-01T00:00:00Z"),
      },
      {
        user_id: LIST_OTHER_CUSTOMER_ID, address_snapshot: { first_line: "Private Order Address" },
        subtotal_paise: 9_000, discount_paise: 0, shipping_paise: 0, total_paise: 9_000,
        payment_status: "paid", status: "completed", created_at: new Date("2026-01-01T00:00:00Z"), updated_at: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    listOrderIds = listOrders.map((order) => order.id);
    const trackingVendorOrder = await VendorOrder.create({
      order_id: listOrders[0]!.id,
      vendor_id: products[0]!.vendor_id,
      status: "in_transit",
      created_at: new Date("2024-01-02T00:00:00Z"),
      updated_at: new Date("2024-01-04T00:00:00Z"),
    });
    trackingVendorOrderId = trackingVendorOrder.id;
    await Shipment.create({
      vendor_order_id: trackingVendorOrder.id,
      carrier: "Test Carrier",
      tracking_number: "TRACK-ORDER-TEST",
      tracking_url: "https://tracking.example.test/TRACK-ORDER-TEST",
      shipped_at: new Date("2024-01-03T00:00:00Z"),
    });
    await OrderStatusHistory.create([
      {
        vendor_order_id: trackingVendorOrder.id,
        previous_status: "placed",
        new_status: "shipped",
        changed_by_user_id: LIST_CUSTOMER_ID,
        created_at: new Date("2024-01-03T00:00:00Z"),
      },
      {
        vendor_order_id: trackingVendorOrder.id,
        previous_status: "shipped",
        new_status: "in_transit",
        changed_by_user_id: LIST_CUSTOMER_ID,
        created_at: new Date("2024-01-04T00:00:00Z"),
      },
    ]);
    const detailProduct = products[0]!;
    await OrderItem.create({
      order_id: listOrders[1]!.id,
      product_id: detailProduct.id,
      vendor_id: detailProduct.vendor_id,
      product_name: detailProduct.name,
      sku: detailProduct.sku,
      unit_price_paise: 2_000,
      quantity: 1,
      discount_paise: 200,
      line_total_paise: 1_800,
    });
    await Payment.create({
      order_id: listOrders[1]!.id,
      provider: "razorpay",
      provider_order_id: "provider-order-private-fixture",
      provider_payment_id: "provider-payment-private-fixture",
      status: "created",
      amount_paise: 1_800,
      currency: "INR",
      idempotency_key: `orders-detail-${FIXTURE_ID}`,
    });
    await Coupon.create({
      code: COUPON_CODE,
      discount_type: "percentage",
      discount_value: 10,
      max_discount_paise: 3_000,
      min_order_paise: 50_000,
      starts_at: new Date(Date.now() - 60_000),
      expires_at: new Date(Date.now() + 60 * 60_000),
      is_active: true,
    });
  });

  afterAll(async () => {
    const orders = await Order.find({ user_id: { $in: [CUSTOMER_ID, LIST_CUSTOMER_ID, LIST_OTHER_CUSTOMER_ID] } }).select("_id");
    const vendorOrders = await VendorOrder.find({ order_id: { $in: orders.map((order) => order.id) } }).select("_id");
    await Shipment.deleteMany({ vendor_order_id: { $in: vendorOrders.map((vendorOrder) => vendorOrder.id) } });
    await OrderStatusHistory.deleteMany({ vendor_order_id: { $in: vendorOrders.map((vendorOrder) => vendorOrder.id) } });
    await VendorOrder.deleteMany({ _id: { $in: vendorOrders.map((vendorOrder) => vendorOrder._id) } });
    await ReturnRequest.deleteMany({ order_id: { $in: orders.map((order) => order.id) } });
    const orderItems = await OrderItem.find({ order_id: { $in: orders.map((order) => order.id) } }).select("_id");
    await InventoryMovement.deleteMany({ order_item_id: { $in: orderItems.map((item) => item.id) } });
    await CouponRedemption.deleteMany({ order_id: { $in: orders.map((order) => order.id) } });
    await OrderItem.deleteMany({ order_id: { $in: orders.map((order) => order.id) } });
    await Payment.deleteMany({ order_id: { $in: orders.map((order) => order.id) } });
    await Order.deleteMany({ _id: { $in: orders.map((order) => order._id) } });
    const carts = await Cart.find({
      $or: [
        { session_id: { $in: [VALID_SESSION_ID, EMPTY_SESSION_ID, INVALID_SESSION_ID, EXPIRED_SESSION_ID, STOCK_RACE_SESSION_ID, ADDRESS_CHECK_SESSION_ID] } },
        { user_id: { $in: [CUSTOMER_ID, OTHER_CUSTOMER_ID] } },
      ],
    }).select("_id");
    await CartItem.deleteMany({ cart_id: { $in: carts.map((cart) => cart.id) } });
    await Cart.deleteMany({ _id: { $in: carts.map((cart) => cart._id) } });
    await Product.deleteMany({ sku: { $regex: `^${SKU_PREFIX}` } });
    await Coupon.deleteMany({ code: COUPON_CODE });
    await Address.deleteMany({ _id: { $in: [addressId, otherAddressId] } });
    await mongoose.connection.close();
  });

  describe("POST /checkout/preview", () => {
    it("previews current prices and applies a valid capped coupon without changing the cart", async () => {
    const response = await previewCheckout({ session_id: VALID_SESSION_ID, coupon_code: COUPON_CODE.toLowerCase() });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      cart_id: string;
      valid: boolean;
      items: Array<{ product_id: string; quantity: number; available: boolean; unit_price_paise: number; line_total_paise: number }>;
      subtotal_paise: number;
      discount_paise: number;
      shipping_paise: number;
      total_paise: number;
      coupon: { code: string; valid: boolean };
    };
    expect(body).toMatchObject({
      valid: true,
      subtotal_paise: 50_000,
      discount_paise: 3_000,
      shipping_paise: 0,
      total_paise: 47_000,
      coupon: { code: COUPON_CODE, valid: true },
    });
    expect(body.items).toEqual([
      expect.objectContaining({ product_id: activeProductIds[0], quantity: 2, available: true, unit_price_paise: 12_500, line_total_paise: 25_000 }),
      expect.objectContaining({ product_id: activeProductIds[1], quantity: 1, available: true, unit_price_paise: 25_000, line_total_paise: 25_000 }),
    ]);
    expect(await CartItem.countDocuments({ cart_id: body.cart_id })).toBe(2);
    expect((await Product.findById(activeProductIds[0]))?.stock).toBe(5);
    });

    it("reports unavailable, missing, out-of-stock, and invalid-quantity items", async () => {
    const response = await previewCheckout({ session_id: INVALID_SESSION_ID });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      valid: boolean;
      items: Array<{ product_id: string; available: boolean; reason: string | null; line_total_paise: number | null }>;
      subtotal_paise: number;
      total_paise: number;
    };
    expect(body.valid).toBe(false);
    expect(body.items).toEqual([
      expect.objectContaining({ product_id: outOfStockProductId, available: false, reason: "insufficient_stock", line_total_paise: 4_000 }),
      expect.objectContaining({ product_id: inactiveProductId, available: false, reason: "product_unavailable", line_total_paise: null }),
      expect.objectContaining({ available: false, reason: "product_unavailable", line_total_paise: null }),
      expect.objectContaining({ product_id: "malformed-product-id", available: false, reason: "product_unavailable", line_total_paise: null }),
      expect.objectContaining({ product_id: activeProductIds[0], available: false, reason: "invalid_quantity", line_total_paise: null }),
    ]);
    expect(body.subtotal_paise).toBe(4_000);
    expect(body.total_paise).toBe(4_000);
    });

    it("returns an invalid preview for an empty cart and an invalid coupon", async () => {
    const empty = await previewCheckout({ session_id: EMPTY_SESSION_ID });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({
      valid: false, items: [], subtotal_paise: 0, discount_paise: 0, shipping_paise: 0, total_paise: 0,
    });

    const invalidCoupon = await previewCheckout({ session_id: VALID_SESSION_ID, coupon_code: "MISSING-CHECKOUT-COUPON" });
    expect(invalidCoupon.status).toBe(200);
    expect(await invalidCoupon.json()).toMatchObject({
      valid: false, discount_paise: 0, coupon: { valid: false, message: "Coupon not found" },
    });

    const regexLikeCoupon = await previewCheckout({ session_id: VALID_SESSION_ID, coupon_code: `${COUPON_CODE.slice(0, -2)}.*` });
    expect(regexLikeCoupon.status).toBe(200);
    expect(await regexLikeCoupon.json()).toMatchObject({
      valid: false, coupon: { valid: false, message: "Coupon not found" },
    });
    });

    it("returns 404 for missing or expired carts and rejects malformed requests", async () => {
    expect((await previewCheckout({ session_id: `${SESSION_PREFIX}-missing` })).status).toBe(404);
    expect((await previewCheckout({ session_id: EXPIRED_SESSION_ID })).status).toBe(404);

    for (const body of [
      null,
      [],
      {},
      { session_id: "short" },
      { session_id: ` ${VALID_SESSION_ID}` },
      { session_id: `${SESSION_PREFIX}-x`.repeat(20) },
      { session_id: VALID_SESSION_ID, coupon_code: "   " },
      { session_id: VALID_SESSION_ID, unexpected: true },
    ]) {
      expect((await previewCheckout(body)).status).toBe(400);
    }
    });
  });

  describe("POST /checkout", () => {
    const validCheckout = () => ({
      cart_id: checkoutCartId,
      address_id: addressId,
      idempotency_key: IDEMPOTENCY_KEY,
    });

    it("creates the order and payment once, reserves stock, and replays idempotently", async () => {
      const response = await createCheckout(validCheckout(), CUSTOMER_TOKEN);
      expect(response.status).toBe(201);
      const body = await response.json() as {
        order: { id: string; status: string; subtotal_paise: number; discount_paise: number; total_paise: number };
        payment: { id: string; status: string; amount_paise: number; currency: string };
      };
      createdCheckoutOrderId = body.order.id;
      expect(body.order).toMatchObject({ status: "pending", subtotal_paise: 12_000, discount_paise: 0, total_paise: 12_000 });
      expect(body.payment).toMatchObject({ status: "created", amount_paise: 12_000, currency: "INR" });

      const order = await Order.findById(body.order.id);
      expect(order?.user_id).toBe(CUSTOMER_ID);
      expect(order?.address_snapshot).toMatchObject({ first_line: "1 Checkout Street", addressee_name: "Checkout Customer" });
      const orderItems = await OrderItem.find({ order_id: body.order.id });
      expect(orderItems).toHaveLength(1);
      expect(orderItems[0]).toMatchObject({
        product_id: checkoutProductId,
        quantity: 2,
        unit_price_paise: 6_000,
        discount_paise: 0,
        line_total_paise: 12_000,
      });
      expect((await Product.findById(checkoutProductId))?.stock).toBe(3);
      expect(await InventoryMovement.countDocuments({ order_item_id: orderItems[0]!.id, reason: "purchase", quantity_change: -2 })).toBe(1);
      expect(await Cart.findById(checkoutCartId)).toBeNull();

      const replay = await createCheckout(validCheckout(), CUSTOMER_TOKEN);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ order: { id: body.order.id }, payment: { id: body.payment.id } });
      expect((await Product.findById(checkoutProductId))?.stock).toBe(3);
      expect(await Order.countDocuments({ user_id: CUSTOMER_ID })).toBe(1);
    });

    it("requires customer auth and rejects malformed, foreign, missing, or invalid checkout inputs", async () => {
      expect((await createCheckout(validCheckout())).status).toBe(401);
      expect((await createCheckout(validCheckout(), "invalid-token")).status).toBe(401);
      expect((await createCheckout(validCheckout(), VENDOR_TOKEN)).status).toBe(403);

      for (const body of [
        null,
        [],
        {},
        { ...validCheckout(), unexpected: true },
        { ...validCheckout(), session_id: "short" },
        { address_id: addressId, idempotency_key: IDEMPOTENCY_KEY },
        { ...validCheckout(), address_id: "bad-id" },
        { ...validCheckout(), idempotency_key: "short" },
        { ...validCheckout(), coupon_code: "   " },
      ]) {
        expect((await createCheckout(body, CUSTOMER_TOKEN)).status).toBe(400);
      }

      expect((await createCheckout({ ...validCheckout(), cart_id: new mongoose.Types.ObjectId().toString(), idempotency_key: `missing-${FIXTURE_ID}` }, CUSTOMER_TOKEN)).status).toBe(404);
      expect((await createCheckout({ ...validCheckout(), cart_id: foreignCartId, idempotency_key: `foreign-${FIXTURE_ID}` }, CUSTOMER_TOKEN)).status).toBe(404);
      expect((await createCheckout({ ...validCheckout(), address_id: new mongoose.Types.ObjectId().toString(), idempotency_key: `bad-address-${FIXTURE_ID}` }, CUSTOMER_TOKEN)).status).toBe(404);
      expect((await createCheckout({
        session_id: ADDRESS_CHECK_SESSION_ID, address_id: otherAddressId, idempotency_key: `checkout-other-${FIXTURE_ID}`,
      }, CUSTOMER_TOKEN)).status).toBe(404);
      expect((await createCheckout({
        session_id: ADDRESS_CHECK_SESSION_ID, address_id: addressId, coupon_code: "MISSING-COUPON",
        idempotency_key: `checkout-coupon-${FIXTURE_ID}`,
      }, CUSTOMER_TOKEN)).status).toBe(400);
      expect((await createCheckout({
        session_id: EMPTY_SESSION_ID, address_id: addressId, idempotency_key: `checkout-empty-${FIXTURE_ID}`,
      }, CUSTOMER_TOKEN)).status).toBe(409);
    });

    it("does not create an order or mutate stock when cart inventory is unavailable", async () => {
      const beforeStock = (await Product.findById(outOfStockProductId))?.stock;
      const beforeOrders = await Order.countDocuments({ user_id: CUSTOMER_ID });
      const response = await createCheckout({
        session_id: STOCK_RACE_SESSION_ID,
        address_id: addressId,
        idempotency_key: `stock-conflict-${FIXTURE_ID}`,
      }, CUSTOMER_TOKEN);
      expect(response.status).toBe(409);
      const body = await response.json() as { message: string };
      expect(body.message).toMatch(/unavailable or out-of-stock/);
      expect(await Order.countDocuments({ user_id: CUSTOMER_ID })).toBe(beforeOrders);
      expect((await Product.findById(outOfStockProductId))?.stock).toBe(beforeStock);
      expect(await Cart.findOne({ session_id: STOCK_RACE_SESSION_ID })).not.toBeNull();
    });
  });

  describe("GET /orders", () => {
    it("returns only the authenticated customer's orders newest first", async () => {
      const response = await getOrders("", LIST_CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        orders: Array<Record<string, unknown> & { id: string; total_paise: number; created_at: string }>;
        pagination: { page: number; limit: number; total: number; total_pages: number };
      };
      expect(body.orders).toHaveLength(2);
      expect(body.orders.map((order) => order.total_paise)).toEqual([1_800, 1_000]);
      expect(body.orders.map((order) => order.created_at)).toEqual(
        [...body.orders.map((order) => order.created_at)].sort().reverse(),
      );
      expect(body.pagination).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
      expect(body.orders[0]).toMatchObject({ status: "pending", payment_status: "pending", subtotal_paise: 2_000, discount_paise: 200 });
      expect(body.orders[0]).not.toHaveProperty("user_id");
      expect(body.orders[0]).not.toHaveProperty("address_snapshot");
      expect(body.orders[0]).not.toHaveProperty("_id");
      expect(body.orders[0]).not.toHaveProperty("__v");
    });

    it("requires customer authentication and returns empty history when there are no orders", async () => {
      expect((await getOrders()).status).toBe(401);
      expect((await getOrders("", "invalid-token")).status).toBe(401);
      expect((await getOrders("", LIST_VENDOR_TOKEN)).status).toBe(403);

      const empty = await getOrders("", LIST_EMPTY_CUSTOMER_TOKEN);
      expect(empty.status).toBe(200);
      expect(await empty.json()).toEqual({
        orders: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
      });
    });

    it("paginates and rejects invalid or unsupported query parameters", async () => {
      const page = await getOrders("?page=2&limit=1", LIST_CUSTOMER_TOKEN);
      expect(page.status).toBe(200);
      expect(await page.json()).toMatchObject({
        orders: [{ total_paise: 1_000 }],
        pagination: { page: 2, limit: 1, total: 2, total_pages: 2 },
      });

      const beyond = await getOrders("?page=3&limit=1", LIST_CUSTOMER_TOKEN);
      expect(await beyond.json()).toMatchObject({
        orders: [], pagination: { page: 3, limit: 1, total: 2, total_pages: 2 },
      });

      for (const query of [
        "?page=0", "?page=-1", "?page=1.5", "?page=nope", "?page=", "?page=1&page=2",
        "?page=9007199254740992", "?page=9007199254740991", "?limit=0", "?limit=101", "?limit=1.5", "?limit=nope",
        "?limit=", "?limit=1&limit=2", "?unexpected=true",
      ]) {
        expect((await getOrders(query, LIST_CUSTOMER_TOKEN)).status, query).toBe(400);
      }
      expect((await getOrders("?limit=100", LIST_CUSTOMER_TOKEN)).status).toBe(200);
    });
  });

  describe("GET /orders/:uuid", () => {
    it("returns the customer's order, item snapshots, and safe payment details", async () => {
      const orderId = listOrderIds[1]!;
      const response = await getOrder(orderId, "", LIST_CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        order: Record<string, unknown> & { id: string; total_paise: number; address_snapshot: Record<string, unknown> };
        items: Array<Record<string, unknown> & { product_id: string; line_total_paise: number }>;
        payment: Record<string, unknown> & { amount_paise: number };
      };
      expect(body.order).toMatchObject({
        id: orderId,
        status: "pending",
        payment_status: "pending",
        subtotal_paise: 2_000,
        discount_paise: 200,
        shipping_paise: 0,
        total_paise: 1_800,
        address_snapshot: { first_line: "Newer Order Address" },
      });
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        product_id: activeProductIds[0],
        product_name: "Checkout Preview Available One",
        sku: `${SKU_PREFIX}-ONE`,
        unit_price_paise: 2_000,
        quantity: 1,
        discount_paise: 200,
        line_total_paise: 1_800,
      });
      expect(body.payment).toMatchObject({ provider: "razorpay", status: "created", amount_paise: 1_800, currency: "INR" });
      for (const privateField of ["user_id", "_id", "__v"]) expect(body.order).not.toHaveProperty(privateField);
      for (const privateField of ["vendor_id", "_id", "__v"]) expect(body.items[0]).not.toHaveProperty(privateField);
      for (const privateField of ["provider_order_id", "provider_payment_id", "idempotency_key", "_id", "__v"]) {
        expect(body.payment).not.toHaveProperty(privateField);
      }
    });

    it("returns a null payment when none exists", async () => {
      const response = await getOrder(listOrderIds[0]!, "", LIST_CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ order: { id: listOrderIds[0] }, items: [], payment: null });
    });

    it("requires customer authentication and hides missing or foreign orders", async () => {
      expect((await getOrder(listOrderIds[0]!)).status).toBe(401);
      expect((await getOrder(listOrderIds[0]!, "", "invalid-token")).status).toBe(401);
      expect((await getOrder(listOrderIds[0]!, "", LIST_VENDOR_TOKEN)).status).toBe(403);
      expect((await getOrder("not-an-id", "", LIST_CUSTOMER_TOKEN)).status).toBe(400);
      expect((await getOrder(new mongoose.Types.ObjectId().toString(), "", LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await getOrder(listOrderIds[2]!, "", LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await getOrder(listOrderIds[0]!, "?unexpected=true", LIST_CUSTOMER_TOKEN)).status).toBe(400);
    });
  });

  describe("POST /orders/:uuid/cancel", () => {
    it("cancels a pending unpaid order, restores stock, and prevents a second cancellation", async () => {
      const responses = await Promise.all([
        cancelOrder(createdCheckoutOrderId, CUSTOMER_TOKEN),
        cancelOrder(createdCheckoutOrderId, CUSTOMER_TOKEN),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const successful = responses.find((response) => response.status === 200)!;
      expect(await successful.json()).toMatchObject({
        id: createdCheckoutOrderId,
        status: "cancelled",
        payment_status: "failed",
      });
      expect((await Product.findById(checkoutProductId))?.stock).toBe(5);
      expect(await InventoryMovement.countDocuments({
        order_item_id: { $in: (await OrderItem.find({ order_id: createdCheckoutOrderId }).distinct("_id")).map(String) },
        reason: "cancellation",
        quantity_change: 2,
      })).toBe(1);
      expect((await Payment.findOne({ order_id: createdCheckoutOrderId }))?.status).toBe("failed");
      expect((await Order.findById(createdCheckoutOrderId))?.status).toBe("cancelled");
      expect((await cancelOrder(createdCheckoutOrderId, CUSTOMER_TOKEN)).status).toBe(409);
    });

    it("requires customer auth and rejects invalid, foreign, paid, or malformed cancellation requests", async () => {
      expect((await cancelOrder(createdCheckoutOrderId)).status).toBe(401);
      expect((await cancelOrder(createdCheckoutOrderId, "invalid-token")).status).toBe(401);
      expect((await cancelOrder(createdCheckoutOrderId, LIST_VENDOR_TOKEN)).status).toBe(403);
      expect((await cancelOrder("not-an-id", CUSTOMER_TOKEN)).status).toBe(400);
      expect((await cancelOrder(new mongoose.Types.ObjectId().toString(), CUSTOMER_TOKEN)).status).toBe(404);
      expect((await cancelOrder(listOrderIds[2]!, LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await cancelOrder(listOrderIds[0]!, LIST_CUSTOMER_TOKEN)).status).toBe(409);
      const processingPayment = await Payment.findOne({ order_id: listOrderIds[1]! });
      expect(processingPayment).not.toBeNull();
      processingPayment!.status = "processing";
      await processingPayment!.save();
      expect((await cancelOrder(listOrderIds[1]!, LIST_CUSTOMER_TOKEN)).status).toBe(409);
      processingPayment!.status = "created";
      await processingPayment!.save();
      expect((await cancelOrder(createdCheckoutOrderId, CUSTOMER_TOKEN, { reason: "changed mind" })).status).toBe(400);
      expect((await cancelOrder(createdCheckoutOrderId, CUSTOMER_TOKEN, undefined, "?unexpected=true")).status).toBe(400);
    });
  });

  describe("POST /orders/:uuid/return", () => {
    it("creates one return request for a completed paid order", async () => {
      const orderId = listOrderIds[0]!;
      const responses = await Promise.all([
        requestReturn(orderId, { reason: "The item arrived damaged" }, LIST_CUSTOMER_TOKEN),
        requestReturn(orderId, { reason: "The item arrived damaged" }, LIST_CUSTOMER_TOKEN),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const successful = responses.find((response) => response.status === 201)!;
      const body = await successful.json() as {
        return_request: { id: string; order_id: string; reason: string; status: string };
      };
      expect(body.return_request).toMatchObject({
        order_id: orderId,
        reason: "The item arrived damaged",
        status: "requested",
      });
      expect(body.return_request).not.toHaveProperty("user_id");
      expect(body.return_request).not.toHaveProperty("_id");
      expect((await Order.findById(orderId))?.status).toBe("completed");
      expect((await requestReturn(orderId, { reason: "Another reason" }, LIST_CUSTOMER_TOKEN)).status).toBe(409);
    });

    it("requires customer authentication and hides missing or foreign orders", async () => {
      expect((await requestReturn(listOrderIds[0]!, { reason: "Return" })).status).toBe(401);
      expect((await requestReturn(listOrderIds[0]!, { reason: "Return" }, "invalid-token")).status).toBe(401);
      expect((await requestReturn(listOrderIds[0]!, { reason: "Return" }, LIST_VENDOR_TOKEN)).status).toBe(403);
      expect((await requestReturn("not-an-id", { reason: "Return" }, LIST_CUSTOMER_TOKEN)).status).toBe(400);
      expect((await requestReturn(new mongoose.Types.ObjectId().toString(), { reason: "Return" }, LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await requestReturn(listOrderIds[2]!, { reason: "Return" }, LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await requestReturn(listOrderIds[1]!, { reason: "Return" }, LIST_CUSTOMER_TOKEN)).status).toBe(409);
      expect((await requestReturn(createdCheckoutOrderId, { reason: "Return" }, CUSTOMER_TOKEN)).status).toBe(409);
    });

    it("rejects malformed request bodies and unsupported query parameters", async () => {
      for (const body of [
        null,
        [],
        {},
        { reason: "" },
        { reason: "   " },
        { reason: "x".repeat(1001) },
        { reason: "Return", extra: true },
      ]) {
        expect((await requestReturn(listOrderIds[0]!, body, LIST_CUSTOMER_TOKEN)).status).toBe(400);
      }
      expect((await requestReturn(listOrderIds[0]!, { reason: "Return" }, LIST_CUSTOMER_TOKEN, "?unexpected=true")).status).toBe(400);
    });
  });

  describe("GET /orders/:uuid/tracking", () => {
    it("returns fulfillment shipments and ordered status history for the customer's order", async () => {
      const response = await getOrderTracking(listOrderIds[0]!, "", LIST_CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        order_id: string;
        order_status: string;
        vendor_orders: Array<{
          id: string;
          status: string;
          shipments: Array<{ carrier: string; tracking_number: string; tracking_url: string }>;
          status_history: Array<{ new_status: string; previous_status: string | null }>;
        }>;
      };
      expect(body.order_id).toBe(listOrderIds[0]);
      expect(body.order_status).toBe("completed");
      expect(body.vendor_orders).toHaveLength(1);
      expect(body.vendor_orders[0]).toMatchObject({ id: trackingVendorOrderId, status: "in_transit" });
      expect(body.vendor_orders[0]!.shipments).toMatchObject([{
        carrier: "Test Carrier",
        tracking_number: "TRACK-ORDER-TEST",
        tracking_url: "https://tracking.example.test/TRACK-ORDER-TEST",
      }]);
      expect(body.vendor_orders[0]!.status_history.map((event) => event.new_status)).toEqual(["shipped", "in_transit"]);
      expect(body.vendor_orders[0]!.status_history[0]).toMatchObject({ previous_status: "placed" });
      expect(body.vendor_orders[0]).not.toHaveProperty("vendor_id");
      expect(body.vendor_orders[0]!.status_history[0]).not.toHaveProperty("changed_by_user_id");
    });

    it("returns an empty fulfillment list when an order has no vendor tracking records", async () => {
      const response = await getOrderTracking(listOrderIds[1]!, "", LIST_CUSTOMER_TOKEN);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ order_id: listOrderIds[1], vendor_orders: [] });
    });

    it("requires customer authentication and hides missing or foreign orders", async () => {
      expect((await getOrderTracking(listOrderIds[0]!)).status).toBe(401);
      expect((await getOrderTracking(listOrderIds[0]!, "", "invalid-token")).status).toBe(401);
      expect((await getOrderTracking(listOrderIds[0]!, "", LIST_VENDOR_TOKEN)).status).toBe(403);
      expect((await getOrderTracking("not-an-id", "", LIST_CUSTOMER_TOKEN)).status).toBe(400);
      expect((await getOrderTracking(new mongoose.Types.ObjectId().toString(), "", LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await getOrderTracking(listOrderIds[2]!, "", LIST_CUSTOMER_TOKEN)).status).toBe(404);
      expect((await getOrderTracking(listOrderIds[0]!, "?unexpected=true", LIST_CUSTOMER_TOKEN)).status).toBe(400);
    });
  });
});
