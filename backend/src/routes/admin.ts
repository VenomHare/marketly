import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  AdminAuditLog, Category, Coupon, CouponRedemption, Order, OrderItem, Payment,
  PaymentRefundRequest, Product, Review, ReturnRequest, Shipment, User, Vendor,
  VendorKyc, VendorOrder, VendorSettlement,
} from "../models";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth";
import { updateUserStatusSchema } from "../validators/auth";
import { vendorKycDecisionSchema } from "../validators/vendors";
import { elasticsearchRequest, indexProduct } from "../utils/elasticsearch";
import { createPresignedDownloadUrl } from "../utils/objectStorage";
import { createRazorpayTransfer } from "../utils/razorpay";
import { acquireRedisMutex, RedisMutexTimeoutError } from "../utils/redisMutex";

const adminRouter = Router();
// Protect only this router's admin namespace; the router is mounted at /api/v1,
// where unrelated public routes (for example GET /products) must keep working.
adminRouter.use("/admin", authenticate, requireAdmin);

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parent_id: idSchema.optional(),
}).strict();
const categoryUpdateSchema = categoryCreateSchema.partial().strict().refine((v) => Object.keys(v).length > 0);
const couponFields = {
  code: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  product_ids: z.array(idSchema).min(1).max(100).refine((ids) => new Set(ids).size === ids.length).optional(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().finite().positive(),
  max_discount_paise: z.number().int().positive().optional(),
  min_order_paise: z.number().int().min(0).optional(),
  usage_limit: z.number().int().positive().optional(),
  starts_at: z.iso.datetime().transform((v) => new Date(v)),
  expires_at: z.iso.datetime().transform((v) => new Date(v)),
  is_active: z.boolean().default(true),
};
const couponCreateSchema = z.object(couponFields).strict().superRefine((v, ctx) => {
  if (v.expires_at <= v.starts_at) ctx.addIssue({ code: "custom", message: "expires_at must be after starts_at", path: ["expires_at"] });
  if (v.discount_type === "percentage" && v.discount_value > 100) ctx.addIssue({ code: "custom", message: "Percentage cannot exceed 100", path: ["discount_value"] });
  if (v.discount_type === "fixed" && !Number.isSafeInteger(v.discount_value)) ctx.addIssue({ code: "custom", message: "Fixed discount must be integer paise", path: ["discount_value"] });
});
const couponUpdateSchema = z.object({
  code: couponFields.code.optional(),
  product_ids: couponFields.product_ids,
  discount_type: couponFields.discount_type.optional(),
  discount_value: couponFields.discount_value.optional(),
  max_discount_paise: couponFields.max_discount_paise,
  min_order_paise: couponFields.min_order_paise,
  usage_limit: couponFields.usage_limit,
  starts_at: couponFields.starts_at.optional(),
  expires_at: couponFields.expires_at.optional(),
  is_active: couponFields.is_active.optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
const orderStatusSchema = z.object({ status: z.enum(["pending", "placed", "cancelled", "completed"]) }).strict();
const moderationSchema = z.object({ status: z.enum(["approved", "rejected", "hidden"]), reason: z.string().trim().max(1000).optional() }).strict();
const vendorStatusSchema = z.object({ status: z.enum(["active", "suspended"] ) }).strict();
const vendorCommissionSchema = z.object({ commission_rate_bps: z.number().int().min(0).max(10_000) }).strict();
const createAdminSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().trim().toLowerCase().max(254), password: z.string().min(12).max(128) }).strict();
const dateRangeSchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict().refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to));
const validId = (value: unknown): value is string => typeof value === "string" && idSchema.safeParse(value).success;
const safeUser = (user: any) => ({ id: user._id?.toString() ?? user.id, name: user.name, email: user.email, role: user.role, status: user.status, created_at: user.created_at, updated_at: user.updated_at });
const safeVendor = (vendor: any) => ({ id: vendor._id?.toString() ?? vendor.id, user_id: vendor.user_id, name: vendor.name, display_name: vendor.display_name, address: vendor.address, postal_code: vendor.postal_code, kyc_status: vendor.kyc_status, commission_rate_bps: vendor.commission_rate_bps, razorpay_linked_account_id: vendor.razorpay_linked_account_id ?? null, created_at: vendor.created_at, updated_at: vendor.updated_at });
const safeCoupon = (c: any) => ({ id: c._id?.toString() ?? c.id, code: c.code, ...(c.product_ids?.length ? { product_ids: c.product_ids } : {}), discount_type: c.discount_type, discount_value: c.discount_value, ...(c.max_discount_paise !== undefined ? { max_discount_paise: c.max_discount_paise } : {}), ...(c.min_order_paise !== undefined ? { min_order_paise: c.min_order_paise } : {}), ...(c.usage_limit !== undefined ? { usage_limit: c.usage_limit } : {}), starts_at: c.starts_at, expires_at: c.expires_at, is_active: c.is_active });
const fail = (res: any, label: string, error: unknown) => { console.error(`${label}:`, error); return res.status(500).json({ message: `Failed to ${label.toLowerCase()}` }); };
async function audit(req: AuthRequest, action: string, entity_type: string, entity_id: string) {
  await AdminAuditLog.create({ admin_user_id: req.user!.id, action, entity_type, entity_id });
}

