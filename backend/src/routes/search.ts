import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ProductImage } from "../models";
import { elasticsearchRequest } from "../utils/elasticsearch";

const searchRouter = Router();
const querySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  sortBy: z.enum(["relevance", "price", "created_at"]).default("relevance"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const suggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();
const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

async function attachProductImages<T extends { id: string }>(products: T[]): Promise<Array<T & { images?: Array<{ id: string; object_key: string; alt_text?: string; position: number }> }>> {
  if (!products.length || mongoose.connection.readyState !== 1) return products;
  const images = await ProductImage.find({ product_id: { $in: products.map((product) => product.id) } })
    .sort({ position: 1, _id: 1 })
    .lean();
  const imagesByProduct = new Map<string, Array<{ id: string; object_key: string; alt_text?: string; position: number }>>();
  for (const image of images) {
    const productImages = imagesByProduct.get(image.product_id) ?? [];
    productImages.push({
      id: image._id.toString(),
      object_key: image.object_key,
      ...(image.alt_text ? { alt_text: image.alt_text } : {}),
      position: image.position,
    });
    imagesByProduct.set(image.product_id, productImages);
  }
  return products.map((product) => {
    const productImages = imagesByProduct.get(product.id);
    return productImages?.length ? { ...product, images: productImages } : product;
  });
}

searchRouter.get("/search/products", async (req, res) => {
  const validation = querySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid search parameters" });

  const { q, category, minPrice, maxPrice, sortBy, order, page, limit } = validation.data;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return res.status(400).json({ message: "minPrice must not exceed maxPrice" });
  }

  const filters: Array<Record<string, unknown>> = [{ term: { status: "active" } }];
  if (category) filters.push({ term: { category_id: category } });
  if (minPrice !== undefined || maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (minPrice !== undefined) range.gte = minPrice;
    if (maxPrice !== undefined) range.lte = maxPrice;
    filters.push({ range: { price: range } });
  }
  const from = (page - 1) * limit;
  const sort = sortBy === "relevance" ? [{ _score: { order: "desc" } }] : [{ [sortBy]: { order } }];
  const body = {
    from,
    size: limit,
    query: { bool: {
      filter: filters,
      ...(q ? { must: [{ multi_match: { query: q, fields: ["name^3", "description", "sku"], type: "bool_prefix", operator: "and" } }] } : {}),
    } },
    sort,
  };

  try {
    const result = await elasticsearchRequest("POST", "products/_search", body);
    const hits = result.hits?.hits;
    if (!Array.isArray(hits) || !result.hits) throw new Error("Malformed Elasticsearch response");
    const total = typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value;
    if (typeof total !== "number" || !Number.isFinite(total)) throw new Error("Malformed Elasticsearch total");
    const products = hits.map((hit) => ({ ...hit._source, id: String(hit._source?.id || hit._id) }));
    return res.json({ products: await attachProductImages(products), total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Product search error:", error);
    return res.status(502).json({ message: "Product search is temporarily unavailable" });
  }
});

searchRouter.get("/search/suggestions", async (req, res) => {
  const validation = suggestionsQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid suggestion parameters" });

  const { q, limit } = validation.data;
  try {
    const result = await elasticsearchRequest("POST", "products/_search", {
      size: Math.min(limit * 3, 60),
      _source: ["name"],
      query: { bool: {
        filter: [{ term: { status: "active" } }],
        must: [{ match_phrase_prefix: { name: { query: q, max_expansions: 25 } } }],
      } },
      sort: [{ _score: { order: "desc" } }],
    });
    const hits = result.hits?.hits;
    if (!Array.isArray(hits) || !result.hits) throw new Error("Malformed Elasticsearch response");

    const suggestions = [...new Set(hits
      .map((hit) => hit._source?.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim()))].slice(0, limit);
    return res.json({ suggestions });
  } catch (error) {
    console.error("Search suggestions error:", error);
    return res.status(502).json({ message: "Search suggestions are temporarily unavailable" });
  }
});

searchRouter.get("/search/trending", async (req, res) => {
  const validation = trendingQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid trending parameters" });

  const { limit } = validation.data;
  try {
    const result = await elasticsearchRequest("POST", "products/_search", {
      size: limit,
      query: { term: { status: "active" } },
      sort: [
        { review_count: { order: "desc" } },
        { average_rating: { order: "desc" } },
        { created_at: { order: "desc" } },
      ],
    });
    const hits = result.hits?.hits;
    if (!Array.isArray(hits) || !result.hits) throw new Error("Malformed Elasticsearch response");
    const products = hits.map((hit) => ({ ...hit._source, id: String(hit._source?.id || hit._id) }));
    return res.json({ products: await attachProductImages(products) });
  } catch (error) {
    console.error("Trending products error:", error);
    return res.status(502).json({ message: "Trending products are temporarily unavailable" });
  }
});

export default searchRouter;
