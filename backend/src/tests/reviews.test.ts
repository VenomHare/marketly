import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Category, { ICategory } from "../models/Category.js";
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import Product, { IProduct } from "../models/Product.js";
import Review from "../models/Review.js";
import User, { IUser } from "../models/User.js";
import Vendor, { IVendor } from "../models/Vendor.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const TEST_EMAILS = ["reviews-route-customer@test.com", "reviews-route-vendor@test.com"];
const CATEGORY_SLUG = "reviews-route-test";

describe("Review Routes", () => {
  let customer: IUser;
  let vendorUser: IUser;
  let vendor: IVendor;
  let category: ICategory;
  let product: IProduct;
  let draftProduct: IProduct;
  let customerToken: string;
  let vendorToken: string;

  const tokenFor = (user: IUser) => jwt.sign(
    { id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" }
  );

  const createReviewRequest = (id: string, body: unknown, token?: string) => fetch(
    `${BASE_URL}/products/${id}/reviews`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );

  const updateReviewRequest = (id: string, body: unknown, token?: string) => fetch(
    `${BASE_URL}/reviews/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );

  const deleteReviewRequest = (id: string, token?: string) => fetch(`${BASE_URL}/reviews/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const createReviewTestProduct = () => Product.create({
    vendor_id: vendor.id, category_id: category.id, name: "Review Mutation Product", description: "Review test item",
    sku: `REVIEW-MUTATION-${new mongoose.Types.ObjectId()}`, price: 10, stock: 1, status: "active",
  });

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const oldUsers = await User.find({ email: { $in: TEST_EMAILS } }).select("_id");
    const oldVendors = await Vendor.find({ user_id: { $in: oldUsers.map((user) => user.id) } }).select("_id");
    const oldProducts = await Product.find({ vendor_id: { $in: oldVendors.map((item) => item.id) } }).select("_id");
    const oldOrders = await Order.find({ user_id: { $in: oldUsers.map((user) => user.id) } }).select("_id");
    await Review.deleteMany({ product_id: { $in: oldProducts.map((item) => item.id) } });
    await OrderItem.deleteMany({ order_id: { $in: oldOrders.map((item) => item.id) } });
    await Order.deleteMany({ _id: { $in: oldOrders.map((item) => item.id) } });
    await Product.deleteMany({ vendor_id: { $in: oldVendors.map((item) => item.id) } });
    await Vendor.deleteMany({ user_id: { $in: oldUsers.map((user) => user.id) } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await Category.deleteMany({ slug: CATEGORY_SLUG });

    const users = await User.create([
      { name: "Review Customer", email: TEST_EMAILS[0], password_hash: "not-used", role: "customer", status: "active" },
      { name: "Review Vendor", email: TEST_EMAILS[1], password_hash: "not-used", role: "vendor", status: "active" },
    ]);
    const createdCustomer = users[0];
    const createdVendorUser = users[1];
    if (!createdCustomer || !createdVendorUser) throw new Error("Failed to create review route test users");
    customer = createdCustomer;
    vendorUser = createdVendorUser;
    vendor = await Vendor.create({
      user_id: vendorUser.id,
      name: "Review Route Shop",
      display_name: "Review Route Store",
      address: "1 Review St",
      postal_code: "12345",
      kyc_status: "verified",
      commission_rate_bps: 0,
    });
    category = await Category.create({ name: "Review Route Category", slug: CATEGORY_SLUG });
    [product, draftProduct] = await Product.create([
      {
        vendor_id: vendor.id, category_id: category.id, name: "Reviewable Product", description: "Active item",
        sku: `REVIEW-${new mongoose.Types.ObjectId()}`, price: 15, stock: 2, status: "active",
      },
      {
        vendor_id: vendor.id, category_id: category.id, name: "Draft Product", description: "Inactive item",
        sku: `REVIEW-${new mongoose.Types.ObjectId()}`, price: 5, stock: 1, status: "draft",
      },
    ]);
    await Review.create([
      { product_id: product.id, user_id: new mongoose.Types.ObjectId().toString(), order_item_id: new mongoose.Types.ObjectId().toString(), rating: 4, title: "Older review", comment: "Older", created_at: new Date("2023-01-01T00:00:00Z") },
      { product_id: product.id, user_id: new mongoose.Types.ObjectId().toString(), order_item_id: new mongoose.Types.ObjectId().toString(), rating: 5, title: "Newest review", comment: "Newest", created_at: new Date("2025-01-01T00:00:00Z") },
      { product_id: product.id, user_id: new mongoose.Types.ObjectId().toString(), order_item_id: new mongoose.Types.ObjectId().toString(), rating: 3, comment: "Middle", created_at: new Date("2024-01-01T00:00:00Z") },
    ]);
    customerToken = tokenFor(customer);
    vendorToken = tokenFor(vendorUser);
  });

  afterAll(async () => {
    const userIds = [customer?.id, vendorUser?.id].filter(Boolean);
    const orders = await Order.find({ user_id: { $in: userIds } }).select("_id");
    await OrderItem.deleteMany({ order_id: { $in: orders.map((order) => order.id) } });
    await Order.deleteMany({ _id: { $in: orders.map((order) => order.id) } });
    if (vendor) {
      const products = await Product.find({ vendor_id: vendor.id }).select("_id");
      await Review.deleteMany({ product_id: { $in: products.map((item) => item.id) } });
      await Product.deleteMany({ vendor_id: vendor.id });
      await Vendor.deleteOne({ _id: vendor.id });
    }
    await Category.deleteMany({ slug: CATEGORY_SLUG });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await mongoose.connection.close();
  });

  describe("GET /products/:uuid/reviews", () => {
    it("returns public reviews newest first without exposing reviewer or order IDs", async () => {
      const response = await fetch(`${BASE_URL}/products/${product.id}/reviews`);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        reviews: Array<{ id: string; rating: number; title?: string; comment: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(body.pagination).toMatchObject({ page: 1, limit: 20, total: 3, pages: 1 });
      expect(body.reviews.map((review) => review.title ?? review.comment)).toEqual(["Newest review", "Middle", "Older review"]);
      expect(body.reviews[0]).not.toHaveProperty("user_id");
      expect(body.reviews[0]).not.toHaveProperty("order_item_id");
    });

    it("paginates reviews and validates query parameters", async () => {
      const firstPageResponse = await fetch(`${BASE_URL}/products/${product.id}/reviews?page=1&limit=1`);
      expect(firstPageResponse.status).toBe(200);
      const firstPage = await firstPageResponse.json() as {
        reviews: Array<{ title?: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(firstPage.reviews).toHaveLength(1);
      expect(firstPage.reviews[0]!.title).toBe("Newest review");
      expect(firstPage.pagination).toMatchObject({ page: 1, limit: 1, total: 3, pages: 3 });
      expect(await (await fetch(`${BASE_URL}/products/${product.id}/reviews?page=9&limit=1`)).json()).toMatchObject({
        reviews: [], pagination: { page: 9, limit: 1, total: 3, pages: 3 },
      });
      const maxLimit = await fetch(`${BASE_URL}/products/${product.id}/reviews?limit=100`);
      expect(maxLimit.status).toBe(200);
      expect((await maxLimit.json()).reviews).toHaveLength(3);
      for (const query of ["?page=0", "?page=1.5", "?page=nope", "?limit=0", "?limit=101", "?limit=nope", "?other=value"]) {
        expect((await fetch(`${BASE_URL}/products/${product.id}/reviews${query}`)).status).toBe(400);
      }
    });

    it("rejects invalid IDs and hides missing or inactive products", async () => {
      expect((await fetch(`${BASE_URL}/products/invalid-id/reviews`)).status).toBe(400);
      expect((await fetch(`${BASE_URL}/products/${new mongoose.Types.ObjectId()}/reviews`)).status).toBe(404);
      expect((await fetch(`${BASE_URL}/products/${draftProduct.id}/reviews`)).status).toBe(404);
      const archivedProduct = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Review Product", description: "Archived item",
        sku: `REVIEW-${new mongoose.Types.ObjectId()}`, price: 5, stock: 0, status: "archived",
      });
      expect((await fetch(`${BASE_URL}/products/${archivedProduct.id}/reviews`)).status).toBe(404);
    });

    it("returns an empty page for an active product with no reviews", async () => {
      const emptyProduct = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "No Review Product", description: "No reviews",
        sku: `NO-REVIEWS-${new mongoose.Types.ObjectId()}`, price: 4, stock: 1, status: "active",
      });
      const response = await fetch(`${BASE_URL}/products/${emptyProduct.id}/reviews`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reviews: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
      expect(await (await fetch(`${BASE_URL}/products/${emptyProduct.id}/reviews?page=3&limit=2`)).json()).toMatchObject({
        reviews: [], pagination: { page: 3, limit: 2, total: 0, pages: 0 },
      });
    });
  });

  describe("POST /products/:uuid/reviews", () => {
    it("requires an authenticated customer and valid parameters", async () => {
      expect((await createReviewRequest(product.id, {})).status).toBe(401);
      expect((await createReviewRequest(product.id, {}, "malformed-token")).status).toBe(401);
      const expiredToken = jwt.sign({ id: customer.id, email: customer.email, role: "customer" }, JWT_SECRET, { expiresIn: -1 });
      expect((await createReviewRequest(product.id, {}, expiredToken)).status).toBe(401);
      expect((await createReviewRequest(product.id, {}, vendorToken)).status).toBe(403);
      expect((await createReviewRequest("invalid-id", {}, customerToken)).status).toBe(400);
      const invalidBodies = [
        {},
        { order_item_id: "bad-id", rating: 4, comment: "Valid comment" },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 0, comment: "Valid comment" },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 6, comment: "Valid comment" },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 4.5, comment: "Valid comment" },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 4, title: "  ", comment: "Valid comment" },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 4, comment: "  " },
        { order_item_id: new mongoose.Types.ObjectId().toString(), rating: 4, comment: "Valid comment", extra: true },
      ];
      for (const body of invalidBodies) {
        expect((await createReviewRequest(product.id, body, customerToken)).status).toBe(400);
      }
    });

    it("creates one review for the customer's completed paid purchase and updates its rating", async () => {
      const order = await Order.create({
        user_id: customer.id, address_snapshot: {}, subtotal_paise: 1500, discount_paise: 0,
        shipping_paise: 0, total_paise: 1500, payment_status: "paid", status: "completed",
      });
      const orderItem = await OrderItem.create({
        order_id: order.id, product_id: product.id, vendor_id: vendor.id, product_name: product.name,
        sku: product.sku, unit_price_paise: 1500, quantity: 1, discount_paise: 0, line_total_paise: 1500,
      });
      const payload = { order_item_id: orderItem.id, rating: 5, title: "Great", comment: "Exactly as described" };
      const response = await createReviewRequest(product.id, payload, customerToken);
      expect(response.status).toBe(201);
      const body = await response.json() as { id: string; product_id: string; rating: number; title: string; comment: string };
      expect(body).toMatchObject({ product_id: product.id, rating: 5, title: "Great", comment: "Exactly as described" });
      expect(body.id).toBeTruthy();
      expect(body).not.toHaveProperty("user_id");
      expect(body).not.toHaveProperty("order_item_id");
      expect((await createReviewRequest(product.id, payload, customerToken)).status).toBe(409);
      const lowRatingOrder = await Order.create({
        user_id: customer.id, address_snapshot: {}, subtotal_paise: 1500, discount_paise: 0,
        shipping_paise: 0, total_paise: 1500, payment_status: "paid", status: "completed",
      });
      const lowRatingItem = await OrderItem.create({
        order_id: lowRatingOrder.id, product_id: product.id, vendor_id: vendor.id, product_name: product.name,
        sku: product.sku, unit_price_paise: 1500, quantity: 1, discount_paise: 0, line_total_paise: 1500,
      });
      const lowestRating = await createReviewRequest(product.id, {
        order_item_id: lowRatingItem.id, rating: 1, comment: "Lowest valid rating",
      }, customerToken);
      expect(lowestRating.status).toBe(201);
      expect(await lowestRating.json()).toMatchObject({ rating: 1, comment: "Lowest valid rating" });
      const updatedProduct = await Product.findById(product.id);
      expect(updatedProduct?.average_rating).toBe(3.6);
      expect(updatedProduct?.review_count).toBe(5);
    });

    it("rejects purchases that belong to another customer and inactive products", async () => {
      const order = await Order.create({
        user_id: vendorUser.id, address_snapshot: {}, subtotal_paise: 500, discount_paise: 0,
        shipping_paise: 0, total_paise: 500, payment_status: "paid", status: "completed",
      });
      const orderItem = await OrderItem.create({
        order_id: order.id, product_id: product.id, vendor_id: vendor.id, product_name: product.name,
        sku: product.sku, unit_price_paise: 500, quantity: 1, discount_paise: 0, line_total_paise: 500,
      });
      const payload = { order_item_id: orderItem.id, rating: 4, comment: "Good" };
      expect((await createReviewRequest(product.id, payload, customerToken)).status).toBe(403);
      expect((await createReviewRequest(draftProduct.id, payload, customerToken)).status).toBe(404);
      const unrelatedItemId = new mongoose.Types.ObjectId().toString();
      expect((await createReviewRequest(product.id, { ...payload, order_item_id: unrelatedItemId }, customerToken)).status).toBe(403);
    });

    it("requires a paid and completed order and an order item for the requested product", async () => {
      const orders = await Order.create([
        { user_id: customer.id, address_snapshot: {}, subtotal_paise: 500, discount_paise: 0, shipping_paise: 0, total_paise: 500, payment_status: "paid", status: "placed" },
        { user_id: customer.id, address_snapshot: {}, subtotal_paise: 500, discount_paise: 0, shipping_paise: 0, total_paise: 500, payment_status: "pending", status: "completed" },
      ]);
      const items = await OrderItem.create(orders.map((order) => ({
        order_id: order.id, product_id: product.id, vendor_id: vendor.id, product_name: product.name,
        sku: product.sku, unit_price_paise: 500, quantity: 1, discount_paise: 0, line_total_paise: 500,
      })));
      for (const item of items) {
        const response = await createReviewRequest(product.id, {
          order_item_id: item.id, rating: 4, comment: "Not an eligible order",
        }, customerToken);
        expect(response.status).toBe(403);
      }
      const completedOrder = await Order.create({
        user_id: customer.id, address_snapshot: {}, subtotal_paise: 500, discount_paise: 0,
        shipping_paise: 0, total_paise: 500, payment_status: "paid", status: "completed",
      });
      const wrongProductItem = await OrderItem.create({
        order_id: completedOrder.id, product_id: draftProduct.id, vendor_id: vendor.id,
        product_name: draftProduct.name, sku: draftProduct.sku, unit_price_paise: 500,
        quantity: 1, discount_paise: 0, line_total_paise: 500,
      });
      expect((await createReviewRequest(product.id, {
        order_item_id: wrongProductItem.id, rating: 4, comment: "Wrong product",
      }, customerToken)).status).toBe(403);
    });
  });

  describe("GET /reviews/:uuid", () => {
    it("returns review details without exposing user or order IDs", async () => {
      const review = await Review.findOne({ product_id: product.id });
      const response = await fetch(`${BASE_URL}/reviews/${review!.id}`);
      expect(response.status).toBe(200);
      const body = await response.json() as { id: string; product_id: string; rating: number; comment: string };
      expect(body).toMatchObject({ id: review!.id, product_id: product.id, rating: review!.rating, comment: review!.comment });
      expect(body).not.toHaveProperty("user_id");
      expect(body).not.toHaveProperty("order_item_id");
      expect((await fetch(`${BASE_URL}/reviews/invalid-id`)).status).toBe(400);
      expect((await fetch(`${BASE_URL}/reviews/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    });
  });

  describe("PATCH /reviews/:uuid", () => {
    it("allows a customer to update their own review and refreshes product ratings", async () => {
      const mutationProduct = await createReviewTestProduct();
      const review = await Review.create({
        product_id: mutationProduct.id, user_id: customer.id,
        order_item_id: new mongoose.Types.ObjectId().toString(), rating: 2, comment: "Needs improvement",
      });
      const response = await updateReviewRequest(review.id, { rating: 5, title: "Updated", comment: "Much better" }, customerToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ rating: 5, title: "Updated", comment: "Much better" });
      const updatedProduct = await Product.findById(mutationProduct.id);
      expect(updatedProduct?.average_rating).toBe(5);
      expect(updatedProduct?.review_count).toBe(1);
    });

    it("requires customer authentication, valid parameters, and review ownership", async () => {
      const review = await Review.create({
        product_id: (await createReviewTestProduct()).id, user_id: customer.id,
        order_item_id: new mongoose.Types.ObjectId().toString(), rating: 3, comment: "Editable review",
      });
      expect((await updateReviewRequest(review.id, { rating: 4 })).status).toBe(401);
      expect((await updateReviewRequest(review.id, { rating: 4 }, "malformed-token")).status).toBe(401);
      const expiredToken = jwt.sign({ id: customer.id, email: customer.email, role: "customer" }, JWT_SECRET, { expiresIn: -1 });
      expect((await updateReviewRequest(review.id, { rating: 4 }, expiredToken)).status).toBe(401);
      expect((await updateReviewRequest(review.id, { rating: 4 }, vendorToken)).status).toBe(403);
      expect((await updateReviewRequest("bad-id", { rating: 4 }, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(review.id, {}, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(review.id, { rating: 9 }, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(review.id, { title: "  " }, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(review.id, { comment: "  " }, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(review.id, { rating: 4, extra: "no" }, customerToken)).status).toBe(400);
      expect((await updateReviewRequest(new mongoose.Types.ObjectId().toString(), { rating: 4 }, customerToken)).status).toBe(404);
      const otherCustomerToken = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "other-customer@test.com", role: "customer" }, JWT_SECRET
      );
      expect((await updateReviewRequest(review.id, { rating: 1 }, otherCustomerToken)).status).toBe(404);
      expect((await Review.findById(review.id))?.rating).toBe(3);
    });
  });

  describe("DELETE /reviews/:uuid", () => {
    it("allows a customer to delete their own review and refreshes product ratings", async () => {
      const mutationProduct = await createReviewTestProduct();
      const review = await Review.create({
        product_id: mutationProduct.id, user_id: customer.id,
        order_item_id: new mongoose.Types.ObjectId().toString(), rating: 5, comment: "Remove me",
      });
      const deleted = await deleteReviewRequest(review.id, customerToken);
      expect(deleted.status).toBe(204);
      expect(await Review.findById(review.id)).toBeNull();
      const updatedProduct = await Product.findById(mutationProduct.id);
      expect(updatedProduct?.average_rating).toBe(0);
      expect(updatedProduct?.review_count).toBe(0);
    });

    it("requires customer authentication, valid IDs, and review ownership", async () => {
      const review = await Review.create({
        product_id: (await createReviewTestProduct()).id, user_id: customer.id,
        order_item_id: new mongoose.Types.ObjectId().toString(), rating: 3, comment: "Protected review",
      });
      expect((await deleteReviewRequest(review.id)).status).toBe(401);
      expect((await deleteReviewRequest(review.id, "malformed-token")).status).toBe(401);
      const expiredToken = jwt.sign({ id: customer.id, email: customer.email, role: "customer" }, JWT_SECRET, { expiresIn: -1 });
      expect((await deleteReviewRequest(review.id, expiredToken)).status).toBe(401);
      expect((await deleteReviewRequest(review.id, vendorToken)).status).toBe(403);
      expect((await deleteReviewRequest("bad-id", customerToken)).status).toBe(400);
      expect((await deleteReviewRequest(new mongoose.Types.ObjectId().toString(), customerToken)).status).toBe(404);
      const otherCustomerToken = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "other-customer@test.com", role: "customer" }, JWT_SECRET
      );
      expect((await deleteReviewRequest(review.id, otherCustomerToken)).status).toBe(404);
      expect(await Review.findById(review.id)).not.toBeNull();
      expect((await deleteReviewRequest(review.id, customerToken)).status).toBe(204);
      expect((await deleteReviewRequest(review.id, customerToken)).status).toBe(404);
    });
  });

  describe("GET /users/me/reviews", () => {
    it("requires a customer and returns only their paginated reviews", async () => {
      const existingOwnReviewCount = await Review.countDocuments({ user_id: customer.id });
      const ownReviews = await Review.create([
        { product_id: product.id, user_id: customer.id, order_item_id: new mongoose.Types.ObjectId().toString(), rating: 3, comment: "My older review", created_at: new Date("2098-01-01T00:00:00Z") },
        { product_id: product.id, user_id: customer.id, order_item_id: new mongoose.Types.ObjectId().toString(), rating: 5, comment: "My newer review", created_at: new Date("2099-01-01T00:00:00Z") },
      ]);
      const headers = { Authorization: `Bearer ${customerToken}` };
      expect((await fetch(`${BASE_URL}/users/me/reviews`)).status).toBe(401);
      expect((await fetch(`${BASE_URL}/users/me/reviews`, { headers: { Authorization: "Bearer malformed-token" } })).status).toBe(401);
      const expiredToken = jwt.sign(
        { id: customer.id, email: customer.email, role: "customer" }, JWT_SECRET, { expiresIn: -1 }
      );
      expect((await fetch(`${BASE_URL}/users/me/reviews`, { headers: { Authorization: `Bearer ${expiredToken}` } })).status).toBe(401);
      expect((await fetch(`${BASE_URL}/users/me/reviews`, { headers: { Authorization: `Bearer ${vendorToken}` } })).status).toBe(403);

      const response = await fetch(`${BASE_URL}/users/me/reviews?page=1&limit=1`, { headers });
      expect(response.status).toBe(200);
      const body = await response.json() as {
        reviews: Array<{ id: string; product_id: string; rating: number; comment: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(body.reviews).toHaveLength(1);
      expect(body.reviews[0]).toMatchObject({ id: ownReviews[1]!.id, product_id: product.id, comment: "My newer review" });
      expect(body.reviews[0]).not.toHaveProperty("order_item_id");
      expect(body.pagination).toMatchObject({
        page: 1, limit: 1, total: existingOwnReviewCount + 2, pages: existingOwnReviewCount + 2,
      });
      for (const query of ["?page=0", "?limit=101", "?extra=yes"]) {
        expect((await fetch(`${BASE_URL}/users/me/reviews${query}`, { headers })).status).toBe(400);
      }

      const maximumPageSize = await fetch(`${BASE_URL}/users/me/reviews?limit=100`, { headers });
      expect(maximumPageSize.status).toBe(200);
      expect((await maximumPageSize.json()).reviews.length).toBe(existingOwnReviewCount + 2);
      const beyondLastPage = await fetch(`${BASE_URL}/users/me/reviews?page=99&limit=1`, { headers });
      expect(await beyondLastPage.json()).toMatchObject({
        reviews: [],
        pagination: { page: 99, limit: 1, total: existingOwnReviewCount + 2, pages: existingOwnReviewCount + 2 },
      });
    });

    it("returns an empty paginated list when the customer has no reviews", async () => {
      const emptyCustomer = await User.create({
        name: "Customer Without Reviews",
        email: `reviews-empty-${new mongoose.Types.ObjectId()}@test.com`,
        password_hash: "not-used",
        role: "customer",
        status: "active",
      });
      try {
        const emptyToken = tokenFor(emptyCustomer);
        const response = await fetch(`${BASE_URL}/users/me/reviews`, {
          headers: { Authorization: `Bearer ${emptyToken}` },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          reviews: [],
          pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        });
      } finally {
        await User.deleteOne({ _id: emptyCustomer.id });
      }
    });
  });
});