adminRouter.get("/admin/users", async (req, res) => {
  const q = z.object({ role: z.enum(["customer", "vendor", "admin"]).optional() }).strict().safeParse(req.query);
  if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const users = await User.find(q.data.role ? { role: q.data.role } : {}).sort({ created_at: -1, _id: -1 }).lean(); return res.json(users.map(safeUser)); }
  catch (e) { return fail(res, "fetch users", e); }
});
// Admin accounts can only be provisioned by an active administrator. Public
// registration remains hard-coded to the customer role.
adminRouter.post("/admin/users/admin", async (req: AuthRequest, res) => {
  const v = createAdminSchema.safeParse(req.body);
  if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    if (await User.exists({ email: v.data.email })) return res.status(409).json({ message: "Email already registered" });
    const user = await User.create({ name: v.data.name, email: v.data.email, password_hash: await bcrypt.hash(v.data.password, 12), role: "admin", status: "active" });
    await audit(req, "admin.create", "user", user.id);
    return res.status(201).json(safeUser(user));
  } catch (e: any) {
    if (e?.code === 11000) return res.status(409).json({ message: "Email already registered" });
    return fail(res, "create administrator", e);
  }
});
adminRouter.get("/admin/users/:uuid", async (req, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid user id" });
  try { const user = await User.findById(req.params.uuid).lean(); if (!user) return res.status(404).json({ message: "User not found" }); return res.json(safeUser(user)); }
  catch (e) { return fail(res, "fetch user", e); }
});
adminRouter.patch("/admin/users/:uuid/status", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid user id" });
  const v = updateUserStatusSchema.strict().safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  if (req.params.uuid === req.user!.id && v.data.status === "suspended") return res.status(409).json({ message: "Administrators cannot suspend their own account" });
  try { const user = await User.findByIdAndUpdate(req.params.uuid, { status: v.data.status, updated_at: new Date() }, { new: true, runValidators: true }).lean(); if (!user) return res.status(404).json({ message: "User not found" }); await audit(req, "user.status", "user", req.params.uuid); return res.json(safeUser(user)); }
  catch (e) { return fail(res, "update user status", e); }
});

