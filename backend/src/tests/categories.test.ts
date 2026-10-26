import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import mongoose from "mongoose";
import Category, { ICategory } from "../models/Category.js";
import Product, { IProduct } from "../models/Product.js";

config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const TEST_SLUG = "categories-route-test";

describe("GET /categories", () => {
  let rootCategory: ICategory;
  let childCategory: ICategory;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    await Category.deleteMany({ slug: { $in: [TEST_SLUG, `${TEST_SLUG}-child`] } });
    rootCategory = await Category.create({ name: "A Categories Route Test", slug: TEST_SLUG });
    childCategory = await Category.create({
      name: "B Categories Route Test",
      slug: `${TEST_SLUG}-child`,
      parent_id: rootCategory.id,
    });
  });

  afterAll(async () => {
    await Category.deleteMany({ slug: { $in: [TEST_SLUG, `${TEST_SLUG}-child`] } });
    await mongoose.connection.close();
  });

  it("returns categories sorted by name with their parent relationship", async () => {
    const response = await fetch(`${BASE_URL}/categories`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      categories: Array<{ id: string; name: string; slug: string; parent_id?: string }>;
    };
    expect(Array.isArray(body.categories)).toBe(true);

    const root = body.categories.find((category) => category.slug === TEST_SLUG);
    const child = body.categories.find((category) => category.slug === `${TEST_SLUG}-child`);
    expect(root).toMatchObject({ id: rootCategory.id, name: rootCategory.name, slug: TEST_SLUG });
    expect(root).not.toHaveProperty("parent_id");
    expect(child).toMatchObject({
      id: childCategory.id,
      name: childCategory.name,
      slug: `${TEST_SLUG}-child`,
      parent_id: rootCategory.id,
    });
    expect(body.categories.indexOf(root!)).toBeLessThan(body.categories.indexOf(child!));
    expect(root).not.toHaveProperty("_id");
  });
});

describe("GET /categories/:uuid", () => {
  let category: ICategory;
  let activeProducts: IProduct[];
  let draftProduct: IProduct;
  let archivedProduct: IProduct;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/marketly");
    const oldCategory = await Category.findOne({ slug: TEST_SLUG });
    if (oldCategory) await Product.deleteMany({ category_id: oldCategory.id });
    await Category.deleteMany({ slug: { $in: [TEST_SLUG, `${TEST_SLUG}-empty`] } });
    category = await Category.create({ name: "Category Detail Route Test", slug: TEST_SLUG });
    activeProducts = await Product.create([
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: category.id,
        name: "Older Active Category Product", description: "Older active item", sku: `CATEGORY-ROUTE-${new mongoose.Types.ObjectId()}`,
        price: 10, stock: 2, status: "active", created_at: new Date("2024-01-01T00:00:00Z"),
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: category.id,
        name: "Newer Active Category Product", description: "Newer active item", sku: `CATEGORY-ROUTE-${new mongoose.Types.ObjectId()}`,
        price: 20, stock: 3, status: "active", created_at: new Date("2025-01-01T00:00:00Z"),
      },
    ]);
    const inactiveProducts = await Product.create([
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: category.id,
        name: "Draft Category Product", description: "Must not be public", sku: `CATEGORY-ROUTE-${new mongoose.Types.ObjectId()}`,
        price: 5, stock: 1, status: "draft",
      },
      {
        vendor_id: new mongoose.Types.ObjectId().toString(), category_id: category.id,
        name: "Archived Category Product", description: "Must not be public", sku: `CATEGORY-ROUTE-${new mongoose.Types.ObjectId()}`,
        price: 5, stock: 0, status: "archived",
      },
    ]);
    draftProduct = inactiveProducts[0]!;
    archivedProduct = inactiveProducts[1]!;
  });

  afterAll(async () => {
    if (category) await Product.deleteMany({ category_id: category.id });
    await Category.deleteMany({ slug: { $in: [TEST_SLUG, `${TEST_SLUG}-empty`] } });
    await mongoose.connection.close();
  });

  it("returns a category by ID and handles invalid or missing IDs", async () => {
    const response = await fetch(`${BASE_URL}/categories/${category.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: category.id,
      name: category.name,
      slug: category.slug,
    });
    expect((await fetch(`${BASE_URL}/categories/not-an-id`)).status).toBe(400);
    expect((await fetch(`${BASE_URL}/categories/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it("returns only active products in a category, newest first, with pagination", async () => {
    const response = await fetch(`${BASE_URL}/categories/${category.id}/products`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      products: Array<{ id: string; category_id: string; name: string; status: string }>;
      pagination: { page: number; limit: number; total: number; total_pages: number };
    };
    expect(body.products.map((item) => item.id)).toEqual([activeProducts[1]!.id, activeProducts[0]!.id]);
    expect(body.products.every((item) => item.status === "active" && item.category_id === category.id)).toBe(true);
    expect(body.products.map((item) => item.name)).not.toContain(draftProduct.name);
    expect(body.products.map((item) => item.name)).not.toContain(archivedProduct.name);
    expect(body.pagination).toMatchObject({ page: 1, limit: 20, total: 2, total_pages: 1 });

    const firstPage = await fetch(`${BASE_URL}/categories/${category.id}/products?page=1&limit=1`);
    expect(firstPage.status).toBe(200);
    const firstPageBody = await firstPage.json() as { products: Array<{ id: string }> };
    expect(firstPageBody.products.map((item) => item.id)).toEqual([activeProducts[1]!.id]);
    expect(await (await fetch(`${BASE_URL}/categories/${category.id}/products?page=2&limit=1`)).json()).toMatchObject({
      products: [{ id: activeProducts[0]!.id }], pagination: { page: 2, limit: 1, total: 2, total_pages: 2 },
    });
    expect(await (await fetch(`${BASE_URL}/categories/${category.id}/products?page=3&limit=1`)).json()).toMatchObject({
      products: [], pagination: { page: 3, limit: 1, total: 2, total_pages: 2 },
    });
  });

  it("rejects invalid category IDs and pagination parameters", async () => {
    expect((await fetch(`${BASE_URL}/categories/not-an-id/products`)).status).toBe(400);
    expect((await fetch(`${BASE_URL}/categories/${new mongoose.Types.ObjectId()}/products`)).status).toBe(404);
    for (const query of ["?page=0", "?page=1.5", "?page=nope", "?limit=0", "?limit=101", "?limit=nope", "?other=value"]) {
      expect((await fetch(`${BASE_URL}/categories/${category.id}/products${query}`)).status).toBe(400);
    }
    const maxLimit = await fetch(`${BASE_URL}/categories/${category.id}/products?limit=100`);
    expect(maxLimit.status).toBe(200);
    const maxLimitBody = await maxLimit.json() as { products: unknown[] };
    expect(maxLimitBody.products).toHaveLength(2);
  });

  it("returns an empty paginated list for a category with no active products", async () => {
    const emptyCategory = await Category.create({ name: "Empty Category Route Test", slug: `${TEST_SLUG}-empty` });
    const response = await fetch(`${BASE_URL}/categories/${emptyCategory.id}/products`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });
  });
});
