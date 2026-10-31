import { Router } from "express";
import { Order, OrderItem, Product, ProductImage, User, Vendor, VendorKyc, VendorOrder, VendorSettlement } from "../models";
import { AuthRequest, authenticate, requireVendor } from "../middleware/auth";
import {
  vendorApplicationSchema,
  vendorIdSchema,
  vendorKycSubmissionSchema,
  vendorProfileUpdateSchema,
  vendorProductsQuerySchema,
} from "../validators/vendors";

const vendorsRouter = Router();

vendorsRouter.post("/vendors", authenticate, async (req: AuthRequest, res) => {
  const validation = vendorApplicationSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user?.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active customer account required" });
    }
    if (user.role !== "customer") {
      return res.status(409).json({ message: "Only customers can apply to become a vendor" });
    }

    const existingVendor = await Vendor.findOne({ user_id: user.id });
    if (existingVendor) {
      return res.status(409).json({ message: "Vendor application already exists" });
    }

    const vendor = await Vendor.create({
      user_id: user.id,
      ...validation.data,
      kyc_status: "pending",
      commission_rate_bps: 0,
    });
    user.role = "vendor";
    await user.save();

    return res.status(201).json({
      id: vendor.id,
      user_id: vendor.user_id,
      name: vendor.name,
      display_name: vendor.display_name,
      address: vendor.address,
      postal_code: vendor.postal_code,
      kyc_status: vendor.kyc_status,
      commission_rate_bps: vendor.commission_rate_bps,
      created_at: vendor.created_at,
      updated_at: vendor.updated_at,
    });
  } catch (error) {
    console.error("Vendor application error:", error);
    return res.status(500).json({ message: "Vendor application failed" });
  }
});

vendorsRouter.get("/vendors/me/kyc", authenticate, requireVendor, async (req: AuthRequest, res) => {
  try {
    const vendorId = req.vendor!.id;
    const submission = await VendorKyc.findOne({ vendor_id: vendorId });

    if (!submission) {
      return res.json({
        vendor_id: vendorId,
        status: "not_submitted",
        documents: { address_proof: false, identity_proof: false },
      });
    }

    return res.json({
      vendor_id: submission.vendor_id,
      status: submission.status,
      rejection_reason: submission.rejection_reason,
      reviewed_at: submission.reviewed_at,
      submitted_at: submission.submitted_at,
      updated_at: submission.updated_at,
      documents: { address_proof: true, identity_proof: true },
    });
  } catch (error) {
    console.error("Get vendor KYC status error:", error);
    return res.status(500).json({ message: "Failed to fetch KYC status" });
  }
});

vendorsRouter.post("/vendors/me/kyc", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const validation = vendorKycSubmissionSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  const vendorId = req.vendor!.id;
  const ownedObjectPrefix = `kyc/${vendorId}/`;
  const { address_proof_key, identity_proof_key } = validation.data;
  if (!address_proof_key.startsWith(ownedObjectPrefix) || !identity_proof_key.startsWith(ownedObjectPrefix)) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const existingSubmission = await VendorKyc.findOne({ vendor_id: vendorId });
    if (existingSubmission && existingSubmission.status !== "rejected") {
      return res.status(409).json({ message: "KYC submission is already pending or verified" });
    }
    if (!existingSubmission && req.vendor!.kyc_status === "verified") {
      return res.status(409).json({ message: "KYC submission is already pending or verified" });
    }

    if (existingSubmission) {
      existingSubmission.address_proof_key = address_proof_key;
      existingSubmission.identity_proof_key = identity_proof_key;
      existingSubmission.status = "pending";
      existingSubmission.reviewed_by_user_id = undefined;
      existingSubmission.reviewed_at = undefined;
      existingSubmission.rejection_reason = undefined;
      existingSubmission.submitted_at = new Date();
      await existingSubmission.save();
    } else {
      await VendorKyc.create({
        vendor_id: vendorId,
        address_proof_key,
        identity_proof_key,
        status: "pending",
      });
    }

    await Vendor.findByIdAndUpdate(vendorId, { kyc_status: "pending", updated_at: new Date() });

    return res.status(existingSubmission ? 200 : 201).json({
      vendor_id: vendorId,
      status: "pending",
      documents: { address_proof: true, identity_proof: true },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "KYC submission is already pending or verified" });
    }
    console.error("Submit vendor KYC error:", error);
    return res.status(500).json({ message: "Failed to submit KYC documents" });
  }
});