adminRouter.get("/admin/vendors", async (req, res) => {
  const q = pageSchema.extend({ status: z.enum(["pending", "verified", "rejected"]).optional() }).strict().safeParse(req.query);
  if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const filter = q.data.status ? { kyc_status: q.data.status } : {}; const [items, total] = await Promise.all([Vendor.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), Vendor.countDocuments(filter)]); return res.json({ vendors: items.map(safeVendor), pagination: { ...q.data, total, total_pages: Math.ceil(total / q.data.limit) } }); }
  catch (e) { return fail(res, "fetch vendors", e); }
});
adminRouter.get("/admin/vendors/:uuid", async (req, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  try { const v = await Vendor.findById(req.params.uuid).lean(); if (!v) return res.status(404).json({ message: "Vendor not found" }); return res.json(safeVendor(v)); }
  catch (e) { return fail(res, "fetch vendor", e); }
});
adminRouter.get("/admin/vendors/:uuid/kyc", async (req, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  try { const vendor = await Vendor.findById(req.params.uuid).select("_id").lean(); if (!vendor) return res.status(404).json({ message: "Vendor not found" }); const kyc = await VendorKyc.findOne({ vendor_id: req.params.uuid }).lean(); if (!kyc) return res.status(404).json({ message: "KYC submission not found" }); return res.json({ id: kyc._id.toString(), vendor_id: kyc.vendor_id, status: kyc.status, address_proof_key: kyc.address_proof_key, identity_proof_key: kyc.identity_proof_key, submitted_at: kyc.submitted_at, reviewed_at: kyc.reviewed_at, ...(kyc.rejection_reason ? { rejection_reason: kyc.rejection_reason } : {}) }); }
  catch (e) { return fail(res, "fetch vendor KYC", e); }
});
adminRouter.get("/admin/vendors/:uuid/kyc/documents", async (req, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  try { const kyc = await VendorKyc.findOne({ vendor_id: req.params.uuid }).select("address_proof_key identity_proof_key status").lean(); if (!kyc) return res.status(404).json({ message: "KYC submission not found" }); return res.json({ address_proof_key: kyc.address_proof_key, identity_proof_key: kyc.identity_proof_key, status: kyc.status }); }
  catch (e) { return fail(res, "fetch KYC documents", e); }
});
adminRouter.get("/admin/vendors/:uuid/kyc/documents/:document/access", async (req, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  const document = req.params.document === "address" ? "address_proof_key" : req.params.document === "identity" ? "identity_proof_key" : null;
  if (!document) return res.status(400).json({ message: "Invalid document type" });
  try {
    const kyc = await VendorKyc.findOne({ vendor_id: req.params.uuid }).select(`vendor_id ${document}`).lean();
    if (!kyc) return res.status(404).json({ message: "KYC submission not found" });
    const key = kyc[document];
    if (!key || !key.startsWith(`kyc/${req.params.uuid}/`)) return res.status(404).json({ message: "KYC document not found" });
    return res.json({ url: await createPresignedDownloadUrl(key, 300), expires_in_seconds: 300 });
  } catch (e) { return fail(res, "create KYC document access link", e); }
});
adminRouter.patch("/admin/vendors/:uuid/verify", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  const v = vendorKycDecisionSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const vendor = await Vendor.findById(req.params.uuid); if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const existingKyc = await VendorKyc.findOne({ vendor_id: vendor.id }).select("status").lean(); if (!existingKyc) return res.status(404).json({ message: "KYC submission not found" });
    const now = new Date();
    const kyc = await VendorKyc.findOneAndUpdate(
      { vendor_id: vendor.id, status: "pending" },
      { $set: { status: v.data.status, reviewed_by_user_id: req.user!.id, reviewed_at: now, ...(v.data.status === "rejected" ? { rejection_reason: v.data.rejection_reason } : {}), updated_at: now }, ...(v.data.status === "verified" ? { $unset: { rejection_reason: 1 } } : {}) },
      { new: true, runValidators: true },
    );
    if (!kyc) return res.status(409).json({ message: "KYC submission has already been reviewed" });
    vendor.kyc_status = v.data.status; vendor.updated_at = now; await vendor.save();
    await audit(req, `vendor.kyc.${v.data.status}`, "vendor", vendor.id);
    return res.json({ vendor: safeVendor(vendor), kyc: { id: kyc.id, status: kyc.status, reviewed_by_user_id: kyc.reviewed_by_user_id, reviewed_at: kyc.reviewed_at, ...(kyc.rejection_reason ? { rejection_reason: kyc.rejection_reason } : {}) } });
  } catch (e) { return fail(res, "review vendor KYC", e); }
});
adminRouter.patch("/admin/vendors/:uuid/status", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  const v = vendorStatusSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const vendor = await Vendor.findById(req.params.uuid); if (!vendor) return res.status(404).json({ message: "Vendor not found" }); const user = await User.findById(vendor.user_id); if (!user) return res.status(404).json({ message: "Vendor user not found" }); user.status = v.data.status; user.updated_at = new Date(); await user.save(); await audit(req, `vendor.${v.data.status}`, "vendor", vendor.id); return res.json({ vendor: safeVendor(vendor), user: safeUser(user) }); }
  catch (e) { return fail(res, "update vendor status", e); }
});
adminRouter.patch("/admin/vendors/:uuid/commission", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  const v = vendorCommissionSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const vendor = await Vendor.findByIdAndUpdate(req.params.uuid, { commission_rate_bps: v.data.commission_rate_bps, updated_at: new Date() }, { new: true, runValidators: true });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    await audit(req, "vendor.commission.update", "vendor", vendor.id);
    return res.json(safeVendor(vendor));
  } catch (e) { return fail(res, "update vendor commission", e); }
});

