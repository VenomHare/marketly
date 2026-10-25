import { Router } from "express";
import { User, Vendor } from "../models";
import { AuthRequest, authenticate, requireAdmin, requireVendor } from "../middleware/auth";
import { vendorApplicationSchema } from "../validators/vendors";

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

// KYC upload and review are placeholders until private R2 document access is implemented.
vendorsRouter.get("/vendors/me/kyc", authenticate, requireVendor, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.post("/vendors/me/kyc", authenticate, requireVendor, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors/:uuid/kyc", authenticate, requireAdmin, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors/:uuid/kyc/documents", authenticate, requireAdmin, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/vendors/me", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/:uuid/products", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/dashboard", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/orders", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/vendors/me/settlements", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.get("/admin/vendors/:uuid", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/admin/vendors/:uuid/verify", authenticate, requireAdmin, async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

vendorsRouter.patch("/admin/vendors/:uuid/status", async (req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default vendorsRouter;
