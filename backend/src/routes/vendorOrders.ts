import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Coupon, CouponRedemption, Order, OrderItem, OrderStatusHistory, Shipment, User, Vendor, VendorOrder, VendorSettlement } from "../models";
import { AuthRequest, authenticate, requireVendor } from "../middleware/auth";
import { vendorIdSchema, vendorProductsQuerySchema } from "../validators/vendors";

const vendorOrdersRouter = Router();
const findPaidVendorOrder = async (orderId: string, vendorId: string) => {
  const vendorOrder = await VendorOrder.findOne({ _id: orderId, vendor_id: vendorId });
  if (!vendorOrder) return null;
  const paidOrder = await Order.exists({
    _id: vendorOrder.order_id,
    payment_status: { $in: ["paid", "partially_refunded", "refunded"] },
    status: { $in: ["placed", "completed"] },
  });
  return paidOrder ? vendorOrder : null;
};
const vendorOrderStatusSchema = z.object({
  status: z.enum(["packed", "shipped", "in_transit", "delivered", "cancelled"]),
}).strict();
const shipmentCreateSchema = z.object({
  carrier: z.string().trim().min(1).max(100).optional(),
  tracking_number: z.string().trim().min(1).max(200),
  tracking_url: z.string().url().max(2048).refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }).optional(),
  shipped_at: z.string().datetime({ offset: true }).optional(),
  delivered_at: z.string().datetime({ offset: true }).optional(),
}).strict();
const shipmentUpdateSchema = shipmentCreateSchema.partial().refine(
  (shipment) => Object.keys(shipment).length > 0,
);
const allowedStatusTransitions: Record<string, string[]> = {
  placed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["in_transit"],
  in_transit: ["delivered"],
  delivered: [],
  cancelled: [],
};

vendorOrdersRouter.get("/vendor-orders", authenticate, requireVendor, async (req: AuthRequest, res) => {
  const queryValidation = vendorProductsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) return res.status(400).json({ message: "Invalid parameters" });

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
    const [items, orders] = await Promise.all([
      OrderItem.find({ vendor_id: req.vendor!.id, order_id: { $in: orderIds } }),
      Order.find({ _id: { $in: orderIds } }).select("payment_status").lean(),
    ]);
    const paymentStatusByOrderId = new Map(orders.map((order) => [order._id.toString(), order.payment_status]));
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
        payment_status: paymentStatusByOrderId.get(vendorOrder.order_id) ?? "paid",
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

vendorOrdersRouter.get("/vendor-orders/:uuid", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendorOrder = await findPaidVendorOrder(req.params.uuid, req.vendor!.id);
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

    const [items, shipment, redemption, order] = await Promise.all([
      OrderItem.find({ order_id: vendorOrder.order_id, vendor_id: req.vendor!.id }),
      Shipment.findOne({ vendor_order_id: vendorOrder.id }),
      CouponRedemption.findOne({ order_id: vendorOrder.order_id }).lean(),
      Order.findById(vendorOrder.order_id).select("payment_status").lean(),
    ]);
    const coupon = redemption ? await Coupon.findById(redemption.coupon_id).select("code").lean() : null;

    return res.json({
      id: vendorOrder.id,
      order_id: vendorOrder.order_id,
      status: vendorOrder.status,
      payment_status: order?.payment_status ?? "paid",
      coupon: redemption ? { code: coupon?.code ?? null, discount_paise: items.reduce((sum, item) => sum + item.discount_paise, 0) } : null,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        unit_price_paise: item.unit_price_paise,
        quantity: item.quantity,
        discount_paise: item.discount_paise,
        line_total_paise: item.line_total_paise,
      })),
      shipment: shipment ? {
        id: shipment.id,
        carrier: shipment.carrier,
        tracking_number: shipment.tracking_number,
        tracking_url: shipment.tracking_url,
        shipped_at: shipment.shipped_at,
        delivered_at: shipment.delivered_at,
      } : null,
      created_at: vendorOrder.created_at,
      updated_at: vendorOrder.updated_at,
    });
  } catch (error) {
    console.error("Get vendor order error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor order" });
  }
});