adminRouter.post("/admin/categories", async (req, res) => {
  const v = categoryCreateSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { if (v.data.parent_id && !(await Category.exists({ _id: v.data.parent_id }))) return res.status(404).json({ message: "Parent category not found" }); const c = await Category.create(v.data); await audit(req as AuthRequest, "category.create", "category", c.id); return res.status(201).json({ id: c.id, name: c.name, slug: c.slug, ...(c.parent_id ? { parent_id: c.parent_id } : {}) }); }
  catch (e: any) { if (e?.code === 11000) return res.status(409).json({ message: "Category slug already exists" }); return fail(res, "create category", e); }
});
adminRouter.patch("/admin/categories/:uuid", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid category id" }); const v = categoryUpdateSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    if (v.data.parent_id === req.params.uuid) return res.status(400).json({ message: "A category cannot be its own parent" });
    if (v.data.parent_id && !(await Category.exists({ _id: v.data.parent_id }))) return res.status(404).json({ message: "Parent category not found" });
    if (v.data.parent_id) {
      let ancestor: any = await Category.findById(v.data.parent_id).select("parent_id").lean();
      const seen = new Set<string>();
      while (ancestor) {
        const ancestorId = ancestor._id.toString();
        if (ancestorId === req.params.uuid || seen.has(ancestorId)) return res.status(400).json({ message: "Category hierarchy cannot contain a cycle" });
        seen.add(ancestorId);
        ancestor = ancestor.parent_id ? await Category.findById(ancestor.parent_id).select("parent_id").lean() : null;
      }
    }
    const c = await Category.findByIdAndUpdate(req.params.uuid, v.data, { new: true, runValidators: true }); if (!c) return res.status(404).json({ message: "Category not found" }); await audit(req, "category.update", "category", c.id); return res.json({ id: c.id, name: c.name, slug: c.slug, ...(c.parent_id ? { parent_id: c.parent_id } : {}) });
  }
  catch (e: any) { if (e?.code === 11000) return res.status(409).json({ message: "Category slug already exists" }); return fail(res, "update category", e); }
});
adminRouter.delete("/admin/categories/:uuid", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid category id" });
  try { const c = await Category.findById(req.params.uuid); if (!c) return res.status(404).json({ message: "Category not found" }); if (await Category.exists({ parent_id: c.id }) || await Product.exists({ category_id: c.id })) return res.status(409).json({ message: "Category is in use" }); await c.deleteOne(); await audit(req, "category.delete", "category", c.id); return res.status(204).end(); }
  catch (e) { return fail(res, "delete category", e); }
});

adminRouter.post("/admin/coupons", async (req: AuthRequest, res) => {
  const v = couponCreateSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { if (v.data.product_ids && await Product.countDocuments({ _id: { $in: v.data.product_ids } }) !== v.data.product_ids.length) return res.status(400).json({ message: "Invalid product targeting" }); const c = await Coupon.create({ ...v.data, code: v.data.code.toUpperCase() }); await audit(req, "coupon.create", "coupon", c.id); return res.status(201).json(safeCoupon(c)); }
  catch (e: any) { if (e?.code === 11000) return res.status(409).json({ message: "Coupon code already exists" }); return fail(res, "create coupon", e); }
});
adminRouter.get("/admin/coupons", async (req, res) => {
  const q = pageSchema.safeParse(req.query); if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const { page, limit } = q.data;
    const [coupons, total] = await Promise.all([Coupon.find().sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), Coupon.countDocuments()]);
    const counts = await CouponRedemption.aggregate([{ $match: { coupon_id: { $in: coupons.map(c => c._id.toString()) } } }, { $group: { _id: "$coupon_id", count: { $sum: 1 } } }]);
    const usage = new Map(counts.map(row => [row._id, row.count]));
    return res.json({ coupons: coupons.map(c => ({ ...safeCoupon(c), usage_count: usage.get(c._id.toString()) ?? 0 })), pagination: { ...q.data, total, total_pages: Math.ceil(total / limit) } });
  } catch (e) { return fail(res, "fetch coupons", e); }
});
adminRouter.get("/admin/coupon-redemptions", async (req, res) => {
  const q = pageSchema.safeParse(req.query); if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const { page, limit } = q.data;
    const [redemptions, total] = await Promise.all([CouponRedemption.find().sort({ redeemed_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), CouponRedemption.countDocuments()]);
    const ids = [...new Set(redemptions.map(r => r.coupon_id))];
    const coupons = await Coupon.find({ _id: { $in: ids } }).select("code").lean();
    const codes = new Map(coupons.map(c => [c._id.toString(), c.code]));
    return res.json({ redemptions: redemptions.map(r => ({ id: r._id.toString(), coupon_id: r.coupon_id, code: codes.get(r.coupon_id) ?? null, order_id: r.order_id, user_id: r.user_id, discount_paise: r.discount_paise, redeemed_at: r.redeemed_at })), pagination: { ...q.data, total, total_pages: Math.ceil(total / limit) } });
  } catch (e) { return fail(res, "fetch coupon redemptions", e); }
});
adminRouter.patch("/admin/coupons/:uuid", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid coupon id" }); const v = couponUpdateSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const old = await Coupon.findById(req.params.uuid).lean(); if (!old) return res.status(404).json({ message: "Coupon not found" }); const merged = { ...old, ...v.data }; if (merged.expires_at <= merged.starts_at || (merged.discount_type === "percentage" && merged.discount_value > 100)) return res.status(400).json({ message: "Invalid parameters" }); if (v.data.product_ids && await Product.countDocuments({ _id: { $in: v.data.product_ids } }) !== v.data.product_ids.length) return res.status(400).json({ message: "Invalid product targeting" }); const c = await Coupon.findByIdAndUpdate(req.params.uuid, { ...v.data, ...(v.data.code ? { code: v.data.code.toUpperCase() } : {}) }, { new: true, runValidators: true }); await audit(req, "coupon.update", "coupon", c!.id); return res.json(safeCoupon(c)); }
  catch (e: any) { if (e?.code === 11000) return res.status(409).json({ message: "Coupon code already exists" }); return fail(res, "update coupon", e); }
});
adminRouter.delete("/admin/coupons/:uuid", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid coupon id" });
  try { const c = await Coupon.findById(req.params.uuid); if (!c) return res.status(404).json({ message: "Coupon not found" }); if (await CouponRedemption.exists({ coupon_id: c.id })) { c.is_active = false; await c.save(); await audit(req, "coupon.deactivate", "coupon", c.id); return res.status(200).json(safeCoupon(c)); } await c.deleteOne(); await audit(req, "coupon.delete", "coupon", c.id); return res.status(204).end(); }
  catch (e) { return fail(res, "delete coupon", e); }
});

