import { Router } from "express";
import { z } from "zod";
import { OrderItem, OrderStatusHistory, Shipment, User, VendorOrder } from "../models";
import { AuthRequest, authenticate, requireVendor } from "../middleware/auth";
import { vendorIdSchema, vendorProductsQuerySchema } from "../validators/vendors";

const vendorOrdersRouter = Router();
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
    const filter = { vendor_id: req.vendor!.id };
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

vendorOrdersRouter.get("/vendor-orders/:uuid", authenticate, requireVendor, async (req: AuthRequest, res) => {
  if (!vendorIdSchema.safeParse(req.params.uuid).success) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  try {
    const user = await User.findById(req.user!.id);
    if (!user || user.status !== "active") {
      return res.status(403).json({ message: "Active vendor account required" });
    }

    const vendorOrder = await VendorOrder.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

    const [items, shipment] = await Promise.all([
      OrderItem.find({ order_id: vendorOrder.order_id, vendor_id: req.vendor!.id }),
      Shipment.findOne({ vendor_order_id: vendorOrder.id }),
    ]);

    return res.json({
      id: vendorOrder.id,
      order_id: vendorOrder.order_id,
      status: vendorOrder.status,
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

    const vendorOrder = await VendorOrder.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
    if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

    const nextStatus = validation.data.status;
    if (!allowedStatusTransitions[vendorOrder.status]?.includes(nextStatus)) {
      return res.status(409).json({ message: "Invalid status transition" });
    }

    const previousStatus = vendorOrder.status;
    vendorOrder.status = nextStatus;
    await vendorOrder.save();
    await OrderStatusHistory.create({
      vendor_order_id: vendorOrder.id,
      previous_status: previousStatus,
      new_status: nextStatus,
      changed_by_user_id: req.user!.id,
    });

    return res.json({ id: vendorOrder.id, status: vendorOrder.status, updated_at: vendorOrder.updated_at });
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
    const vendorOrder = await VendorOrder.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
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
    const vendorOrder = await VendorOrder.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
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
    const vendorOrder = await VendorOrder.findOne({ _id: req.params.uuid, vendor_id: req.vendor!.id });
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
