import { Router } from "express";
import { Product, Review } from "../models";
import { productReviewsQuerySchema } from "../validators/products";

const reviewsRouter = Router();

reviewsRouter.post("/products/:uuid/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.get("/products/:uuid/reviews", async (req, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  const queryValidation = productReviewsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const product = await Product.findOne({ _id: productId, status: "active" }).select("_id");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { page, limit } = queryValidation.data;
    const filter = { product_id: productId };
    const [reviews, total] = await Promise.all([
      Review.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Review.countDocuments(filter),
    ]);

    return res.json({
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        created_at: review.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get product reviews error:", error);
    return res.status(500).json({ message: "Failed to fetch product reviews" });
  }
});

reviewsRouter.get("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.patch("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.delete("/reviews/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

reviewsRouter.get("/users/me/reviews", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default reviewsRouter;
