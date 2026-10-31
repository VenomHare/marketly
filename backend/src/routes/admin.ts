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
const createAdminSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().trim().toLowerCase().max(254), password: z.string().min(12).max(128) }).strict();
const dateRangeSchema = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict().refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to));
const validId = (value: unknown): value is string => typeof value === "string" && idSchema.safeParse(value).success;
const safeUser = (user: any) => ({ id: user._id?.toString() ?? user.id, name: user.name, email: user.email, role: user.role, status: user.status, created_at: user.created_at, updated_at: user.updated_at });
const safeVendor = (vendor: any) => ({ id: vendor._id?.toString() ?? vendor.id, user_id: vendor.user_id, name: vendor.name, display_name: vendor.display_name, address: vendor.address, postal_code: vendor.postal_code, kyc_status: vendor.kyc_status, commission_rate_bps: vendor.commission_rate_bps, created_at: vendor.created_at, updated_at: vendor.updated_at });
const safeCoupon = (c: any) => ({ id: c._id?.toString() ?? c.id, code: c.code, discount_type: c.discount_type, discount_value: c.discount_value, ...(c.max_discount_paise !== undefined ? { max_discount_paise: c.max_discount_paise } : {}), ...(c.min_order_paise !== undefined ? { min_order_paise: c.min_order_paise } : {}), ...(c.usage_limit !== undefined ? { usage_limit: c.usage_limit } : {}), starts_at: c.starts_at, expires_at: c.expires_at, is_active: c.is_active });
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
  try { const c = await Coupon.create({ ...v.data, code: v.data.code.toUpperCase() }); await audit(req, "coupon.create", "coupon", c.id); return res.status(201).json(safeCoupon(c)); }
  catch (e: any) { if (e?.code === 11000) return res.status(409).json({ message: "Coupon code already exists" }); return fail(res, "create coupon", e); }
});
adminRouter.patch("/admin/coupons/:uuid", async (req: AuthRequest, res) => {
  if (!validId(req.params.uuid)) return res.status(400).json({ message: "Invalid coupon id" }); const v = couponUpdateSchema.safeParse(req.body); if (!v.success) return res.status(400).json({ message: "Invalid parameters" });
  try { const old = await Coupon.findById(req.params.uuid).lean(); if (!old) return res.status(404).json({ message: "Coupon not found" }); const merged = { ...old, ...v.data }; if (merged.expires_at <= merged.starts_at || (merged.discount_type === "percentage" && merged.discount_value > 100)) return res.status(400).json({ message: "Invalid parameters" }); const c = await Coupon.findByIdAndUpdate(req.params.uuid, { ...v.data, ...(v.data.code ? { code: v.data.code.toUpperCase() } : {}) }, { new: true, runValidators: true }); await audit(req, "coupon.update", "coupon", c!.id); return res.json(safeCoupon(c)); }
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
  try { const filter = q.data.status ? { status: q.data.status } : {}; const [items, total] = await Promise.all([VendorSettlement.find(filter).sort({ created_at: -1, _id: -1 }).skip((q.data.page - 1) * q.data.limit).limit(q.data.limit).lean(), VendorSettlement.countDocuments(filter)]); return res.json({ settlements: items.map((s) => ({ id: s._id.toString(), vendor_order_id: s.vendor_order_id, vendor_id: s.vendor_id, gross_paise: s.gross_paise, commission_paise: s.commission_paise, refund_paise: s.refund_paise, net_paise: s.net_paise, status: s.status, created_at: s.created_at, settled_at: s.settled_at })), pagination: { ...q.data, total, total_pages: Math.ceil(total / q.data.limit) } }); }
  catch (e) { return fail(res, "fetch settlements", e); }
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
