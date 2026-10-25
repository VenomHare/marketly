import { Router } from "express";
import type { SortOrder } from "mongoose";
import { Category, Product, ProductImage } from "../models";
import { AuthRequest, authenticate, requireVerifiedVendor } from "../middleware/auth";
import {
  productsListQuerySchema,
  productCreateSchema,
  productImageCreateSchema,
  productImageReorderSchema,
  relatedProductsQuerySchema,
  productStatusUpdateSchema,
  productStockUpdateSchema,
  productUpdateSchema,
} from "../validators/products";

const productsRouter = Router();

productsRouter.post("/products", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const validation = productCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const { category_id, name, description, sku, price, stock } = validation.data;
    const category = await Category.findById(category_id);
    if (!category) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const existingSku = await Product.findOne({ sku });
    if (existingSku) {
      return res.status(409).json({ message: "SKU already exists" });
    }

    const product = await Product.create({
      vendor_id: req.vendor!.id,
      category_id,
      name,
      description,
      sku,
      price,
      stock,
      status: "draft",
    });

    return res.status(201).json({
      id: product.id,
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
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "SKU already exists" });
    }
    console.error("Create product error:", error);
    return res.status(500).json({ message: "Failed to create product" });
  }
});

productsRouter.get("/products", async (req, res) => {
  const validation = productsListQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const { page, limit, category_id, search, sort } = validation.data;
    if (category_id && !/^[a-f\d]{24}$/i.test(category_id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const filter: Record<string, unknown> = { status: "active" };
    if (category_id) filter.category_id = category_id;
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    const sortOrder: Record<string, SortOrder> = sort === "price_asc"
      ? { price: 1, _id: 1 }
      : sort === "price_desc"
        ? { price: -1, _id: 1 }
        : { created_at: -1, _id: -1 };
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortOrder)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
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
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List products error:", error);
    return res.status(500).json({ message: "Failed to fetch products" });
  }
});

productsRouter.get("/products/:uuid", async (req, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  try {
    const product = await Product.findOne({ _id: productId, status: "active" }).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({
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
    });
  } catch (error) {
    console.error("Get product error:", error);
    return res.status(500).json({ message: "Failed to fetch product" });
  }
});

productsRouter.patch("/products/:uuid", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const validation = productUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const updates = validation.data;
    const ownedProduct = await Product.findOne({
      _id: productId,
      vendor_id: req.vendor!.id,
      status: { $ne: "archived" },
    });
    if (!ownedProduct) return res.status(404).json({ message: "Product not found" });

    if (updates.category_id) {
      const category = await Category.findById(updates.category_id);
      if (!category) return res.status(400).json({ message: "Invalid category" });
    }
    if (updates.sku) {
      const existingSku = await Product.findOne({ sku: updates.sku, _id: { $ne: productId } });
      if (existingSku) return res.status(409).json({ message: "SKU already exists" });
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, vendor_id: req.vendor!.id, status: { $ne: "archived" } },
      { ...updates, updated_at: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({
      id: product.id,
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
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "SKU already exists" });
    }
    console.error("Update product error:", error);
    return res.status(500).json({ message: "Failed to update product" });
  }
});

productsRouter.delete("/products/:uuid", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { _id: productId, vendor_id: req.vendor!.id, status: { $ne: "archived" } },
      { status: "archived", updated_at: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.status(204).send();
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({ message: "Failed to delete product" });
  }
});

productsRouter.patch("/products/:uuid/status", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const validation = productStatusUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { _id: productId, vendor_id: req.vendor!.id, status: { $ne: "archived" } },
      { status: validation.data.status, updated_at: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({
      id: product.id,
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
    });
  } catch (error) {
    console.error("Update product status error:", error);
    return res.status(500).json({ message: "Failed to update product status" });
  }
});

productsRouter.patch("/products/:uuid/stock", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const validation = productStockUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { _id: productId, vendor_id: req.vendor!.id, status: { $ne: "archived" } },
      { stock: validation.data.stock, updated_at: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found" });

    return res.json({
      id: product.id,
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
    });
  } catch (error) {
    console.error("Update product stock error:", error);
    return res.status(500).json({ message: "Failed to update product stock" });
  }
});