vendorOrdersRouter.patch("/vendor-orders/:uuid/status", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }
  const validation = vendorOrderStatusSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendorOrder = await findPaidVendorOrder(req.params.uuid, req.vendor!.id);
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

    const nextStatus = validation.data.status;
    if (!allowedStatusTransitions[vendorOrder.status]?.includes(nextStatus)) {
      return res.status(409).json({ message: "Invalid status transition" });
    }

    const previousStatus = vendorOrder.status;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await VendorOrder.findOneAndUpdate(
          { _id: vendorOrder.id, vendor_id: req.vendor!.id, status: previousStatus },
          { $set: { status: nextStatus, updated_at: new Date() } },
          { new: true, session },
        );
        if (!changed) throw Object.assign(new Error("Order status changed during update"), { statusConflict: true });
        await OrderStatusHistory.create([{
          vendor_order_id: changed.id,
          previous_status: previousStatus,
          new_status: nextStatus,
          changed_by_user_id: req.user!.id,
        }], { session });

        if (nextStatus === "delivered") {
          const [items, vendor] = await Promise.all([
            OrderItem.find({ order_id: changed.order_id, vendor_id: changed.vendor_id }).session(session).lean(),
            Vendor.findById(changed.vendor_id).select("commission_rate_bps").session(session).lean(),
          ]);
          if (!vendor || items.length === 0) throw new Error("Cannot create settlement without vendor order items");
          const grossPaise = items.reduce((sum, item) => sum + item.line_total_paise, 0);
          const commissionPaise = Math.floor(grossPaise * vendor.commission_rate_bps / 10_000);
          await VendorSettlement.updateOne(
            { vendor_order_id: changed.id },
            { $setOnInsert: {
              vendor_order_id: changed.id,
              vendor_id: changed.vendor_id,
              gross_paise: grossPaise,
              commission_paise: commissionPaise,
              refund_paise: 0,
              net_paise: grossPaise - commissionPaise,
              status: "pending",
            } },
            { upsert: true, session },
          );
        }
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusConflict" in error) return res.status(409).json({ message: "Order status changed during update" });
      throw error;
    } finally {
      await session.endSession();
    }
    const updatedOrder = await VendorOrder.findById(vendorOrder.id).select("status updated_at").lean();
    return res.json({ id: vendorOrder.id, status: updatedOrder!.status, updated_at: updatedOrder!.updated_at });
  } catch (error) {
    console.error("Update vendor order status error:", error);
    return res.status(500).json({ message: "Failed to update vendor order status" });
  }
});

vendorOrdersRouter.post("/vendor-orders/:uuid/shipment", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }
  const validation = shipmentCreateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }
    const vendorOrder = await findPaidVendorOrder(req.params.uuid, req.vendor!.id);
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });
    if (await Shipment.exists({ vendor_order_id: vendorOrder.id })) {
      return res.status(409).json({ message: "Shipment already exists" });
    }

    const shipment = await Shipment.create({
      vendor_order_id: vendorOrder.id,
      ...validation.data,
      ...(validation.data.shipped_at ? { shipped_at: new Date(validation.data.shipped_at) } : {}),
      ...(validation.data.delivered_at ? { delivered_at: new Date(validation.data.delivered_at) } : {}),
    });
    return res.status(201).json({
      shipment: {
        id: shipment.id,
        carrier: shipment.carrier,
        tracking_number: shipment.tracking_number,
        tracking_url: shipment.tracking_url,
        shipped_at: shipment.shipped_at,
        delivered_at: shipment.delivered_at,
      },
    });
  } catch (error) {
    console.error("Create vendor order shipment error:", error);
    return res.status(500).json({ message: "Failed to create shipment" });
  }
});

vendorOrdersRouter.patch("/vendor-orders/:uuid/shipment", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }
  const validation = shipmentUpdateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }
    const vendorOrder = await findPaidVendorOrder(req.params.uuid, req.vendor!.id);
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });
    const shipment = await Shipment.findOne({ vendor_order_id: vendorOrder.id });
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });

    Object.assign(shipment, validation.data, {
      ...(validation.data.shipped_at ? { shipped_at: new Date(validation.data.shipped_at) } : {}),
      ...(validation.data.delivered_at ? { delivered_at: new Date(validation.data.delivered_at) } : {}),
    });
    await shipment.save();
    return res.json({
      shipment: {
        id: shipment.id,
        carrier: shipment.carrier,
        tracking_number: shipment.tracking_number,
        tracking_url: shipment.tracking_url,
        shipped_at: shipment.shipped_at,
        delivered_at: shipment.delivered_at,
      },
    });
  } catch (error) {
    console.error("Update vendor order shipment error:", error);
    return res.status(500).json({ message: "Failed to update shipment" });
  }
});

vendorOrdersRouter.get("/vendor-orders/:uuid/history", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }
    const vendorOrder = await findPaidVendorOrder(req.params.uuid, req.vendor!.id);
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

    const history = await OrderStatusHistory.find({ vendor_order_id: vendorOrder.id })
      .sort({ created_at: 1, _id: 1 });
    return res.json({
      history: history.map((event) => ({
        id: event.id,
        previous_status: event.previous_status ?? null,
        new_status: event.new_status,
        created_at: event.created_at,
      })),
    });
  } catch (error) {
    console.error("Get vendor order history error:", error);
    return res.status(500).json({ message: "Failed to fetch vendor order history" });
  }
});

export default vendorOrdersRouter;
