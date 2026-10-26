import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import CartItem from "../models/CartItem.js";
import Product from "../models/Product.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const SESSION_ID = `cart-route-test-${new mongoose.Types.ObjectId()}`;
const ADD_SESSION_ID = `${SESSION_ID}-add`;
const PATCH_SESSION_ID = `${SESSION_ID}-patch`;
const DELETE_SESSION_ID = `${SESSION_ID}-delete`;
const CLEAR_SESSION_ID = `${SESSION_ID}-clear`;
const MERGE_SESSION_ID = `${SESSION_ID}-merge`;
const VALIDATE_SESSION_ID = `${SESSION_ID}-validate`;
const USER_ID = new mongoose.Types.ObjectId().toString();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const SKU_PREFIX = `CART-ROUTE-${new mongoose.Types.ObjectId()}`;
let productId: string;
let secondProductId: string;
let inactiveProductId: string;

const addItem = (body: unknown) => fetch(`${BASE_URL}/cart/items`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const patchItem = (itemId: string, body: unknown) => fetch(`${BASE_URL}/cart/items/${itemId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const deleteItem = (itemId: string, query: string) => fetch(`${BASE_URL}/cart/items/${itemId}${query}`,
  { method: "DELETE" });
const clearCart = (query: string) => fetch(`${BASE_URL}/cart${query}`, { method: "DELETE" });
const mergeCart = (body: unknown, token?: string) => fetch(`${BASE_URL}/cart/merge`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
const validateCart = (body: unknown) => fetch(`${BASE_URL}/cart/validate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const customerToken = jwt.sign({ id: USER_ID, email: "cart-merge@test.invalid", role: "customer" }, JWT_SECRET);
const vendorToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: "cart-vendor@test.invalid", role: "vendor" }, JWT_SECRET);

