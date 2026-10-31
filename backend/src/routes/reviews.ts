import { Router } from "express";
import { Order, OrderItem, Product, Review, VendorOrder } from "../models";
import { AuthRequest, authenticate } from "../middleware/auth";
import { productReviewCreateSchema, productReviewsQuerySchema, reviewUpdateSchema } from "../validators/products";
import { syncProductIndex } from "../utils/elasticsearch";

const reviewsRouter = Router();

const updateProductReviewSummary = async (productId: string) => {
  const [summary] = await Review.aggregate([
    { $match: { product_id: productId } },
    { $group: { _id: null, average_rating: { $avg: "$rating" }, review_count: { $sum: 1 } } },
  ]);
  await Product.updateOne({ _id: productId }, {
    average_rating: summary?.average_rating ?? 0,
    review_count: summary?.review_count ?? 0,
  });
  const product = await Product.findById(productId);
  if (product) await syncProductIndex(product);
};

const isReviewableDeliveredOrder = async (orderId: string, vendorId: string, userId: string) => {
  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
    payment_status: "paid",
    status: { $in: ["placed", "completed"] },
  }).select("_id status").lean();
  if (!order) return false;
  if (order.status === "completed") return true;
  return Boolean(await VendorOrder.exists({ order_id: order._id.toString(), vendor_id: vendorId, status: "delivered" }));
};

reviewsRouter.get("/products/:uuid/review-eligibility", authenticate, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  if (req.user!.role !== "customer") return res.status(403).json({ message: "Customer access required" });

  try {
    const product = await Product.findOne({ _id: productId, status: "active" }).select("_id");
    if (!product) return res.status(404).json({ message: "Product not found" });
    const paidOrders = await Order.find({
      user_id: req.user!.id,
      payment_status: "paid",
      status: { $in: ["placed", "completed"] },
    }).select("_id").lean();
    if (!paidOrders.length) return res.json({ eligible: false, order_item_id: null });

    const purchases = await OrderItem.find({
      order_id: { $in: paidOrders.map((order) => order._id.toString()) },
      product_id: productId,
    }).sort({ _id: -1 }).select("_id order_id vendor_id").lean();
    for (const purchase of purchases) {
      const alreadyReviewed = await Review.exists({ order_item_id: purchase._id.toString() });
      const eligibleOrder = await isReviewableDeliveredOrder(purchase.order_id, purchase.vendor_id, req.user!.id);
      if (!alreadyReviewed && eligibleOrder) {
        return res.json({ eligible: true, order_item_id: purchase._id.toString() });
      }
    }
    return res.json({ eligible: false, order_item_id: null });
  } catch (error) {
    console.error("Get product review eligibility error:", error);
    return res.status(500).json({ message: "Failed to check review eligibility" });
  }
});

reviewsRouter.post("/products/:uuid/reviews", authenticate, async (req: AuthRequest, res) => {
  const productId = req.params.uuid;
  if (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId)) {
    return res.status(400).json({ message: "Invalid product id" });
  }
  if (req.user!.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" });
  }
  const validation = productReviewCreateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const product = await Product.findOne({ _id: productId, status: "active" }).select("_id");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const { order_item_id, rating, title, comment } = validation.data;
    const orderItem = await OrderItem.findOne({ _id: order_item_id, product_id: productId });
    if (!orderItem) return res.status(403).json({ message: "Purchase is not eligible for review" });
    if (!await isReviewableDeliveredOrder(orderItem.order_id, orderItem.vendor_id, req.user!.id)) {
      return res.status(403).json({ message: "Purchase is not eligible for review" });
    }
    if (await Review.exists({ order_item_id })) {
      return res.status(409).json({ message: "This purchase has already been reviewed" });
    }

    const review = await Review.create({ product_id: productId, user_id: req.user!.id, order_item_id, rating, title, comment });
    await updateProductReviewSummary(productId);

    return res.status(201).json({
      id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
    });
  } catch (error) {
    if ((error as Error & { code?: number }).code === 11000) {
      return res.status(409).json({ message: "This purchase has already been reviewed" });
    }
    console.error("Create product review error:", error);
    return res.status(500).json({ message: "Failed to create product review" });
  }
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
  const reviewId = req.params.uuid;
  if (typeof reviewId !== "string" || !/^[a-f\d]{24}$/i.test(reviewId)) {
    return res.status(400).json({ message: "Invalid review id" });
  }
  try {
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });
    return res.json({
      id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
    });
  } catch (error) {
    console.error("Get review error:", error);
    return res.status(500).json({ message: "Failed to fetch review" });
  }
});

reviewsRouter.patch("/reviews/:uuid", authenticate, async (req: AuthRequest, res) => {
  const reviewId = req.params.uuid;
  if (typeof reviewId !== "string" || !/^[a-f\d]{24}$/i.test(reviewId)) {
    return res.status(400).json({ message: "Invalid review id" });
  }
  if (req.user!.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const validation = reviewUpdateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const review = await Review.findOneAndUpdate(
      { _id: reviewId, user_id: req.user!.id },
      validation.data,
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ message: "Review not found" });
    await updateProductReviewSummary(review.product_id);
    return res.json({
      id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      created_at: review.created_at,
    });
  } catch (error) {
    console.error("Update review error:", error);
    return res.status(500).json({ message: "Failed to update review" });
  }
});

reviewsRouter.delete("/reviews/:uuid", authenticate, async (req: AuthRequest, res) => {
  const reviewId = req.params.uuid;
  if (typeof reviewId !== "string" || !/^[a-f\d]{24}$/i.test(reviewId)) {
    return res.status(400).json({ message: "Invalid review id" });
  }
  if (req.user!.role !== "customer") return res.status(403).json({ message: "Customer access required" });

  try {
    const review = await Review.findOneAndDelete({ _id: reviewId, user_id: req.user!.id });
    if (!review) return res.status(404).json({ message: "Review not found" });
    await updateProductReviewSummary(review.product_id);
    return res.status(204).send();
  } catch (error) {
    console.error("Delete review error:", error);
    return res.status(500).json({ message: "Failed to delete review" });
  }
});

reviewsRouter.get("/users/me/reviews", authenticate, async (req: AuthRequest, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const queryValidation = productReviewsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const { page, limit } = queryValidation.data;
    const filter = { user_id: req.user!.id };
    const [reviews, total] = await Promise.all([
      Review.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Review.countDocuments(filter),
    ]);
    return res.json({
      reviews: reviews.map((review) => ({
        id: review.id,
        product_id: review.product_id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        created_at: review.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get user reviews error:", error);
    return res.status(500).json({ message: "Failed to fetch user reviews" });
  }
});

export default reviewsRouter;
