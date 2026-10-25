import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Vendor } from "../models";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: "customer" | "vendor" | "admin";
  };
  vendor?: {
    id: string;
    user_id: string;
    name: string;
    display_name: string;
    kyc_status: "pending" | "verified" | "rejected";
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: "customer" | "vendor" | "admin";
    };

    // Validate required fields
    if (!decoded.id || !decoded.email || !decoded.role) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

export const requireVendor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Vendor access required" });
  }

  const vendor = await Vendor.findOne({ user_id: req.user.id });
  if (!vendor) {
    return res.status(403).json({ message: "Vendor profile not found" });
  }

  req.vendor = {
    id: vendor.id,
    user_id: vendor.user_id,
    name: vendor.name,
    display_name: vendor.display_name,
    kyc_status: vendor.kyc_status,
  };

  next();
};

export const requireVerifiedVendor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Vendor access required" });
  }

  const vendor = await Vendor.findOne({ user_id: req.user.id });
  if (!vendor) {
    return res.status(403).json({ message: "Vendor profile not found" });
  }

  if (vendor.kyc_status !== "verified") {
    return res.status(403).json({ message: "Vendor must be verified to access this resource" });
  }

  req.vendor = {
    id: vendor.id,
    user_id: vendor.user_id,
    name: vendor.name,
    display_name: vendor.display_name,
    kyc_status: vendor.kyc_status,
  };

  next();
};