describe("Cart routes", () => {
  let cartId: string;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const cart = await Cart.create({ session_id: SESSION_ID });
    cartId = cart.id;
    await CartItem.create([
      { cart_id: cartId, product_id: "product-b", quantity: 2, added_at: new Date("2025-01-02T00:00:00Z") },
      { cart_id: cartId, product_id: "product-a", quantity: 1, added_at: new Date("2025-01-01T00:00:00Z") },
    ]);
    await Cart.create({ session_id: `${SESSION_ID}-expired`, expires_at: new Date("2000-01-01T00:00:00Z") });
    const products = await Product.create([
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Cart Route Product", description: "Cart add route fixture", sku: `${SKU_PREFIX}-active`,
        price: 125, stock: 5, status: "active",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Unavailable Cart Route Product", description: "Inactive fixture", sku: `${SKU_PREFIX}-inactive`,
        price: 125, stock: 5, status: "draft",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: new mongoose.Types.ObjectId().toString(),
        name: "Second Cart Route Product", description: "Second active fixture", sku: `${SKU_PREFIX}-second`,
        price: 250, stock: 2, status: "active",
      },
    ]);
    productId = products[0]!.id;
    inactiveProductId = products[1]!.id;
    secondProductId = products[2]!.id;
  });

  afterAll(async () => {
    const carts = await Cart.find({
      $or: [
        { session_id: { $in: [SESSION_ID, `${SESSION_ID}-expired`, ADD_SESSION_ID, PATCH_SESSION_ID, DELETE_SESSION_ID, CLEAR_SESSION_ID, MERGE_SESSION_ID, `${MERGE_SESSION_ID}-expired`, VALIDATE_SESSION_ID, `${VALIDATE_SESSION_ID}-expired`] } },
        { user_id: USER_ID },
      ],
    }).select("_id");
    await CartItem.deleteMany({ cart_id: { $in: carts.map((cart) => cart.id) } });
    await Cart.deleteMany({ _id: { $in: carts.map((cart) => cart._id) } });
    await Product.deleteMany({ sku: { $regex: `^${SKU_PREFIX}` } });
    await mongoose.connection.close();
  });

  it("GET /cart returns the guest cart and its items in added order", async () => {
    const response = await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(SESSION_ID)}`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      cart: { id: string; session_id: string };
      items: Array<{ cart_id: string; product_id: string; quantity: number }>;
    };

    expect(body.cart).toMatchObject({ id: cartId, session_id: SESSION_ID });
    expect(body.items).toEqual([
      expect.objectContaining({ cart_id: cartId, product_id: "product-a", quantity: 1 }),
      expect.objectContaining({ cart_id: cartId, product_id: "product-b", quantity: 2 }),
    ]);
    expect(body.cart).not.toHaveProperty("_id");
    expect(body.items[0]).not.toHaveProperty("_id");
  });

  it("GET /cart returns an empty cart when no session or matching cart exists", async () => {
    expect(await (await fetch(`${BASE_URL}/cart`)).json()).toEqual({ cart: null, items: [] });
    expect(await (await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(`${SESSION_ID}-missing`)}`)).json())
      .toEqual({ cart: null, items: [] });
    expect(await (await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(`${SESSION_ID}-expired`)}`)).json())
      .toEqual({ cart: null, items: [] });
  });

  it("GET /cart rejects blank, oversized, duplicate, and unsupported query parameters", async () => {
    const invalidQueries = [
      "session_id=", "session_id=%20", `session_id=${"x".repeat(201)}`,
      "session_id=first&session_id=second", "unexpected=value",
    ];
    for (const query of invalidQueries) {
      const response = await fetch(`${BASE_URL}/cart?${query}`);
      expect(response.status, query).toBe(400);
      expect(await response.json()).toHaveProperty("message");
    }
  });

  it("POST /cart/items creates a guest cart item and increments quantity for repeated adds", async () => {
      const firstResponse = await addItem({ session_id: ADD_SESSION_ID, product_id: productId, quantity: 2 });
      expect(firstResponse.status).toBe(201);
      const firstBody = await firstResponse.json() as { cart_id: string; item: { id: string; product_id: string; quantity: number } };
      expect(firstBody.item).toMatchObject({ product_id: productId, quantity: 2 });

      const secondResponse = await addItem({ session_id: ADD_SESSION_ID, product_id: productId, quantity: 2 });
      expect(secondResponse.status).toBe(200);
      const secondBody = await secondResponse.json() as { cart_id: string; item: { id: string; quantity: number } };
      expect(secondBody.cart_id).toBe(firstBody.cart_id);
      expect(secondBody.item).toMatchObject({ id: firstBody.item.id, quantity: 4 });

      const overStock = await addItem({ session_id: ADD_SESSION_ID, product_id: productId, quantity: 2 });
      expect(overStock.status).toBe(409);
      const cartResponse = await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(ADD_SESSION_ID)}`);
      expect(await cartResponse.json()).toMatchObject({ items: [{ product_id: productId, quantity: 4 }] });
  });

  it("POST /cart/items rejects malformed requests, unavailable products, and unknown products", async () => {
      const invalidBodies = [
        {},
        { session_id: " ", product_id: productId, quantity: 1 },
        { session_id: "x".repeat(201), product_id: productId, quantity: 1 },
        { session_id: ADD_SESSION_ID, product_id: "not-an-id", quantity: 1 },
        { session_id: ADD_SESSION_ID, product_id: productId, quantity: 0 },
        { session_id: ADD_SESSION_ID, product_id: productId, quantity: 1.5 },
        { session_id: ADD_SESSION_ID, product_id: productId, quantity: Number.MAX_SAFE_INTEGER + 1 },
        { session_id: ADD_SESSION_ID, product_id: productId, quantity: "1" },
        { session_id: ADD_SESSION_ID, product_id: productId, quantity: 1, extra: true },
        [],
      ];
      for (const body of invalidBodies) {
        expect((await addItem(body)).status).toBe(400);
      }

      expect((await addItem({ session_id: ADD_SESSION_ID, product_id: new mongoose.Types.ObjectId().toString(), quantity: 1 })).status)
        .toBe(404);
      expect((await addItem({ session_id: ADD_SESSION_ID, product_id: inactiveProductId, quantity: 1 })).status).toBe(409);
  });

  it("PATCH /cart/items/:itemId updates only the requesting session's item", async () => {
    const added = await addItem({ session_id: PATCH_SESSION_ID, product_id: productId, quantity: 2 });
    const addedBody = await added.json() as { item: { id: string } };
    const itemId = addedBody.item.id;

    const updated = await patchItem(itemId, { session_id: PATCH_SESSION_ID, quantity: 3 });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ item: { id: itemId, product_id: productId, quantity: 3 } });
    expect((await patchItem(itemId, { session_id: SESSION_ID, quantity: 1 })).status).toBe(404);
    expect((await patchItem(itemId, { session_id: PATCH_SESSION_ID, quantity: 6 })).status).toBe(409);

    for (const body of [
      { session_id: PATCH_SESSION_ID, quantity: 0 },
      { session_id: PATCH_SESSION_ID, quantity: 1.2 },
      { session_id: PATCH_SESSION_ID, quantity: Number.MAX_SAFE_INTEGER + 1 },
      { session_id: PATCH_SESSION_ID, quantity: "2" },
      { session_id: " ", quantity: 1 },
      { session_id: PATCH_SESSION_ID, quantity: 1, extra: true },
    ]) {
      expect((await patchItem(itemId, body)).status).toBe(400);
    }
    expect((await patchItem("not-an-id", { session_id: PATCH_SESSION_ID, quantity: 1 })).status).toBe(400);
  });

  it("DELETE /cart/items/:itemId removes only an item in the requesting session", async () => {
    const added = await addItem({ session_id: DELETE_SESSION_ID, product_id: productId, quantity: 1 });
    const addedBody = await added.json() as { item: { id: string } };
    const itemId = addedBody.item.id;

    expect((await deleteItem(itemId, `?session_id=${encodeURIComponent(SESSION_ID)}`)).status).toBe(404);
    expect((await deleteItem(itemId, "")).status).toBe(400);
    expect((await deleteItem(itemId, "?session_id=&other=x")).status).toBe(400);
    expect((await deleteItem("not-an-id", `?session_id=${encodeURIComponent(DELETE_SESSION_ID)}`)).status).toBe(400);

    const deleted = await deleteItem(itemId, `?session_id=${encodeURIComponent(DELETE_SESSION_ID)}`);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    expect((await deleteItem(itemId, `?session_id=${encodeURIComponent(DELETE_SESSION_ID)}`)).status).toBe(404);
    expect(await (await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(DELETE_SESSION_ID)}`)).json())
      .toMatchObject({ items: [] });
  });

  it("DELETE /cart clears all items from the selected guest cart", async () => {
    const first = await addItem({ session_id: CLEAR_SESSION_ID, product_id: productId, quantity: 1 });
    expect(first.status).toBe(201);
    const second = await addItem({ session_id: CLEAR_SESSION_ID, product_id: inactiveProductId, quantity: 1 });
    expect(second.status).toBe(409);

    const otherItem = await addItem({ session_id: CLEAR_SESSION_ID, product_id: secondProductId, quantity: 1 });
    expect(otherItem.status).toBe(201);
    const cleared = await clearCart(`?session_id=${encodeURIComponent(CLEAR_SESSION_ID)}`);
    expect(cleared.status).toBe(204);
    expect(await cleared.text()).toBe("");
    expect(await (await fetch(`${BASE_URL}/cart?session_id=${encodeURIComponent(CLEAR_SESSION_ID)}`)).json())
      .toMatchObject({ cart: { session_id: CLEAR_SESSION_ID }, items: [] });
  });

  it("DELETE /cart rejects invalid sessions and reports missing carts", async () => {
    for (const query of ["", "?session_id=", "?session_id=%20", "?session_id=a&session_id=b", "?other=value"]) {
      expect((await clearCart(query)).status).toBe(400);
    }
    expect((await clearCart(`?session_id=${encodeURIComponent(`${SESSION_ID}-missing`)}`)).status).toBe(404);
    expect((await clearCart(`?session_id=${encodeURIComponent(`${SESSION_ID}-expired`)}`)).status).toBe(404);
  });

  it("POST /cart/merge requires a customer and rejects malformed guest cart identifiers", async () => {
    expect((await mergeCart({ session_id: MERGE_SESSION_ID })).status).toBe(401);
    expect((await mergeCart({ session_id: MERGE_SESSION_ID }, "not-a-valid-token")).status).toBe(401);
    expect((await mergeCart({ session_id: MERGE_SESSION_ID }, vendorToken)).status).toBe(403);
    for (const body of [
      null,
      [],
      {},
      { session_id: "short" },
      { session_id: MERGE_SESSION_ID, user_id: USER_ID },
      { session_id: 123 },
    ]) {
      expect((await mergeCart(body, customerToken)).status).toBe(400);
    }
    expect((await mergeCart({ session_id: `${MERGE_SESSION_ID}-missing` }, customerToken)).status).toBe(404);
    await Cart.create({ session_id: `${MERGE_SESSION_ID}-expired`, expires_at: new Date("2000-01-01T00:00:00Z") });
    expect((await mergeCart({ session_id: `${MERGE_SESSION_ID}-expired` }, customerToken)).status).toBe(404);
  });

  it("POST /cart/merge combines owned carts without exceeding stock and reports skipped items", async () => {
    const source = await Cart.create({ session_id: MERGE_SESSION_ID });
    const target = await Cart.create({ user_id: USER_ID });
    await CartItem.create([
      { cart_id: source.id, product_id: productId, quantity: 3 },
      { cart_id: source.id, product_id: secondProductId, quantity: 4 },
      { cart_id: source.id, product_id: inactiveProductId, quantity: 1 },
      { cart_id: source.id, product_id: new mongoose.Types.ObjectId().toString(), quantity: 1 },
      { cart_id: source.id, product_id: productId, quantity: 0 },
        { cart_id: source.id, product_id: productId, quantity: Number.MAX_SAFE_INTEGER + 1 },
      { cart_id: target.id, product_id: productId, quantity: 1 },
    ]);

    const response = await mergeCart({ session_id: MERGE_SESSION_ID }, customerToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cart_id: target.id,
      merged: [{ product_id: productId, quantity: 3 }],
      partial: [{ product_id: secondProductId, merged_quantity: 2, remaining_quantity: 2 }],
      skipped: expect.arrayContaining([
        { product_id: inactiveProductId, quantity: 1, reason: "product_unavailable" },
        { product_id: expect.any(String), quantity: 1, reason: "product_unavailable" },
        { product_id: productId, quantity: 0, reason: "invalid_quantity" },
        { product_id: productId, quantity: Number.MAX_SAFE_INTEGER + 1, reason: "invalid_quantity" },
      ]),
    });

    expect(await CartItem.findOne({ cart_id: target.id, product_id: productId }).then((item) => item?.quantity)).toBe(4);
    expect(await CartItem.findOne({ cart_id: target.id, product_id: secondProductId }).then((item) => item?.quantity)).toBe(2);
    expect(await CartItem.countDocuments({ cart_id: source.id })).toBe(5);
    await mergeCart({ session_id: MERGE_SESSION_ID }, customerToken);
    expect(await CartItem.findOne({ cart_id: target.id, product_id: productId }).then((item) => item?.quantity)).toBe(4);
  });

  it("POST /cart/validate reports current prices, stock problems, and missing products without mutation", async () => {
    const cart = await Cart.create({ session_id: VALIDATE_SESSION_ID });
    const missingProductId = new mongoose.Types.ObjectId().toString();
    await CartItem.create([
      { cart_id: cart.id, product_id: productId, quantity: 2 },
      { cart_id: cart.id, product_id: secondProductId, quantity: 3 },
      { cart_id: cart.id, product_id: inactiveProductId, quantity: 1 },
      { cart_id: cart.id, product_id: missingProductId, quantity: 1 },
      { cart_id: cart.id, product_id: productId, quantity: 0 },
      { cart_id: cart.id, product_id: productId, quantity: Number.MAX_SAFE_INTEGER + 1 },
    ]);

    const response = await validateCart({ session_id: VALIDATE_SESSION_ID });
    expect(response.status).toBe(200);
    const body = await response.json() as { valid: boolean; subtotal: number; items: Array<Record<string, unknown>> };
    expect(body.valid).toBe(false);
    expect(body.subtotal).toBe(1000);
    expect(body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ product_id: productId, available: true, current_unit_price: 125, line_total: 250 }),
      expect.objectContaining({ product_id: secondProductId, available: false, reason: "insufficient_stock", stock: 2 }),
      expect.objectContaining({ product_id: inactiveProductId, available: false, reason: "product_unavailable", current_unit_price: null }),
      expect.objectContaining({ product_id: missingProductId, available: false, reason: "product_unavailable" }),
      expect.objectContaining({ product_id: productId, quantity: 0, available: false, reason: "invalid_quantity" }),
      expect.objectContaining({ product_id: productId, quantity: Number.MAX_SAFE_INTEGER + 1, available: false, reason: "invalid_quantity" }),
    ]));
    expect(await CartItem.countDocuments({ cart_id: cart.id })).toBe(6);
  });

  it("POST /cart/validate handles empty, missing, expired, and malformed carts", async () => {
    const emptyCart = await Cart.create({ session_id: `${VALIDATE_SESSION_ID}-empty` });
    const emptyResponse = await validateCart({ session_id: `${VALIDATE_SESSION_ID}-empty` });
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({ cart_id: emptyCart.id, valid: true, subtotal: 0, items: [] });

    await Cart.create({ session_id: `${VALIDATE_SESSION_ID}-expired`, expires_at: new Date("2000-01-01T00:00:00Z") });
    expect((await validateCart({ session_id: `${VALIDATE_SESSION_ID}-missing` })).status).toBe(404);
    expect((await validateCart({ session_id: `${VALIDATE_SESSION_ID}-expired` })).status).toBe(404);
    for (const body of [null, [], {}, { session_id: "tiny" }, { session_id: VALIDATE_SESSION_ID, extra: true }, { session_id: 2 }]) {
      expect((await validateCart(body)).status).toBe(400);
    }
  });
});
