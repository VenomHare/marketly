import { Router } from "express";
import type { SortOrder } from "mongoose";
import { Category, Product } from "../models";
import { categoryProductsQuerySchema } from "../validators/products";

const categoriesRouter = Router();

categoriesRouter.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1, _id: 1 }).lean();
    return res.json({
      categories: categories.map((category) => ({
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        ...(category.parent_id ? { parent_id: category.parent_id } : {}),
      })),
    });
  } catch (error) {
    console.error("List categories error:", error);
    return res.status(500).json({ message: "Failed to fetch categories" });
  }
});

categoriesRouter.get("/categories/:uuid", async (req, res) => {
  const categoryId = req.params.uuid;
  if (typeof categoryId !== "string" || !/^[a-f\d]{24}$/i.test(categoryId)) {
    return res.status(400).json({ message: "Invalid category id" });
  }

  try {
    const category = await Category.findById(categoryId).lean();
    if (!category) return res.status(404).json({ message: "Category not found" });
    return res.json({
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
      ...(category.parent_id ? { parent_id: category.parent_id } : {}),
    });
  } catch (error) {
    console.error("Get category error:", error);
    return res.status(500).json({ message: "Failed to fetch category" });
  }
});

categoriesRouter.get("/categories/:uuid/products", async (req, res) => {
  const categoryId = req.params.uuid;
  if (typeof categoryId !== "string" || !/^[a-f\d]{24}$/i.test(categoryId)) {
    return res.status(400).json({ message: "Invalid category id" });
  }
  const validation = categoryProductsQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const category = await Category.findById(categoryId).select("_id");
    if (!category) return res.status(404).json({ message: "Category not found" });

    const { page, limit } = validation.data;
    const filter = { category_id: categoryId, status: "active" as const };
    const sort: Record<string, SortOrder> = { created_at: -1, _id: -1 };
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return res.json({
      products: products.map((product) => ({
        id: product._id.toString(),
        vendor_id: product.vendor_id,
        category_id: product.category_id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        price: product.price,
        stock: product.stock,
        average_rating: product.average_rating,
        review_count: product.review_count,
        status: product.status,
        created_at: product.created_at,
        updated_at: product.updated_at,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("List category products error:", error);
    return res.status(500).json({ message: "Failed to fetch category products" });
  }
});

export default categoriesRouter;