adminRouter.get("/admin/orders", async (req, res) => {
  const q = pageSchema.extend({ status: z.enum(["pending", "placed", "cancelled", "completed"]).optional(), payment_status: z.enum(["pending", "paid", "failed", "partially_refunded", "refunded"]).optional() }).strict().safeParse(req.query); if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const filter = { ...(q.data.status ? { status: q.data.status } : {}), ...(q.data.payment_status ? { payment_status: q.data.payment_status } : {}) }; const [items, total] = await Promise.all([Order.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), Order.countDocuments(filter)]); return res.json({ orders: items.map((o) => ({ id: o._id.toString(), user_id: o.user_id, subtotal_paise: o.subtotal_paise, discount_paise: o.discount_paise, shipping_paise: o.shipping_paise, total_paise: o.total_paise, payment_status: o.payment_status, status: o.status, created_at: o.created_at })), pagination: { ...q.data, total, total_pages: Math.ceil(total / q.data.limit) } }); }
  catch (e) { return fail(res, "fetch orders", e); }
});
adminRouter.get("/admin/products", async (req, res) => {
  const q = pageSchema.extend({ status: z.enum(["draft", "active", "archived"]).optional() }).strict().safeParse(req.query);
  if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const filter = q.data.status ? { status: q.data.status } : {};
    const [items, total] = await Promise.all([Product.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), Product.countDocuments(filter)]);
    return res.json({ products: items.map(p => ({ id: p._id.toString(), vendor_id: p.vendor_id, category_id: p.category_id, name: p.name, sku: p.sku, price: p.price, stock: p.stock, status: p.status, created_at: p.created_at })), pagination: { ...q.data, total, total_pages: Math.ceil(total / q.data.limit) } });
  } catch (e) { return fail(res, "fetch products", e); }
});
adminRouter.patch("/admin/orders/:uuid/status", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid order id" }); const v = orderStatusSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const o = await Order.findById(req.params.uuid); if (!o) return res.status(404).json({ message: "Order not found" }); if (o.status === "cancelled" && v.data.status !== "cancelled") return res.status(409).json({ message: "Cancelled orders cannot be reopened" }); o.status = v.data.status; o.updated_at = new Date(); await o.save(); await audit(req, "order.status", "order", o.id); return res.json({ id: o.id, status: o.status, payment_status: o.payment_status, updated_at: o.updated_at }); }
  catch (e) { return fail(res, "update order status", e); }
});

