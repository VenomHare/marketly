import { Router } from "express";
import { z } from "zod";
import { Coupon, CouponRedemption, Product } from "../models";
import { AuthRequest, authenticate, requireVendor, requireVerifiedVendor } from "../middleware/auth";

const couponsRouter = Router();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const couponsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const couponValidationSchema = z.object({
  code: z.string().trim().min(1).max(100),
  subtotal_paise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  eligible_subtotal_paise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

const userCouponsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const couponIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const vendorCouponSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  product_ids: z.array(couponIdSchema).min(1).max(100),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().finite().positive(),
  max_discount_paise: z.number().int().positive().optional(),
  min_order_paise: z.number().int().min(0).optional(),
  usage_limit: z.number().int().positive().optional(),
  starts_at: z.iso.datetime().transform((value) => new Date(value)),
  expires_at: z.iso.datetime().transform((value) => new Date(value)),
}).strict().superRefine((value, ctx) => {
  if (value.expires_at <= value.starts_at) ctx.addIssue({ code: "custom", message: "Invalid date range", path: ["expires_at"] });
  if (value.discount_type === "percentage" && value.discount_value > 100) ctx.addIssue({ code: "custom", message: "Percentage cannot exceed 100", path: ["discount_value"] });
  if (value.discount_type === "fixed" && !Number.isSafeInteger(value.discount_value)) ctx.addIssue({ code: "custom", message: "Fixed discount must be integer paise", path: ["discount_value"] });
});
const couponView = (coupon: any, usageCount = 0) => ({ id: coupon._id.toString(), code: coupon.code, product_ids: coupon.product_ids ?? [], discount_type: coupon.discount_type, discount_value: coupon.discount_value, ...(coupon.max_discount_paise !== undefined ? { max_discount_paise: coupon.max_discount_paise } : {}), ...(coupon.min_order_paise !== undefined ? { min_order_paise: coupon.min_order_paise } : {}), ...(coupon.usage_limit !== undefined ? { usage_limit: coupon.usage_limit } : {}), usage_count: usageCount, starts_at: coupon.starts_at, expires_at: coupon.expires_at, is_active: coupon.is_active, is_exhausted: coupon.usage_limit !== undefined && usageCount >= coupon.usage_limit });

couponsRouter.get("/vendors/me/coupons", authenticate, requireVendor, async (req: AuthRequest, res) => {
  try {
    const coupons = await Coupon.find({ vendor_id: req.vendor!.id }).sort({ _id: -1 }).lean();
    const counts = await CouponRedemption.aggregate([{ $match: { coupon_id: { $in: coupons.map(coupon => coupon._id.toString()) } } }, { $group: { _id: "$coupon_id", count: { $sum: 1 } } }]);
    const usage = new Map(counts.map(row => [row._id, row.count]));
    return res.json({ coupons: coupons.map(coupon => couponView(coupon, usage.get(coupon._id.toString()) ?? 0)) });
  } catch (error) {
    console.error("List vendor coupons error:", error);
    return res.status(500).json({ message: "Failed to fetch coupons" });
  }
});

couponsRouter.post("/vendors/me/coupons", authenticate, requireVerifiedVendor, async (req: AuthRequest, res) => {
  const validation = vendorCouponSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const ids = [...new Set(validation.data.product_ids)];
    const products = await Product.find({ _id: { $in: ids }, vendor_id: req.vendor!.id }).select("_id").lean();
    if (products.length !== ids.length) return res.status(400).json({ message: "Choose products from your catalog" });
    const coupon = await Coupon.create({ ...validation.data, product_ids: ids, vendor_id: req.vendor!.id, code: validation.data.code.toUpperCase() });
    return res.status(201).json(couponView(coupon));
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ message: "Coupon code already exists" });
    console.error("Create vendor coupon error:", error);
    return res.status(500).json({ message: "Failed to create coupon" });
  }
});

couponsRouter.delete("/vendors/me/coupons/:uuid", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!couponIdSchema.safeParse(req.params.uuid).success) return res.status(400).json({ message: "Invalid coupon id" });
  try {
    const coupon = await Coupon.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    if (await CouponRedemption.exists({ coupon_id: coupon.id })) {
      coupon.is_active = false;
      await coupon.save();
      return res.json(couponView(coupon));
    }
    await coupon.deleteOne();
    return res.status(204).end();
  } catch (error) {
    console.error("Delete vendor coupon error:", error);
    return res.status(500).json({ message: "Failed to delete coupon" });
  }
});

