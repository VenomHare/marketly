import { z } from "zod";

export const productCreateSchema = z.object({
  category_id: z.string().trim().regex(/^[a-f\d]{24}$/i),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  sku: z.string().trim().min(1).max(100),
  price: z.number().finite().positive(),
  stock: z.number().int().min(0),
}).strict();

export const productsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category_id: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
}).strict();

export const productUpdateSchema = productCreateSchema.partial().strict().refine(
  (product) => Object.keys(product).length > 0,
  { message: "At least one product field must be provided" }
);

export const productStatusUpdateSchema = z.object({
  status: z.enum(["draft", "active"]),
}).strict();

export const productStockUpdateSchema = z.object({
  stock: z.number().int().min(0),
}).strict();

export const productImageCreateSchema = z.object({
  object_key: z.string().trim().min(1).max(1024).refine(
    (key) => !key.startsWith("/") && !key.includes("\\") &&
      key.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  ),
  alt_text: z.string().trim().min(1).max(500).optional(),
}).strict();

export const productImageReorderSchema = z.object({
  image_ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100)
    .refine((imageIds) => new Set(imageIds).size === imageIds.length),
}).strict();

export const productReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const categoryProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const productReviewCreateSchema = z.object({
  order_item_id: z.string().trim().regex(/^[a-f\d]{24}$/i),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(200).optional(),
  comment: z.string().trim().min(1).max(5000),
}).strict();

export const reviewUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  comment: z.string().trim().min(1).max(5000).optional(),
}).strict().refine((review) => Object.keys(review).length > 0, {
  message: "At least one review field must be provided",
});

export const relatedProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();