adminRouter.get("/admin/settlements", async (req, res) => {
  const q = pageSchema.extend({ status: z.enum(["pending", "processing", "paid", "failed"]).optional() }).strict().safeParse(req.query); if (!q.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const filter = q.data.status ? { status: q.data.status } : {}; const [items, total] = await Promise.all([VendorSettlement.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), VendorSettlement.countDocuments(filter)]); const vendorIds = [...new Set(items.map(s => s.vendor_id))]; const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select("display_name razorpay_linked_account_id payout_balance_paise").lean(); const vendorMap = new Map(vendors.map(v => [v._id.toString(), v])); const vendorOrders = await VendorOrder.find({ _id: { $in: items.map(s => s.vendor_order_id) } }).select("_id order_id").lean(); const orderIds = [...new Set(vendorOrders.map(v => v.order_id))]; const payments = await Payment.find({ order_id: { $in: orderIds }, status: { $in: ["success", "refunded"] } }).select("order_id amount_paise provider_payment_id").lean(); const voMap = new Map(vendorOrders.map(v => [v._id.toString(), v])); const paymentMap = new Map(payments.map(p => [p.order_id, p])); return res.json({ settlements: items.map((s) => { const vendor = vendorMap.get(s.vendor_id); const vo = voMap.get(s.vendor_order_id); const payment = vo ? paymentMap.get(vo.order_id) : undefined; return { id: s._id.toString(), vendor_order_id: s.vendor_order_id, vendor_id: s.vendor_id, vendor_name: vendor?.display_name ?? "Vendor", razorpay_linked_account_id: vendor?.razorpay_linked_account_id ?? null, vendor_payout_balance_paise: vendor?.payout_balance_paise ?? 0, provider_payment_id: payment?.provider_payment_id ?? null, payment_amount_paise: payment?.amount_paise ?? null, gross_paise: s.gross_paise, commission_paise: s.commission_paise, commission_reversed_paise: s.commission_reversed_paise ?? 0, refund_paise: s.refund_paise, net_paise: s.net_paise, provider_transfer_id: s.provider_transfer_id ?? null, status: s.status, created_at: s.created_at, settled_at: s.settled_at }; } ), pagination: { ...q.data, total, total_pages: Math.ceil(total / q.data.limit) } }); }
  catch (e) { return fail(res, "fetch settlements", e); }
});
adminRouter.patch("/admin/vendors/:uuid/razorpay-account", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid vendor id" });
  const parsed = z.object({ razorpay_linked_account_id: z.string().trim().regex(/^acc_[A-Za-z0-9]+$/).nullable() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a valid Razorpay Route linked account ID" });
  try { const update = parsed.data.razorpay_linked_account_id ? { $set: { razorpay_linked_account_id: parsed.data.razorpay_linked_account_id } } : { $unset: { razorpay_linked_account_id: 1 } }; const vendor = await Vendor.findByIdAndUpdate(req.params.uuid, update, { new: true, runValidators: true }); if (!vendor) return res.status(404).json({ message: "Vendor not found" }); await audit(req, "vendor.razorpay_account", "vendor", vendor.id); return res.json(safeVendor(vendor)); }
  catch (e) { return fail(res, "update vendor payout account", e); }
});
adminRouter.post("/admin/settlements/reconcile", async (req: AuthRequest, res) => {
  if (!z.object({ confirm: z.literal(true) }).strict().safeParse(req.body).success) return res.status(400).json({ message: "Explicit confirmation is required" });
  try {
    const paidOrderIds = await Order.distinct("_id", { payment_status: "paid", status: { $in: ["placed", "completed"] } }).then(ids => ids.map(String));
    const deliveredOrders = await VendorOrder.find({ order_id: { $in: paidOrderIds }, status: "delivered" }).select("_id order_id vendor_id").lean();
    const existing = await VendorSettlement.find({ vendor_order_id: { $in: deliveredOrders.map(v => v._id.toString()) } }).select("vendor_order_id").lean();
    const existingIds = new Set(existing.map(s => s.vendor_order_id));
    const missing = deliveredOrders.filter(v => !existingIds.has(v._id.toString()));
    if (!missing.length) return res.json({ created: 0 });
    const orderItems = await OrderItem.find({ order_id: { $in: [...new Set(missing.map(v => v.order_id))] }, vendor_id: { $in: [...new Set(missing.map(v => v.vendor_id))] } }).lean();
    const itemsByOrder = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      const key = `${item.order_id}:${item.vendor_id}`;
      const group = itemsByOrder.get(key) ?? [];
      group.push(item);
      itemsByOrder.set(key, group);
    }
    const vendorIds = [...new Set(missing.map(v => v.vendor_id))];
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select("commission_rate_bps").lean();
    const rates = new Map(vendors.map(v => [v._id.toString(), v.commission_rate_bps] as const));
    const operations = missing.flatMap(vendorOrder => {
      const vendorOrderId = vendorOrder._id.toString();
      const items = itemsByOrder.get(`${vendorOrder.order_id}:${vendorOrder.vendor_id}`) ?? [];
      if (!items.length) return [];
      const gross = items.reduce((sum, item) => sum + item.line_total_paise, 0);
      const commission = Math.floor(gross * (rates.get(vendorOrder.vendor_id) ?? 0) / 10_000);
      return [{ updateOne: { filter: { vendor_order_id: vendorOrderId }, update: { $setOnInsert: { vendor_order_id: vendorOrderId, vendor_id: vendorOrder.vendor_id, gross_paise: gross, commission_paise: commission, refund_paise: 0, net_paise: gross - commission, status: "pending" } }, upsert: true } }];
    });
    const result = operations.length ? await VendorSettlement.bulkWrite(operations as any, { ordered: false }) : null;
    const created = result?.upsertedCount ?? 0;
    await audit(req, "settlements.reconcile", "settlement", "delivered-orders");
    return res.json({ created });
  } catch (e) { return fail(res, "reconcile settlements", e); }
});
adminRouter.post("/admin/settlements/:uuid/release", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid settlement id" });
  if (!z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ message: "Invalid parameters" });
  let initialSettlement: { vendor_id: string } | null;
  try { initialSettlement = await VendorSettlement.findById(req.params.uuid).select("vendor_id").lean(); }
  catch (e) { return fail(res, "load settlement", e); }
  if (!initialSettlement) return res.status(404).json({ message: "Settlement not found" });
  let release: (() => Promise<void>);
  try { release = await acquireRedisMutex(`vendor-payout-release:${initialSettlement.vendor_id}`); }
  catch (error) { return res.status(error instanceof RedisMutexTimeoutError ? 409 : 503).json({ message: "Settlement release is temporarily unavailable" }); }
  try {
    const s = await VendorSettlement.findById(req.params.uuid);
    if (!s) return res.status(404).json({ message: "Settlement not found" });
    if (!["pending", "failed"].includes(s.status)) return res.status(409).json({ message: "Only pending or failed settlements can be released" });
    if (await VendorSettlement.exists({ vendor_id: s.vendor_id, status: "processing", _id: { $ne: s._id } })) return res.status(409).json({ message: "Another transfer for this seller is still processing" });
    if (s.net_paise <= 0) return res.status(409).json({ message: "There is no seller amount to release" });
    const vendor = await Vendor.findById(s.vendor_id).select("razorpay_linked_account_id payout_balance_paise").lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const vo = await VendorOrder.findById(s.vendor_order_id).select("order_id").lean();
    const payment = vo ? await Payment.findOne({ order_id: vo.order_id, status: "success", provider: "razorpay", provider_payment_id: { $exists: true } }).lean() : null;
    if (!payment?.provider_payment_id) return res.status(409).json({ message: "A successful Razorpay payment is required" });
    if (await PaymentRefundRequest.exists({ order_id: vo!.order_id, status: { $in: ["requested", "processing"] } })) return res.status(409).json({ message: "A refund request is active for this order" });
    const payoutAmount = Math.max(0, s.net_paise + (vendor.payout_balance_paise ?? 0));
    if (payoutAmount <= 0) {
      const offset = Math.min(s.net_paise, Math.max(0, -(vendor.payout_balance_paise ?? 0)));
      if (offset <= 0) return res.status(409).json({ message: "There is no seller amount to release" });
      s.payout_balance_offset_paise = offset; s.status = "paid"; s.settled_at = new Date(); await s.save();
      await Vendor.updateOne({ _id: s.vendor_id }, { $inc: { payout_balance_paise: offset } });
      await audit(req, "settlement.offset", "settlement", s.id);
      return res.json({ id: s.id, status: s.status, amount_paise: 0, offset_paise: offset });
    }
    if (!vendor.razorpay_linked_account_id) return res.status(409).json({ message: "Configure a Razorpay Route linked account for this vendor first" });
    s.status = "processing"; await s.save();
    let transfer: Awaited<ReturnType<typeof createRazorpayTransfer>>;
    try {
      transfer = await createRazorpayTransfer(payment.provider_payment_id, vendor.razorpay_linked_account_id, payoutAmount, s.id);
    } catch (error) { s.status = "failed"; await s.save(); throw error; }
    s.provider_transfer_id = transfer.id; s.status = transfer.status === "processed" ? "paid" : transfer.status === "failed" ? "failed" : "processing"; s.payout_balance_offset_paise = s.status === "failed" ? 0 : Math.min(s.net_paise - payoutAmount, Math.max(0, -(vendor.payout_balance_paise ?? 0))); if (s.status === "paid") s.settled_at = new Date(); await s.save();
    if (s.payout_balance_offset_paise > 0) await Vendor.updateOne({ _id: s.vendor_id }, { $inc: { payout_balance_paise: s.payout_balance_offset_paise } });
    await audit(req, "settlement.release", "settlement", s.id);
    return res.json({ id: s.id, status: s.status, provider_transfer_id: s.provider_transfer_id, amount_paise: payoutAmount });
  } catch (e) { return fail(res, "release settlement", e); }
  finally { await release(); }
});
adminRouter.post("/admin/settlements/:uuid/retry", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid settlement id" }); if (Object.keys(req.body || {}).length) return res.status(400).json({ message: "Invalid parameters" });
  try { const s = await VendorSettlement.findById(req.params.uuid); if (!s) return res.status(404).json({ message: "Settlement not found" }); if (s.status !== "failed") return res.status(409).json({ message: "Only failed settlements can be retried" }); s.status = "pending"; await s.save(); await audit(req, "settlement.retry", "settlement", s.id); return res.json({ id: s.id, status: s.status }); }
  catch (e) { return fail(res, "retry settlement", e); }
});
adminRouter.patch("/admin/reviews/:uuid/moderation", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid review id" }); const v = moderationSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const r = await Review.findById(req.params.uuid); if (!r) return res.status(404).json({ message: "Review not found" }); if (v.data.status === "approved") { await AdminAuditLog.create({ admin_user_id: req.user!.id, action: "review.approved", entity_type: "review", entity_id: r.id }); return res.json({ id: r.id, status: "approved" }); } await r.deleteOne(); await audit(req, `review.${v.data.status}`, "review", r.id); return res.json({ id: r.id, status: v.data.status, ...(v.data.reason ? { reason: v.data.reason } : {}) }); }
  catch (e) { return fail(res, "moderate review", e); }
});