productsRouter.post("/products/:uuid/image", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const validation = productImageCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      vendor_id: req.vendor!.id,
      status: { $ne: "archived" },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const ownedObjectPrefix = `products/${req.vendor!.id}/`;
    if (!validation.data.object_key.startsWith(ownedObjectPrefix)) {
      return res.status(400).json({ message: "Invalid image key" });
    }

    const existingImage = await ProductImage.findOne({
      product_id: productId,
      object_key: validation.data.object_key,
    });
    if (existingImage) return res.status(409).json({ message: "Image already exists" });

    const lastImage = await ProductImage.findOne({ product_id: productId }).sort({ position: -1 });
    const image = await ProductImage.create({
      product_id: productId,
      ...validation.data,
      position: (lastImage?.position ?? -1) + 1,
    });

    return res.status(201).json({
      id: image.id,
      product_id: image.product_id,
      object_key: image.object_key,
      alt_text: image.alt_text,
      position: image.position,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "Image already exists" });
    }
    console.error("Add product image error:", error);
    return res.status(500).json({ message: "Failed to add product image" });
  }
});

productsRouter.delete("/products/:uuid/image/:imageId", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  const imageId = req.params.imageId;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  if (typeof imageId !== "string" || !/^[a-f\d]{24}$/i.test(imageId)) {
    return res.status(400).json({ message: "Invalid image id" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      vendor_id: req.vendor!.id,
      status: { $ne: "archived" },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const image = await ProductImage.findOneAndDelete({ _id: imageId, product_id: productId });
    if (!image) return res.status(404).json({ message: "Product image not found" });
    return res.status(204).send();
  } catch (error) {
    console.error("Delete product image error:", error);
    return res.status(500).json({ message: "Failed to delete product image" });
  }
});

productsRouter.put("/products/:uuid/images/reorder", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const validation = productImageReorderSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      vendor_id: req.vendor!.id,
      status: { $ne: "archived" },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const existingImages = await ProductImage.find({ product_id: productId }).sort({ position: 1, _id: 1 });
    const existingImageIds = new Set(existingImages.map((image) => image.id));
    if (
      validation.data.image_ids.length !== existingImages.length ||
      validation.data.image_ids.some((imageId) => !existingImageIds.has(imageId))
    ) {
      return res.status(400).json({ message: "Image order must include every product image exactly once" });
    }

    if (validation.data.image_ids.length > 0) {
      const result = await ProductImage.bulkWrite(validation.data.image_ids.map((imageId, position) => ({
        updateOne: {
          filter: { _id: imageId, product_id: productId },
          update: { $set: { position } },
        },
      })));
      if (result.matchedCount !== validation.data.image_ids.length) {
        return res.status(409).json({ message: "Product images changed; retry the reorder" });
      }
    }

    const images = await ProductImage.find({ product_id: productId }).sort({ position: 1, _id: 1 });
    return res.json({
      images: images.map((image) => ({
        id: image.id,
        product_id: image.product_id,
        object_key: image.object_key,
        alt_text: image.alt_text,
        position: image.position,
      })),
    });
  } catch (error) {
    console.error("Reorder product images error:", error);
    return res.status(500).json({ message: "Failed to reorder product images" });
  }
});

productsRouter.get("/products/:uuid/related", async (req, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const queryValidation = relatedProductsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOne({ _id: productId, status: "active" }).select("category_id");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const relatedProducts = await Product.find({
      _id: { $ne: productId },
      category_id: product.category_id,
      status: "active",
    })
      .sort({ average_rating: -1, review_count: -1, created_at: -1, _id: -1 })
      .limit(queryValidation.data.limit)
      .lean();

    return res.json({
      products: relatedProducts.map((related) => ({
        id: related._id.toString(),
        vendor_id: related.vendor_id,
        category_id: related.category_id,
        name: related.name,
        description: related.description,
        price: related.price,
        stock: related.stock,
        average_rating: related.average_rating,
        review_count: related.review_count,
        status: related.status,
        created_at: related.created_at,
      })),
    });
  } catch (error) {
    console.error("Get related products error:", error);
    return res.status(500).json({ message: "Failed to fetch related products" });
  }
});

export default productsRouter;
