import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(1),
  role: z.enum(["customer", "vendor"]).optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