vendorsRouter.get("/vendors/me", authenticate, requireVendor, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendor = await Vendor.findById(req.vendor!.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor profile not found" });
    }

    return res.json({
      id: vendor.id,
      user_id: vendor.user_id,
      name: vendor.name,
      display_name: vendor.display_name,
      address: vendor.address,
      postal_code: vendor.postal_code,
      kyc_status: vendor.kyc_status,
      commission_rate_bps: vendor.commission_rate_bps,
      created_at: vendor.created_at,
      updated_at: vendor.updated_at,
    });
  } catch (error) {
    console.error("Get own vendor profile error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor profile" });
  }
});

vendorsRouter.patch("/vendors/me", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const validation = vendorProfileUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user?.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.vendor!.id, user_id: req.user!.id },
      { ...validation.data, updated_at: new Date() },
      { new: true, runValidators: true }
    );
    if (!vendor) {
      return res.status(404).json({ message: "Vendor profile not found" });
    }

    return res.json({
      id: vendor.id,
      user_id: vendor.user_id,
      name: vendor.name,
      display_name: vendor.display_name,
      address: vendor.address,
      postal_code: vendor.postal_code,
      kyc_status: vendor.kyc_status,
      commission_rate_bps: vendor.commission_rate_bps,
      created_at: vendor.created_at,
      updated_at: vendor.updated_at,
    });
  } catch (error) {
    console.error("Update own vendor profile error:", error);
    return res.status(500).json({ message: "Failed to update vendor profile" });
  }
});

vendorsRouter.get("/vendors/:uuid", async (req, res) => {
  const validation = vendorIdSchema.safeParse(req.params.uuid);
  if (!validation.success) {
    return res.status(400).json({ message: "Invalid vendor id" });
  }

  try {
    const vendor = await Vendor.findById(validation.data);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const user = await User.findById(vendor.user_id);
    if (!user || user.status !== "active") {
      return res.status(404).json({ message: "Vendor not found" });
    }

    return res.json({
      id: vendor.id,
      name: vendor.name,
      display_name: vendor.display_name,
      created_at: vendor.created_at,
    });
  } catch (error) {
    console.error("Get public vendor profile error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor profile" });
  }
});

