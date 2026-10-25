import { z } from "zod";

export const vendorIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const vendorProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const vendorApplicationSchema = z.object({
  name: z.string().trim().min(1),
  display_name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  postal_code: z.string().trim().min(1),
}).strict();

export const vendorProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  display_name: z.string().trim().min(1).optional(),
}).strict().refine(
  (profile) => Object.keys(profile).length > 0,
  { message: "At least one profile field must be provided" }
);

const r2ObjectKeySchema = z.string().trim().min(1).max(1024).refine(
  (key) => !key.startsWith("/") && !key.includes("\\") &&
    key.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
);

export const vendorKycSubmissionSchema = z.object({
  address_proof_key: r2ObjectKeySchema,
  identity_proof_key: r2ObjectKeySchema,
}).strict().refine(
  (submission) => submission.address_proof_key !== submission.identity_proof_key,
  { message: "Address proof and identity proof must be different files" }
);

export const vendorKycDecisionSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  rejection_reason: z.string().trim().min(1).optional(),
}).strict().refine(
  (decision) => decision.status !== "rejected" || Boolean(decision.rejection_reason),
  { message: "A rejection reason is required when rejecting KYC" }
);
