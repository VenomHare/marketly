import { z } from "zod";

export const vendorApplicationSchema = z.object({
  name: z.string().trim().min(1),
  display_name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  postal_code: z.string().trim().min(1),
}).strict();

export const vendorKycSubmissionSchema = z.object({
  address_proof_key: z.string().trim().min(1),
  identity_proof_key: z.string().trim().min(1),
}).strict();

export const vendorKycDecisionSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  rejection_reason: z.string().trim().min(1).optional(),
}).strict().refine(
  (decision) => decision.status !== "rejected" || Boolean(decision.rejection_reason),
  { message: "A rejection reason is required when rejecting KYC" }
);