couponsRouter.get("/coupons", async (req, res) => {
  const validation = couponsListQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const { page, limit } = validation.data;
    const now = new Date();
    const filter = {
      is_active: true,
      starts_at: { $lte: now },
      expires_at: { $gt: now },
    };
    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ expires_at: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Coupon.countDocuments(filter),
    ]);
    return res.json({
      coupons: coupons.map((coupon) => ({
        id: coupon._id.toString(),
        code: coupon.code,
        ...(coupon.product_ids?.length ? { product_ids: coupon.product_ids } : {}),
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        ...(coupon.max_discount_paise !== undefined ? { max_discount_paise: coupon.max_discount_paise } : {}),
        ...(coupon.min_order_paise !== undefined ? { min_order_paise: coupon.min_order_paise } : {}),
        ...(coupon.usage_limit !== undefined ? { usage_limit: coupon.usage_limit } : {}),
        starts_at: coupon.starts_at,
        expires_at: coupon.expires_at,
        is_active: coupon.is_active,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("List coupons error:", error);
    return res.status(500).json({ message: "Failed to fetch coupons" });
  }
});

couponsRouter.get("/coupons/:uuid", async (req, res) => {
  const couponId = req.params.uuid;
  if (typeof couponId !== "string" || !/^[a-f\d]{24}$/i.test(couponId)) {
    return res.status(400).json({ message: "Invalid coupon id" });
  }

  try {
    const now = new Date();
    const coupon = await Coupon.findOne({
      _id: couponId,
      is_active: true,
      starts_at: { $lte: now },
      expires_at: { $gt: now },
    }).lean();
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    return res.json({
      id: coupon._id.toString(),
      code: coupon.code,
      ...(coupon.product_ids?.length ? { product_ids: coupon.product_ids } : {}),
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      ...(coupon.max_discount_paise !== undefined ? { max_discount_paise: coupon.max_discount_paise } : {}),
      ...(coupon.min_order_paise !== undefined ? { min_order_paise: coupon.min_order_paise } : {}),
      ...(coupon.usage_limit !== undefined ? { usage_limit: coupon.usage_limit } : {}),
      starts_at: coupon.starts_at,
      expires_at: coupon.expires_at,
      is_active: coupon.is_active,
    });
  } catch (error) {
    console.error("Get coupon error:", error);
    return res.status(500).json({ message: "Failed to fetch coupon" });
  }
});

couponsRouter.post("/coupons/validate", async (req, res) => {
  const validation = couponValidationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid request body" });

  try {
    const { code, subtotal_paise: subtotalPaise, eligible_subtotal_paise: eligibleSubtotalInput } = validation.data;
    const coupon = await Coupon.findOne({ code: new RegExp(`^${escapeRegex(code)}$`, "i") }).lean();
    if (!coupon) return res.status(200).json({ valid: false, message: "Coupon not found" });

    const now = new Date();
    if (!coupon.is_active) return res.status(200).json({ valid: false, message: "Coupon is inactive" });
    if (coupon.starts_at > now) return res.status(200).json({ valid: false, message: "Coupon is not active yet" });
    if (coupon.expires_at <= now) return res.status(200).json({ valid: false, message: "Coupon has expired" });
    const discountBasePaise = coupon.product_ids?.length ? eligibleSubtotalInput : subtotalPaise;
    if (coupon.product_ids?.length && (discountBasePaise === undefined || discountBasePaise <= 0)) {
      return res.status(200).json({ valid: false, message: "Coupon requires eligible products in the cart" });
    }
    if (coupon.min_order_paise !== undefined && (discountBasePaise ?? subtotalPaise) < coupon.min_order_paise) {
      return res.status(200).json({ valid: false, message: "Order does not meet the minimum amount" });
    }
    if (coupon.usage_limit !== undefined) {
      const redemptionCount = await CouponRedemption.countDocuments({ coupon_id: coupon._id.toString() });
      if (redemptionCount >= coupon.usage_limit) {
        return res.status(200).json({ valid: false, message: "Coupon usage limit has been reached" });
      }
    }

    let discountPaise = coupon.discount_type === "percentage"
      ? Math.floor((discountBasePaise ?? subtotalPaise) * coupon.discount_value / 100)
      : coupon.discount_value;
    if (coupon.max_discount_paise !== undefined) {
      discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
    }
    discountPaise = Math.min(discountPaise, discountBasePaise ?? subtotalPaise);

    return res.status(200).json({ valid: true, coupon_id: coupon._id.toString(), code: coupon.code, ...(coupon.product_ids?.length ? { product_ids: coupon.product_ids } : {}), discount_paise: discountPaise });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(500).json({ message: "Failed to validate coupon" });
  }
});

couponsRouter.get("/users/me/coupons", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "customer") return res.status(403).json({ message: "Customer access required" });
  const validation = userCouponsQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const { page, limit } = validation.data;
    const filter = { user_id: req.user.id };
    const [redemptions, total] = await Promise.all([
      CouponRedemption.find(filter).sort({ redeemed_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CouponRedemption.countDocuments(filter),
    ]);
    const couponIds = [...new Set(redemptions.map((redemption) => redemption.coupon_id))];
    const coupons = await Coupon.find({ _id: { $in: couponIds } }).select("code").lean();
    const couponCodes = new Map(coupons.map((coupon) => [coupon._id.toString(), coupon.code]));

    return res.json({
      coupons: redemptions.map((redemption) => ({
        id: redemption._id.toString(),
        coupon_id: redemption.coupon_id,
        code: couponCodes.get(redemption.coupon_id) ?? null,
        order_id: redemption.order_id,
        discount_paise: redemption.discount_paise,
        redeemed_at: redemption.redeemed_at,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get user coupons error:", error);
    return res.status(500).json({ message: "Failed to fetch user coupons" });
  }
});

export default couponsRouter;
