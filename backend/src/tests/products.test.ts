import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Category, { ICategory } from "../models/Category.js";
import Product, { IProduct } from "../models/Product.js";
import ProductImage from "../models/ProductImage.js";
import Review from "../models/Review.js";
import User, { IUser } from "../models/User.js";
import Vendor, { IVendor } from "../models/Vendor.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const TEST_EMAILS = ["products-create-vendor@test.com", "products-create-customer@test.com", "products-other-vendor@test.com"];

interface ProductListItem {
  id: string;
  vendor_id: string;
  category_id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  stock: number;
  average_rating: number;
  review_count: number;
  status: "draft" | "active" | "archived";
}

interface ProductListResponse {
  products: ProductListItem[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

describe("Product Routes", () => {
  let vendorUser: IUser;
  let customer: IUser;
  let otherVendorUser: IUser;
  let vendor: IVendor;
  let otherVendor: IVendor;
  let category: ICategory;
  let verifiedVendorToken: string;
  let customerToken: string;
  let otherVendorToken: string;
  let publicProducts: IProduct[];
  let otherVendorProduct: IProduct;

  const tokenFor = (user: IUser) => jwt.sign(
    { id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" }
  );

  const validPayload = () => ({
    category_id: category.id,
    name: "Valid Product",
    description: "A test product",
    sku: `CREATE-${new mongoose.Types.ObjectId().toString()}`,
    price: 12.5,
    stock: 4,
  });

  const createProductRequest = (body: unknown, token?: string) => fetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const getProductsRequest = (query = "") => fetch(`${BASE_URL}/products${query}`);

  const getOwnVendorProductsRequest = (query = "", token?: string) => fetch(`${BASE_URL}/vendors/me/products${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const updateProductRequest = (id: string, body: unknown, token?: string) => fetch(`${BASE_URL}/products/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const deleteProductRequest = (id: string, token?: string) => fetch(`${BASE_URL}/products/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const updateProductStatusRequest = (id: string, body: unknown, token?: string) => fetch(`${BASE_URL}/products/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const updateProductStockRequest = (id: string, body: unknown, token?: string) => fetch(`${BASE_URL}/products/${id}/stock`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const createOwnedDraftProduct = () => Product.create({
    vendor_id: vendor.id,
    category_id: category.id,
    name: "Route Test Product",
    description: "Created for a route test",
    sku: `ROUTE-${new mongoose.Types.ObjectId()}`,
    price: 10,
    stock: 3,
    status: "draft",
  });

  const addProductImageRequest = (id: string, body: unknown, token?: string) => fetch(`${BASE_URL}/products/${id}/image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const removeProductImageRequest = (id: string, imageId: string, token?: string) => fetch(
    `${BASE_URL}/products/${id}/image/${imageId}`,
    { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );

  const reorderProductImagesRequest = (id: string, body: unknown, token?: string) => fetch(
    `${BASE_URL}/products/${id}/images/reorder`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const existingUsers = await User.find({ email: { $in: TEST_EMAILS } }).select("_id");
    const existingVendors = await Vendor.find({ user_id: { $in: existingUsers.map((user) => user.id) } }).select("_id");
    const existingProducts = await Product.find({ vendor_id: { $in: existingVendors.map((item) => item.id) } }).select("_id");
    await Review.deleteMany({ product_id: { $in: existingProducts.map((product) => product.id) } });
    await ProductImage.deleteMany({ product_id: { $in: existingProducts.map((product) => product.id) } });
    await Product.deleteMany({ vendor_id: { $in: existingVendors.map((item) => item.id) } });
    await Vendor.deleteMany({ user_id: { $in: existingUsers.map((user) => user.id) } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await Category.deleteMany({ slug: "products-create-test" });

    const createdUsers = await User.create([
      { name: "Product Vendor", email: TEST_EMAILS[0], password_hash: "not-used", role: "vendor", status: "active" },
      { name: "Product Customer", email: TEST_EMAILS[1], password_hash: "not-used", role: "customer", status: "active" },
      { name: "Other Product Vendor", email: TEST_EMAILS[2], password_hash: "not-used", role: "vendor", status: "active" },
    ]);
    const createdVendorUser = createdUsers[0];
    const createdCustomer = createdUsers[1];
    const createdOtherVendorUser = createdUsers[2];
    if (!createdVendorUser || !createdCustomer || !createdOtherVendorUser) {
      throw new Error("Failed to create product route test users");
    }
    vendorUser = createdVendorUser;
    customer = createdCustomer;
    otherVendorUser = createdOtherVendorUser;
    vendor = await Vendor.create({
      user_id: vendorUser.id,
      name: "Product Test Shop",
      display_name: "Product Test Store",
      address: "1 Test St",
      postal_code: "12345",
      kyc_status: "verified",
      commission_rate_bps: 0,
    });
    otherVendor = await Vendor.create({
      user_id: otherVendorUser.id,
      name: "Other Product Shop",
      display_name: "Other Product Store",
      address: "2 Test St",
      postal_code: "54321",
      kyc_status: "verified",
      commission_rate_bps: 0,
    });
    category = await Category.create({ name: "Product Test Category", slug: "products-create-test" });
    publicProducts = await Product.create([
      {
        vendor_id: vendor.id, category_id: category.id, name: "Public Alpha", description: "Red cotton item",
        sku: `LIST-${new mongoose.Types.ObjectId()}`, price: 5, stock: 8, status: "active",
        created_at: new Date("2024-01-01T00:00:00Z"),
      },
      {
        vendor_id: vendor.id, category_id: category.id, name: "Public Beta", description: "Blue cotton item",
        sku: `LIST-${new mongoose.Types.ObjectId()}`, price: 15, stock: 0, status: "active",
        created_at: new Date("2024-01-02T00:00:00Z"),
      },
      {
        vendor_id: vendor.id, category_id: category.id, name: "Private Draft", description: "Hidden item",
        sku: `LIST-${new mongoose.Types.ObjectId()}`, price: 1, stock: 3, status: "draft",
      },
    ]);
    await Review.create([
      {
        product_id: publicProducts[0]!.id,
        user_id: new mongoose.Types.ObjectId().toString(),
        order_item_id: new mongoose.Types.ObjectId().toString(),
        rating: 4,
        title: "Older review",
        comment: "An older review",
        created_at: new Date("2023-01-01T00:00:00Z"),
      },
      {
        product_id: publicProducts[0]!.id,
        user_id: new mongoose.Types.ObjectId().toString(),
        order_item_id: new mongoose.Types.ObjectId().toString(),
        rating: 5,
        title: "Newest review",
        comment: "The newest review",
        created_at: new Date("2025-01-01T00:00:00Z"),
      },
      {
        product_id: publicProducts[0]!.id,
        user_id: new mongoose.Types.ObjectId().toString(),
        order_item_id: new mongoose.Types.ObjectId().toString(),
        rating: 3,
        comment: "A middle review",
        created_at: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    otherVendorProduct = await Product.create({
      vendor_id: otherVendor.id, category_id: category.id, name: "Other Vendor Product",
      description: "Must stay private", sku: `OTHER-${new mongoose.Types.ObjectId()}`,
      price: 99, stock: 9, status: "active",
    });
    verifiedVendorToken = tokenFor(vendorUser);
    customerToken = tokenFor(customer);
    otherVendorToken = tokenFor(otherVendorUser);
  });

  afterAll(async () => {
    if (vendor && otherVendor) {
      const products = await Product.find({ vendor_id: { $in: [vendor.id, otherVendor.id] } }).select("_id");
      await Review.deleteMany({ product_id: { $in: products.map((product) => product.id) } });
      await ProductImage.deleteMany({ product_id: { $in: products.map((product) => product.id) } });
      await Product.deleteMany({ vendor_id: { $in: [vendor.id, otherVendor.id] } });
    }
    await Category.deleteMany({ slug: "products-create-test" });
    await Vendor.deleteMany({ user_id: { $in: [vendorUser?.id, otherVendorUser?.id].filter(Boolean) } });
    await User.deleteMany({ email: { $in: TEST_EMAILS } });
    await mongoose.connection.close();
  });

  describe("POST /products", () => {
    it("requires authentication and a vendor role", async () => {
      const unauthenticated = await createProductRequest({});
      expect(unauthenticated.status).toBe(401);

      const customerResponse = await createProductRequest({}, customerToken);
      expect(customerResponse.status).toBe(403);
    });

    it("rejects malformed and expired tokens", async () => {
      const malformed = await createProductRequest({}, "not-a-jwt");
      expect(malformed.status).toBe(401);

      const expiredToken = jwt.sign(
        { id: vendorUser.id, email: vendorUser.email, role: "vendor" }, JWT_SECRET, { expiresIn: -1 }
      );
      const expired = await createProductRequest({}, expiredToken);
      expect(expired.status).toBe(401);
    });

    it("requires a vendor profile and verified KYC", async () => {
      const profilelessToken = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "missing@test.com", role: "vendor" }, JWT_SECRET
      );
      const profileless = await createProductRequest({}, profilelessToken);
      expect(profileless.status).toBe(403);

      vendor.kyc_status = "pending";
      await vendor.save();
      const unverified = await createProductRequest({}, verifiedVendorToken);
      expect(unverified.status).toBe(403);
      vendor.kyc_status = "verified";
      await vendor.save();
    });

    it("rejects missing, blank, mistyped, out-of-range, and unknown fields", async () => {
      const payload = validPayload();
      const invalidPayloads = [
        {},
        { ...payload, name: "   " },
        { ...payload, description: "" },
        { ...payload, sku: " " },
        { ...payload, price: 0 },
        { ...payload, price: -1 },
        { ...payload, price: "12.5" },
        { ...payload, stock: -1 },
        { ...payload, stock: 1.5 },
        { ...payload, stock: "4" },
        { ...payload, category_id: "invalid-id" },
        { ...payload, unexpected: true },
      ];
      for (const [index, invalidPayload] of invalidPayloads.entries()) {
        const response = await createProductRequest(invalidPayload, verifiedVendorToken);
        expect(response.status, `invalid payload at index ${index}: ${JSON.stringify(invalidPayload)}`).toBe(400);
      }
    });

    it("rejects a well-formed but nonexistent category", async () => {
      const response = await createProductRequest(
        { ...validPayload(), category_id: new mongoose.Types.ObjectId().toString() }, verifiedVendorToken
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("message", "Invalid category");
    });

    it("creates a draft product owned by the authenticated vendor with defaults", async () => {
      const payload = validPayload();
      const response = await createProductRequest(payload, verifiedVendorToken);
      expect(response.status).toBe(201);
      const created = await response.json() as ProductListItem & { created_at: string; updated_at: string };
      expect(created).toMatchObject({
        vendor_id: vendor.id,
        category_id: category.id,
        name: payload.name,
        description: payload.description,
        sku: payload.sku,
        price: payload.price,
        stock: payload.stock,
        average_rating: 0,
        review_count: 0,
        status: "draft",
      });
      expect(created.id).toBeTruthy();
      expect(created.created_at).toBeTruthy();
      expect(created.updated_at).toBeTruthy();
      expect(created).not.toHaveProperty("password_hash");
    });

    it("rejects a duplicate SKU", async () => {
      const payload = validPayload();
      const first = await createProductRequest(payload, verifiedVendorToken);
      expect(first.status).toBe(201);
      const duplicate = await createProductRequest(payload, verifiedVendorToken);
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toHaveProperty("message", "SKU already exists");
    });
  });

  describe("GET /products", () => {
    it("returns active products publicly with default pagination and no private fields", async () => {
      const response = await getProductsRequest(`?category_id=${category.id}`);
      expect(response.status).toBe(200);
      const body = await response.json() as ProductListResponse;
      expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(body.pagination.total).toBeGreaterThanOrEqual(2);
      expect(body.pagination.total_pages).toBeGreaterThanOrEqual(1);
      expect(body.products.some((product) => product.id === publicProducts[0]!.id)).toBe(true);
      expect(body.products.some((product) => product.id === publicProducts[1]!.id)).toBe(true);
      expect(body.products.some((product) => product.id === publicProducts[2]!.id)).toBe(false);
      expect(body.products[0]!).not.toHaveProperty("__v");
      expect(body.products[0]!).not.toHaveProperty("_id");
    });

    it("filters by category and case-insensitive text search", async () => {
      const categoryResponse = await getProductsRequest(`?category_id=${category.id}`);
      expect(categoryResponse.status).toBe(200);
      const categoryBody: ProductListResponse = await categoryResponse.json() as ProductListResponse;
      expect(categoryBody.products.length).toBeGreaterThanOrEqual(2);
      expect(categoryBody.products.every((product) => product.category_id === category.id)).toBe(true);

      const searchResponse = await getProductsRequest("?search=RED+COTTON");
      expect(searchResponse.status).toBe(200);
      const searchBody: ProductListResponse = await searchResponse.json() as ProductListResponse;
      expect(searchBody.products.map((product) => product.name)).toContain("Public Alpha");
      expect(searchBody.products.map((product) => product.name)).not.toContain("Public Beta");
    });

    it("paginates results and applies supported price sorting", async () => {
      const pageResponse = await getProductsRequest(`?category_id=${category.id}&search=Public&limit=1&page=2&sort=price_asc`);
      expect(pageResponse.status).toBe(200);
      const page: ProductListResponse = await pageResponse.json() as ProductListResponse;
      expect(page.pagination).toMatchObject({ page: 2, limit: 1 });
      expect(page.products).toHaveLength(1);
      expect(page.products[0]!.price).toBe(15);

      const descendingResponse = await getProductsRequest(`?category_id=${category.id}&search=Public&sort=price_desc`);
      const descending: ProductListResponse = await descendingResponse.json() as ProductListResponse;
      expect(descending.products[0]!.price).toBe(15);
    });

    it("returns an empty page when no products match", async () => {
      const response = await getProductsRequest(`?category_id=${new mongoose.Types.ObjectId()}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        products: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
      });
    });

    it("rejects malformed pagination, filters, sorting, and unknown query parameters", async () => {
      for (const query of [
        "?page=0", "?page=1.5", "?page=abc", "?limit=0", "?limit=101", "?limit=nope",
        "?category_id=bad-id", "?search=", "?sort=random", "?unexpected=true",
      ]) {
        const response = await getProductsRequest(query);
        expect(response.status).toBe(400);
      }
    });
  });

  describe("GET /products/:uuid", () => {
    it("returns an active product by id without requiring authentication", async () => {
      const response = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: publicProducts[0]!.id,
        vendor_id: vendor.id,
        category_id: category.id,
        name: "Public Alpha",
        status: "active",
      });
    });

    it("rejects malformed IDs and returns 404 for missing or non-public products", async () => {
      const malformed = await fetch(`${BASE_URL}/products/not-an-id`);
      expect(malformed.status).toBe(400);

      const missing = await fetch(`${BASE_URL}/products/${new mongoose.Types.ObjectId()}`);
      expect(missing.status).toBe(404);

      const draft = await fetch(`${BASE_URL}/products/${publicProducts[2]!.id}`);
      expect(draft.status).toBe(404);
    });
  });

