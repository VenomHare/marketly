import { Router } from "express";
import { User } from "../models";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth";
import { updateUserStatusSchema } from "../validators/auth";

const adminRouter = Router();

adminRouter.get("/admin/users", authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const users = await User.find().sort({ created_at: -1 });
    return res.json(users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    })));
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

adminRouter.get("/admin/users/:uuid", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.params.uuid);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ message: "Failed to fetch user" });
  }
});

adminRouter.patch("/admin/users/:uuid/status", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const validation = updateUserStatusSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ message: "Invalid parameters" });

    const user = await User.findByIdAndUpdate(
      req.params.uuid,
      { status: validation.data.status, updated_at: new Date() },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({ message: "Failed to update user status" });
  }
});

adminRouter.get("/admin/vendors/:uuid/kyc", authenticate, requireAdmin, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/vendors/:uuid/kyc/documents", authenticate, requireAdmin, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/vendors", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/vendors/:uuid", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.patch("/admin/vendors/:uuid/verify", authenticate, requireAdmin, async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.patch("/admin/vendors/:uuid/status", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.post("/admin/categories", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.patch("/admin/categories/:uuid", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.delete("/admin/categories/:uuid", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.post("/admin/coupons", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.patch("/admin/coupons/:uuid", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.delete("/admin/coupons/:uuid", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.get("/admin/orders", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.patch("/admin/orders/:uuid/status", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.get("/admin/settlements", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.post("/admin/settlements/:uuid/retry", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.patch("/admin/reviews/:uuid/moderation", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.get("/admin/analytics/overview", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/sales", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/products", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/vendors", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/customers", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/payments", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/analytics/commissions", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

adminRouter.post("/admin/search/reindex", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});
adminRouter.get("/admin/search/index-status", async (_req, res) => {
  res.status(500).json({ message: "Route not implemented" });
});

export default adminRouter;