adminRouter.get("/admin/analytics/overview", async (_req, res) => {
  try { const [users, vendors, products, orders, revenue] = await Promise.all([User.countDocuments(), Vendor.countDocuments(), Product.countDocuments(), Order.countDocuments(), Order.aggregate([{ $match: { payment_status: "paid" } }, { $group: { _id: null, total_paise: { $sum: "$total_paise" } } }])]); return res.json({ users, vendors, products, orders, paid_revenue_paise: revenue[0]?.total_paise ?? 0 }); } catch (e) { return fail(res, "fetch analytics overview", e); }
});
async function analytics(req: any, res: any, entity: "sales" | "products" | "vendors" | "customers" | "payments" | "commissions") {
  const q = pageSchema.extend({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict().safeParse(req.query); if (!q.success || !dateRangeSchema.safeParse(req.query).success) return res.status(400).json({ message: "Invalid parameters" });
  try {
    const createdAt: any = {}; if (q.data.from) createdAt.$gte = new Date(q.data.from); if (q.data.to) createdAt.$lte = new Date(q.data.to); const timeFilter = Object.keys(createdAt).length ? { created_at: createdAt } : {};
    if (entity === "sales") { const rows = await Order.aggregate([{ $match: { ...timeFilter, payment_status: "paid" } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, orders: { $sum: 1 }, revenue_paise: { $sum: "$total_paise" } } }, { $sort: { _id: 1 } }, { $skip: (q.data.page - 1) * q.data.limit }, { $limit: q.data.limit }]); return res.json({ sales: rows }); }
    const Model: any = entity === "products" ? Product : entity === "vendors" ? Vendor : entity === "customers" ? User : entity === "payments" ? Payment : VendorSettlement;
    const filter = { ...timeFilter, ...(entity === "customers" ? { role: "customer" } : entity === "vendors" ? { kyc_status: "verified" } : {}) };
    const [rows, total] = await Promise.all([Model.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), Model.countDocuments(filter)]);
    const select = entity === "customers" ? rows.map((x: any) => ({ id: x._id.toString(), status: x.status, created_at: x.created_at })) : rows.map((x: any) => ({ id: x._id.toString(), ...(entity === "products" ? { status: x.status, price: x.price } : entity === "vendors" ? { kyc_status: x.kyc_status } : entity === "payments" ? { status: x.status, amount_paise: x.amount_paise } : { status: x.status, net_paise: x.net_paise }), created_at: x.created_at }));
    return res.json({ [entity]: select, pagination: { page: q.data.page, limit: q.data.limit, total, total_pages: Math.ceil(total / q.data.limit) } });
  } catch (e) { return fail(res, `fetch analytics ${entity}`, e); }
}
for (const entity of ["sales", "products", "vendors", "customers", "payments", "commissions"] as const) adminRouter.get(`/admin/analytics/${entity}`, (req, res) => analytics(req, res, entity));

adminRouter.post("/admin/search/reindex", async (req: AuthRequest, res) => {
  const bodySchema = z.object({ confirm: z.literal(true) }).strict(); const v = bodySchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Explicit confirmation is required" });
  try { let cursor: any = null; let indexed = 0; do { let query: any = Product.find({ status: "active" }).sort({ _id: 1 }).limit(100).lean(); if (cursor) query = query.where("_id").gt(cursor); const batch = await query; for (const p of batch) await indexProduct({ ...p, id: p._id.toString() } as any); indexed += batch.length; cursor = batch.length ? batch[batch.length - 1]._id : null; } while (cursor); await audit(req, "search.reindex", "search", "products"); return res.json({ indexed }); } catch (e) { return fail(res, "reindex products", e); }
});
adminRouter.get("/admin/search/index-status", async (_req, res) => {
  try { const [count, index] = await Promise.all([Product.countDocuments({ status: "active" }), elasticsearchRequest("GET", "products/_count")]); return res.json({ active_products: count, indexed_products: (index as any).count ?? 0, synchronized: count === ((index as any).count ?? 0) }); } catch (e) { return fail(res, "fetch search index status", e); }
});

export default adminRouter;