  describe("PATCH /products/:uuid", () => {
    it("requires a verified vendor and restricts updates to the owning vendor", async () => {
      const productId = publicProducts[2]!.id;
      expect((await updateProductRequest(productId, { name: "Changed" })).status).toBe(401);
      expect((await updateProductRequest(productId, { name: "Changed" }, customerToken)).status).toBe(403);
      expect((await updateProductRequest(productId, { name: "Changed" }, otherVendorToken)).status).toBe(404);
    });

    it("does not disclose SKU or category validation results to a non-owner", async () => {
      const productId = publicProducts[2]!.id;
      const before = await Product.findById(productId).lean();
      const attempts = [
        { sku: publicProducts[0]!.sku },
        { category_id: new mongoose.Types.ObjectId().toString() },
      ];
      for (const body of attempts) {
        expect((await updateProductRequest(productId, body, otherVendorToken)).status).toBe(404);
      }
      const after = await Product.findById(productId).lean();
      expect(after?.name).toBe(before?.name);
      expect(after?.sku).toBe(before?.sku);
      expect(after?.category_id).toBe(before?.category_id);
    });

    it("rejects malformed IDs, empty updates, invalid values, and unknown fields", async () => {
      expect((await updateProductRequest("bad-id", { name: "Changed" }, verifiedVendorToken)).status).toBe(400);
      const productId = publicProducts[2]!.id;
      for (const body of [
        {}, { name: "   " }, { price: 0 }, { stock: -1 }, { stock: 1.5 },
        { category_id: "bad-id" }, { status: "active" }, { vendor_id: otherVendor.id }, { extra: "field" },
      ]) {
        expect((await updateProductRequest(productId, body, verifiedVendorToken)).status).toBe(400);
      }
    });

    it("updates only the provided fields and reports missing products", async () => {
      const productId = publicProducts[2]!.id;
      const response = await updateProductRequest(productId, { name: "Updated Draft", price: 2.5 }, verifiedVendorToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: productId,
        name: "Updated Draft",
        price: 2.5,
        description: "Hidden item",
        status: "draft",
      });

      const missing = await updateProductRequest(new mongoose.Types.ObjectId().toString(), { name: "Missing" }, verifiedVendorToken);
      expect(missing.status).toBe(404);
    });

    it("rejects duplicate SKUs and nonexistent categories", async () => {
      const productId = publicProducts[2]!.id;
      const duplicateSku = await updateProductRequest(productId, { sku: publicProducts[0]!.sku }, verifiedVendorToken);
      expect(duplicateSku.status).toBe(409);

      const invalidCategory = await updateProductRequest(
        productId, { category_id: new mongoose.Types.ObjectId().toString() }, verifiedVendorToken
      );
      expect(invalidCategory.status).toBe(400);
    });
  });

  describe("DELETE /products/:uuid", () => {
    it("requires a verified vendor and restricts deletion to the owning vendor", async () => {
      const productId = publicProducts[2]!.id;
      expect((await deleteProductRequest(productId)).status).toBe(401);
      expect((await deleteProductRequest(productId, customerToken)).status).toBe(403);
      expect((await deleteProductRequest(productId, otherVendorToken)).status).toBe(404);
    });

    it("rejects malformed IDs and returns 404 for missing products", async () => {
      expect((await deleteProductRequest("bad-id", verifiedVendorToken)).status).toBe(400);
      expect((await deleteProductRequest(new mongoose.Types.ObjectId().toString(), verifiedVendorToken)).status).toBe(404);
    });

    it("deletes an owned product and returns no content", async () => {
      const product = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Delete Me", description: "Temporary",
        sku: `DELETE-${new mongoose.Types.ObjectId()}`, price: 8, stock: 2, status: "draft",
      });
      const response = await deleteProductRequest(product.id, verifiedVendorToken);
      expect(response.status).toBe(204);
      expect((await Product.findById(product.id))?.status).toBe("archived");

      const repeatedDelete = await deleteProductRequest(product.id, verifiedVendorToken);
      expect(repeatedDelete.status).toBe(404);
      const updateArchived = await updateProductRequest(product.id, { name: "Archived Edit" }, verifiedVendorToken);
      expect(updateArchived.status).toBe(404);
    });
  });

  describe("PATCH /products/:uuid/status", () => {
    it("requires a verified vendor who owns the product", async () => {
      const product = await createOwnedDraftProduct();
      expect((await updateProductStatusRequest(product.id, { status: "active" })).status).toBe(401);
      expect((await updateProductStatusRequest(product.id, { status: "active" }, customerToken)).status).toBe(403);
      expect((await updateProductStatusRequest(product.id, { status: "active" }, otherVendorToken)).status).toBe(404);
      expect((await Product.findById(product.id))?.status).toBe("draft");
    });

    it("rejects invalid IDs and malformed status payloads", async () => {
      const product = await createOwnedDraftProduct();
      expect((await updateProductStatusRequest("bad-id", { status: "active" }, verifiedVendorToken)).status).toBe(400);
      for (const body of [{}, { status: "archived" }, { status: "pending" }, { status: "" }, { status: "active", extra: true }]) {
        expect((await updateProductStatusRequest(product.id, body, verifiedVendorToken)).status).toBe(400);
      }
    });

    it("changes status without changing other product fields and rejects missing or archived products", async () => {
      const product = await createOwnedDraftProduct();
      const response = await updateProductStatusRequest(product.id, { status: "active" }, verifiedVendorToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: product.id,
        status: "active",
        stock: 3,
        name: "Route Test Product",
      });

      const missing = await updateProductStatusRequest(new mongoose.Types.ObjectId().toString(), { status: "active" }, verifiedVendorToken);
      expect(missing.status).toBe(404);
      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Status Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await updateProductStatusRequest(archived.id, { status: "active" }, verifiedVendorToken)).status).toBe(404);
    });
  });

  describe("PATCH /products/:uuid/stock", () => {
    it("requires a verified vendor who owns the product", async () => {
      const product = await createOwnedDraftProduct();
      expect((await updateProductStockRequest(product.id, { stock: 5 })).status).toBe(401);
      expect((await updateProductStockRequest(product.id, { stock: 5 }, customerToken)).status).toBe(403);
      expect((await updateProductStockRequest(product.id, { stock: 5 }, otherVendorToken)).status).toBe(404);
      expect((await Product.findById(product.id))?.stock).toBe(3);
    });

    it("rejects invalid IDs, negative or fractional stock, and unexpected fields", async () => {
      const product = await createOwnedDraftProduct();
      expect((await updateProductStockRequest("bad-id", { stock: 1 }, verifiedVendorToken)).status).toBe(400);
      for (const body of [{}, { stock: -1 }, { stock: 1.5 }, { stock: "5" }, { stock: null }, { stock: 5, status: "active" }]) {
        expect((await updateProductStockRequest(product.id, body, verifiedVendorToken)).status).toBe(400);
      }
    });

    it("allows zero stock, changes only stock, and rejects missing or archived products", async () => {
      const product = await createOwnedDraftProduct();
      const response = await updateProductStockRequest(product.id, { stock: 0 }, verifiedVendorToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: product.id,
        stock: 0,
        status: "draft",
        name: "Route Test Product",
      });

      const missing = await updateProductStockRequest(new mongoose.Types.ObjectId().toString(), { stock: 1 }, verifiedVendorToken);
      expect(missing.status).toBe(404);
      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Stock Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await updateProductStockRequest(archived.id, { stock: 2 }, verifiedVendorToken)).status).toBe(404);
    });
  });

  describe("POST /products/:uuid/image", () => {
    it("requires a verified vendor who owns the product", async () => {
      const product = await createOwnedDraftProduct();
      const body = { object_key: `products/${vendor.id}/photo.jpg` };
      expect((await addProductImageRequest(product.id, body)).status).toBe(401);
      expect((await addProductImageRequest(product.id, body, customerToken)).status).toBe(403);
      expect((await addProductImageRequest(product.id, body, otherVendorToken)).status).toBe(404);
      expect(await ProductImage.countDocuments({ product_id: product.id })).toBe(0);
    });

    it("rejects malformed IDs, invalid object keys, and unknown fields", async () => {
      const product = await createOwnedDraftProduct();
      expect((await addProductImageRequest("bad-id", { object_key: `products/${vendor.id}/x.jpg` }, verifiedVendorToken)).status).toBe(400);
      const invalidBodies = [
        {}, { object_key: "" }, { object_key: "/products/image.jpg" },
        { object_key: `products/${vendor.id}/../other.jpg` },
        { object_key: `products/${vendor.id}/folder//image.jpg` },
        { object_key: `products/${otherVendor.id}/image.jpg` },
        { object_key: `products/${vendor.id}/image.jpg`, extra: true },
        { object_key: `products/${vendor.id}/image.jpg`, alt_text: "   " },
      ];
      for (const body of invalidBodies) {
        expect((await addProductImageRequest(product.id, body, verifiedVendorToken)).status).toBe(400);
      }
    });

    it("adds images with sequential positions and rejects duplicate keys", async () => {
      const product = await createOwnedDraftProduct();
      const firstKey = `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`;
      const firstResponse = await addProductImageRequest(
        product.id, { object_key: firstKey, alt_text: "  Product front  " }, verifiedVendorToken
      );
      expect(firstResponse.status).toBe(201);
      const first = await firstResponse.json();
      expect(first).toMatchObject({
        product_id: product.id,
        object_key: firstKey,
        alt_text: "Product front",
        position: 0,
      });
      expect(first.id).toBeTruthy();

      const duplicate = await addProductImageRequest(product.id, { object_key: firstKey }, verifiedVendorToken);
      expect(duplicate.status).toBe(409);
      const secondResponse = await addProductImageRequest(
        product.id, { object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg` }, verifiedVendorToken
      );
      expect(secondResponse.status).toBe(201);
      expect(await secondResponse.json()).toMatchObject({ position: 1 });
    });

    it("returns 404 for missing and archived products", async () => {
      const imageBody = { object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg` };
      expect((await addProductImageRequest(new mongoose.Types.ObjectId().toString(), imageBody, verifiedVendorToken)).status).toBe(404);
      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Image Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await addProductImageRequest(archived.id, imageBody, verifiedVendorToken)).status).toBe(404);
    });
  });

  describe("DELETE /products/:uuid/image/:imageId", () => {
    it("requires a verified vendor who owns the product", async () => {
      const product = await createOwnedDraftProduct();
      const image = await ProductImage.create({
        product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0,
      });
      expect((await removeProductImageRequest(product.id, image.id)).status).toBe(401);
      expect((await removeProductImageRequest(product.id, image.id, customerToken)).status).toBe(403);
      expect((await removeProductImageRequest(product.id, image.id, otherVendorToken)).status).toBe(404);
      expect(await ProductImage.findById(image.id)).not.toBeNull();
    });

    it("rejects malformed IDs and returns 404 for missing products or images", async () => {
      const product = await createOwnedDraftProduct();
      expect((await removeProductImageRequest("bad-id", new mongoose.Types.ObjectId().toString(), verifiedVendorToken)).status).toBe(400);
      expect((await removeProductImageRequest(product.id, "bad-id", verifiedVendorToken)).status).toBe(400);
      expect((await removeProductImageRequest(new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString(), verifiedVendorToken)).status).toBe(404);
      expect((await removeProductImageRequest(product.id, new mongoose.Types.ObjectId().toString(), verifiedVendorToken)).status).toBe(404);
    });

    it("does not remove an image through another product and deletes only the owned image", async () => {
      const product = await createOwnedDraftProduct();
      const otherProduct = await createOwnedDraftProduct();
      const image = await ProductImage.create({
        product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0,
      });
      expect((await removeProductImageRequest(otherProduct.id, image.id, verifiedVendorToken)).status).toBe(404);
      expect(await ProductImage.findById(image.id)).not.toBeNull();

      const removed = await removeProductImageRequest(product.id, image.id, verifiedVendorToken);
      expect(removed.status).toBe(204);
      expect(await ProductImage.findById(image.id)).toBeNull();
      expect((await removeProductImageRequest(product.id, image.id, verifiedVendorToken)).status).toBe(404);
    });

    it("does not remove images from archived products", async () => {
      const product = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Image Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      const image = await ProductImage.create({
        product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0,
      });
      expect((await removeProductImageRequest(product.id, image.id, verifiedVendorToken)).status).toBe(404);
      expect(await ProductImage.findById(image.id)).not.toBeNull();
    });
  });

  describe("PUT /products/:uuid/images/reorder", () => {
    it("requires a verified vendor who owns the product", async () => {
      const product = await createOwnedDraftProduct();
      const image = await ProductImage.create({
        product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0,
      });
      const body = { image_ids: [image.id] };
      expect((await reorderProductImagesRequest(product.id, body)).status).toBe(401);
      expect((await reorderProductImagesRequest(product.id, body, customerToken)).status).toBe(403);
      expect((await reorderProductImagesRequest(product.id, body, otherVendorToken)).status).toBe(404);
      expect((await ProductImage.findById(image.id))?.position).toBe(0);
    });

    it("rejects malformed IDs and invalid, duplicate, or incomplete image orders", async () => {
      const product = await createOwnedDraftProduct();
      const images = await ProductImage.create([
        { product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0 },
        { product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 1 },
      ]);
      expect((await reorderProductImagesRequest("bad-id", { image_ids: [] }, verifiedVendorToken)).status).toBe(400);

      const invalidBodies = [
        {}, { image_ids: "not-an-array" }, { image_ids: [images[0]!.id, images[0]!.id] },
        { image_ids: ["bad-id"] }, { image_ids: [images[0]!.id] },
        { image_ids: [images[0]!.id, new mongoose.Types.ObjectId().toString()] },
        { image_ids: [images[0]!.id, images[1]!.id], extra: true },
        { image_ids: Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString()) },
      ];
      for (const body of invalidBodies) {
        expect((await reorderProductImagesRequest(product.id, body, verifiedVendorToken)).status).toBe(400);
      }
      expect((await ProductImage.find({ product_id: product.id }).sort({ position: 1 })).map((image) => image.position)).toEqual([0, 1]);
    });

    it("reorders the complete image set and compacts positions", async () => {
      const product = await createOwnedDraftProduct();
      const images = await ProductImage.create([
        { product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 0 },
        { product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 1 },
        { product_id: product.id, object_key: `products/${vendor.id}/${new mongoose.Types.ObjectId()}.jpg`, position: 2 },
      ]);
      const desiredOrder = [images[2]!.id, images[0]!.id, images[1]!.id];
      const response = await reorderProductImagesRequest(product.id, { image_ids: desiredOrder }, verifiedVendorToken);
      expect(response.status).toBe(200);
      const body = await response.json() as { images: Array<{ id: string; position: number }> };
      expect(body.images.map((image) => image.id)).toEqual(desiredOrder);
      expect(body.images.map((image) => image.position)).toEqual([0, 1, 2]);
      expect((await ProductImage.find({ product_id: product.id }).sort({ position: 1 })).map((image) => image.id)).toEqual(desiredOrder);
    });

    it("accepts an empty order only for products with no images and rejects missing or archived products", async () => {
      const emptyProduct = await createOwnedDraftProduct();
      const emptyResponse = await reorderProductImagesRequest(emptyProduct.id, { image_ids: [] }, verifiedVendorToken);
      expect(emptyResponse.status).toBe(200);
      expect(await emptyResponse.json()).toEqual({ images: [] });

      const missing = await reorderProductImagesRequest(new mongoose.Types.ObjectId().toString(), { image_ids: [] }, verifiedVendorToken);
      expect(missing.status).toBe(404);
      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Reorder Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await reorderProductImagesRequest(archived.id, { image_ids: [] }, verifiedVendorToken)).status).toBe(404);
    });
  });

  describe("GET /products/:uuid/reviews", () => {
    it("returns public reviews newest first without exposing reviewer or order IDs", async () => {
      const response = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/reviews`);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        reviews: Array<{ id: string; rating: number; title?: string; comment: string; created_at: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(body.pagination).toMatchObject({ page: 1, limit: 20, total: 3, pages: 1 });
      expect(body.reviews.map((review) => review.title ?? review.comment)).toEqual([
        "Newest review", "A middle review", "Older review",
      ]);
      expect(body.reviews[0]).not.toHaveProperty("user_id");
      expect(body.reviews[0]).not.toHaveProperty("order_item_id");
    });

    it("paginates reviews and validates query parameters", async () => {
      const firstPageResponse = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/reviews?page=1&limit=1`);
      expect(firstPageResponse.status).toBe(200);
      const firstPage = await firstPageResponse.json() as {
        reviews: Array<{ title?: string; comment: string }>;
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(firstPage.reviews).toHaveLength(1);
      expect(firstPage.reviews[0]!.title).toBe("Newest review");
      expect(firstPage.pagination).toMatchObject({ page: 1, limit: 1, total: 3, pages: 3 });

      const beyondLastPage = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/reviews?page=9&limit=1`);
      expect(await beyondLastPage.json()).toMatchObject({
        reviews: [], pagination: { page: 9, limit: 1, total: 3, pages: 3 },
      });

      for (const query of ["?page=0", "?page=1.5", "?page=nope", "?limit=0", "?limit=101", "?limit=nope", "?other=value"]) {
        const response = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/reviews${query}`);
        expect(response.status).toBe(400);
      }
    });

    it("rejects invalid IDs and hides missing, draft, and archived products", async () => {
      expect((await fetch(`${BASE_URL}/products/invalid-id/reviews`)).status).toBe(400);
      expect((await fetch(`${BASE_URL}/products/${new mongoose.Types.ObjectId()}/reviews`)).status).toBe(404);
      expect((await fetch(`${BASE_URL}/products/${publicProducts[2]!.id}/reviews`)).status).toBe(404);

      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Review Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await fetch(`${BASE_URL}/products/${archived.id}/reviews`)).status).toBe(404);
    });

    it("returns an empty paginated result for an active product with no reviews", async () => {
      const product = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "No Review Product", description: "No reviews",
        sku: `NO-REVIEWS-${new mongoose.Types.ObjectId()}`, price: 4, stock: 1, status: "active",
      });
      const response = await fetch(`${BASE_URL}/products/${product.id}/reviews`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reviews: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
    });
  });

  describe("GET /products/:uuid/related", () => {
    it("returns active products in the same category and excludes the requested product", async () => {
      const response = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/related`);
      expect(response.status).toBe(200);
      const body = await response.json() as { products: ProductListItem[] };
      const ids = body.products.map((product) => product.id);
      expect(ids).toContain(publicProducts[1]!.id);
      expect(ids).toContain(otherVendorProduct.id);
      expect(ids).not.toContain(publicProducts[0]!.id);
      expect(ids).not.toContain(publicProducts[2]!.id);
      expect(body.products.every((product) => product.status === "active")).toBe(true);
    });

    it("applies the requested limit and rejects invalid query parameters", async () => {
      const limited = await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/related?limit=1`);
      expect(limited.status).toBe(200);
      expect((await limited.json()).products).toHaveLength(1);

      for (const query of ["?limit=0", "?limit=51", "?limit=1.5", "?limit=nope", "?other=value"]) {
        expect((await fetch(`${BASE_URL}/products/${publicProducts[0]!.id}/related${query}`)).status).toBe(400);
      }
    });

    it("rejects malformed IDs and returns 404 for missing, draft, or archived products", async () => {
      expect((await fetch(`${BASE_URL}/products/bad-id/related`)).status).toBe(400);
      expect((await fetch(`${BASE_URL}/products/${new mongoose.Types.ObjectId()}/related`)).status).toBe(404);
      expect((await fetch(`${BASE_URL}/products/${publicProducts[2]!.id}/related`)).status).toBe(404);

      const archived = await Product.create({
        vendor_id: vendor.id, category_id: category.id, name: "Archived Related Product", description: "Archived",
        sku: `ARCHIVED-${new mongoose.Types.ObjectId()}`, price: 4, stock: 0, status: "archived",
      });
      expect((await fetch(`${BASE_URL}/products/${archived.id}/related`)).status).toBe(404);
    });

    it("returns an empty list when an active product has no active category siblings", async () => {
      const product = await Product.create({
        vendor_id: vendor.id,
        category_id: new mongoose.Types.ObjectId().toString(),
        name: "Only Product in Category",
        description: "No related products",
        sku: `RELATED-${new mongoose.Types.ObjectId()}`,
        price: 10,
        stock: 1,
        status: "active",
      });
      const response = await fetch(`${BASE_URL}/products/${product.id}/related`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ products: [] });
    });
  });

  describe("GET /vendors/me/products", () => {
    it("requires a vendor account", async () => {
      expect((await getOwnVendorProductsRequest()).status).toBe(401);
      expect((await getOwnVendorProductsRequest("", customerToken)).status).toBe(403);

      const noProfileToken = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "missing-vendor@test.com", role: "vendor" },
        JWT_SECRET
      );
      expect((await getOwnVendorProductsRequest("", noProfileToken)).status).toBe(403);

      expect((await getOwnVendorProductsRequest("", "not-a-jwt")).status).toBe(401);
      const expiredToken = jwt.sign(
        { id: vendorUser.id, email: vendorUser.email, role: "vendor" }, JWT_SECRET, { expiresIn: -1 }
      );
      expect((await getOwnVendorProductsRequest("", expiredToken)).status).toBe(401);
    });

    it("rejects suspended vendor accounts and permits vendors whose KYC is pending", async () => {
      vendorUser.status = "suspended";
      await vendorUser.save();
      expect((await getOwnVendorProductsRequest("", verifiedVendorToken)).status).toBe(403);
      vendorUser.status = "active";
      await vendorUser.save();

      otherVendor.kyc_status = "pending";
      await otherVendor.save();
      const pendingKycResponse = await getOwnVendorProductsRequest("", otherVendorToken);
      expect(pendingKycResponse.status).toBe(200);
      const pendingKycBody = await pendingKycResponse.json() as { products: ProductListItem[] };
      expect(pendingKycBody.products.map((product) => product.id)).toContain(otherVendorProduct.id);
      otherVendor.kyc_status = "verified";
      await otherVendor.save();
    });

    it("returns only the authenticated vendor's products across statuses", async () => {
      const response = await getOwnVendorProductsRequest("?limit=100", verifiedVendorToken);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        products: ProductListItem[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      const productIds = body.products.map((product) => product.id);
      expect(body.pagination).toMatchObject({ page: 1, limit: 100 });
      expect(body.pagination.total).toBe(body.products.length);
      expect(body.pagination.pages).toBe(1);
      expect(productIds).toContain(publicProducts[0]!.id);
      expect(productIds).toContain(publicProducts[2]!.id);
      expect(productIds).not.toContain(otherVendorProduct.id);
      expect(body.products.find((product) => product.id === publicProducts[2]!.id)?.status).toBe("draft");
    });

    it("paginates and rejects malformed or unsupported query parameters", async () => {
      const firstPage = await getOwnVendorProductsRequest("?page=1&limit=1", verifiedVendorToken);
      expect(firstPage.status).toBe(200);
      const body = await firstPage.json() as {
        products: ProductListItem[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      expect(body.products).toHaveLength(1);
      expect(body.pagination).toMatchObject({ page: 1, limit: 1 });
      expect(body.pagination.total).toBeGreaterThan(body.products.length);
      expect(body.pagination.pages).toBe(body.pagination.total);

      const beyondLastPage = await getOwnVendorProductsRequest("?page=999&limit=1", verifiedVendorToken);
      expect(beyondLastPage.status).toBe(200);
      expect(await beyondLastPage.json()).toMatchObject({
        products: [],
        pagination: { page: 999, limit: 1, total: body.pagination.total, pages: body.pagination.total },
      });

      for (const query of ["?page=0", "?page=1.5", "?page=abc", "?limit=0", "?limit=101", "?limit=nope", "?extra=1"]) {
        expect((await getOwnVendorProductsRequest(query, verifiedVendorToken)).status).toBe(400);
      }
    });
  });
});