vendorsRouter.get("/vendors/:uuid/products", async (req, res, next) => {
  if (req.params.uuid === "me") return next();
  const idValidation = vendorIdSchema.safeParse(req.params.uuid);
  const queryValidation = vendorProductsQuerySchema.safeParse(req.query);
  if (!idValidation.success || !queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const vendor = await Vendor.findById(idValidation.data);
    if (!vendor || vendor.kyc_status !== "verified") {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const user = await User.findById(vendor.user_id);
    if (!user || user.status !== "active") {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const { page, limit } = queryValidation.data;
    const filter = { vendor_id: vendor.id, status: "active" as const };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    return res.json({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        average_rating: product.average_rating,
        review_count: product.review_count,
        created_at: product.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get vendor products error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor products" });
  }
});

vendorsRouter.get("/vendors/me/products", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const queryValidation = vendorProductsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const { page, limit } = queryValidation.data;
    const filter = { vendor_id: req.vendor!.id };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    const productIds = products.map((product) => product.id);
    const images = await ProductImage.find({ product_id: { $in: productIds } }).sort({ position: 1, _id: 1 }).lean();
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

    return res.json({
      products: products.map((product) => ({
        id: product.id,
        category_id: product.category_id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        price: product.price,
        stock: product.stock,
        average_rating: product.average_rating,
        review_count: product.review_count,
        status: product.status,
        images: imagesByProduct.get(product.id) ?? [],
        created_at: product.created_at,
        updated_at: product.updated_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get own vendor products error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor products" });
  }
});

vendorsRouter.get("/vendors/me/dashboard", authenticate, requireVendor, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendorId = req.vendor!.id;
    const eligibleOrderIds = await Order.distinct("_id", {
      payment_status: { $in: ["paid", "partially_refunded", "refunded"] },
      status: { $in: ["placed", "completed"] },
    }).then(ids => ids.map(String));
    const [activeProducts, totalOrders, openOrders, settlements] = await Promise.all([
      Product.countDocuments({ vendor_id: vendorId, status: "active" }),
      VendorOrder.countDocuments({ vendor_id: vendorId, order_id: { $in: eligibleOrderIds } }),
      VendorOrder.countDocuments({ vendor_id: vendorId, order_id: { $in: eligibleOrderIds }, status: { $in: ["placed", "packed", "shipped", "in_transit"] } }),
      VendorSettlement.find({ vendor_id: vendorId }).select("gross_paise refund_paise net_paise status"),
    ]);

    const totals = settlements.reduce((result, settlement) => {
      result.grossSales += settlement.gross_paise;
      result.refunds += settlement.refund_paise;
      result.netEarnings += settlement.net_paise;
      if (settlement.status === "pending" || settlement.status === "processing") {
        result.pendingPayout += settlement.net_paise;
      }
      return result;
    }, { grossSales: 0, refunds: 0, netEarnings: 0, pendingPayout: 0 });

    return res.json({
      active_products: activeProducts,
      total_orders: totalOrders,
      open_orders: openOrders,
      gross_sales_paise: totals.grossSales,
      refund_paise: totals.refunds,
      net_earnings_paise: totals.netEarnings,
      pending_payout_paise: totals.pendingPayout,
    });
  } catch (error) {
    console.error("Get vendor dashboard error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor dashboard" });
  }
});

vendorsRouter.get("/vendors/me/orders", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const queryValidation = vendorProductsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const { page, limit } = queryValidation.data;
    const eligibleOrderIds = await Order.distinct("_id", {
      payment_status: { $in: ["paid", "partially_refunded", "refunded"] },
      status: { $in: ["placed", "completed"] },
    }).then(ids => ids.map(String));
    const filter = { vendor_id: req.vendor!.id, order_id: { $in: eligibleOrderIds } };
    const [vendorOrders, total] = await Promise.all([
      VendorOrder.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      VendorOrder.countDocuments(filter),
    ]);
    const orderIds = vendorOrders.map((vendorOrder) => vendorOrder.order_id);
    const items = orderIds.length
      ? await OrderItem.find({ vendor_id: req.vendor!.id, order_id: { $in: orderIds } })
      : [];
    const itemsByOrderId = new Map<string, typeof items>();
    for (const item of items) {
      const orderItems = itemsByOrderId.get(item.order_id) ?? [];
      orderItems.push(item);
      itemsByOrderId.set(item.order_id, orderItems);
    }

    return res.json({
      orders: vendorOrders.map((vendorOrder) => ({
        id: vendorOrder.id,
        order_id: vendorOrder.order_id,
        status: vendorOrder.status,
        items: (itemsByOrderId.get(vendorOrder.order_id) ?? []).map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          unit_price_paise: item.unit_price_paise,
          quantity: item.quantity,
          discount_paise: item.discount_paise,
          line_total_paise: item.line_total_paise,
        })),
        created_at: vendorOrder.created_at,
        updated_at: vendorOrder.updated_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get vendor orders error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor orders" });
  }
});

vendorsRouter.get("/vendors/me/settlements", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const queryValidation = vendorProductsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const { page, limit } = queryValidation.data;
    const filter = { vendor_id: req.vendor!.id };
    const [settlements, total] = await Promise.all([
      VendorSettlement.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      VendorSettlement.countDocuments(filter),
    ]);

    return res.json({
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        vendor_order_id: settlement.vendor_order_id,
        gross_paise: settlement.gross_paise,
        commission_paise: settlement.commission_paise,
        refund_paise: settlement.refund_paise,
        net_paise: settlement.net_paise,
        status: settlement.status,
        created_at: settlement.created_at,
        settled_at: settlement.settled_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get vendor settlements error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor settlements" });
  }
});

export default vendorsRouter;
