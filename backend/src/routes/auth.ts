import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Vendor } from "../models";
import { authenticate, requireAdmin, requireVendor, AuthRequest } from "../middleware/auth";
import { Router } from "express";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateUserSchema,
  updatePasswordSchema,
  updateUserStatusSchema,
} from "../validators/auth";

const authRouter = Router();

const JWT_EXPIRES_IN = "7d";
const REFRESH_TOKEN_EXPIRES_IN = "30d";

authRouter.post("/auth/register", async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters"
      });
    }
    const { name, email, password } = validation.data;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password_hash,
      role: "customer",
      status: "active",
    });
    const JWT_SECRET = process.env.JWT_SECRET!;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

authRouter.post("/auth/login", async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters",
      });
    }
    const { email, password } = validation.data;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const JWT_SECRET = process.env.JWT_SECRET!;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      token,
      refreshToken,
    });
  } catch (error) { 
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

authRouter.post("/auth/refresh", async (req, res) => {
  try {
    const validation = refreshTokenSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters",
      });
    }
    const { refreshToken } = validation.data;
    const JWT_SECRET = process.env.JWT_SECRET!;
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
      id: string;
      email: string;
      role: "customer" | "vendor" | "admin";
    };

    const user = await User.findById(decoded.id);
    console.log(user);
    if (!user || user.status === "suspended") {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
});

authRouter.post("/auth/logout", async (req, res) => {
  res.json({ message: "Logged out successfully" });
});

authRouter.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const baseResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    // Switch based on role
    if (user.role === "vendor") {
      const vendor = await Vendor.findOne({ user_id: user.id });
      if (vendor) {
        return res.json({
          ...baseResponse,
          vendor: {
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
          },
        });
      }
    }

    if (user.role === "admin") {
      return res.json({
        ...baseResponse,
        admin: {
          permissions: ["manage_users", "manage_vendors", "manage_products", "view_analytics"],
        },
      });
    }

    // Default response for customer
    res.json(baseResponse);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

authRouter.patch("/users/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters"
      });
    }
    const { name } = validation.data;

    const user = await User.findByIdAndUpdate(
      req.user?.id,
      { name, updated_at: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

authRouter.patch("/users/me/password", authenticate, async (req: AuthRequest, res) => {
  try {
    const validation = updatePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters"
      });
    }
    const { currentPassword, newPassword } = validation.data;

    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(req.user?.id, {
      password_hash,
      updated_at: new Date(),
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password update error:", error);
    res.status(500).json({ message: "Failed to update password" });
  }
});

authRouter.get("/users/me/orders", authenticate, async (req: AuthRequest, res) => {
  res.json({ message: "Route not implemented yet" });
});

authRouter.get("/admin/users", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await User.find().sort({ created_at: -1 });

    res.json(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at,
      }))
    );
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

authRouter.get("/admin/users/:uuid", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.params.uuid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
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
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

authRouter.patch("/admin/users/:uuid/status", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const validation = updateUserStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid parameters"
      });
    }
    const { status } = validation.data;

    const user = await User.findByIdAndUpdate(
      req.params.uuid,
      { status, updated_at: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({ message: "Failed to update user status" });
  }
});

export default authRouter;
