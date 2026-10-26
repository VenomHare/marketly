import { z } from "zod";

const contentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const uploadIdSchema = z.string().uuid();

export const presignedUploadSchema = z.union([
  z.discriminatedUnion("purpose", [
    z.object({
      purpose: z.literal("kyc"),
      content_type: contentTypeSchema,
    }).strict(),
    z.object({
      purpose: z.literal("product"),
      product_id: objectIdSchema,
      content_type: contentTypeSchema,
    }).strict(),
  ]),
  z.object({ upload_id: uploadIdSchema }).strict(),
]);

export const uploadConfirmationSchema = z.object({
  upload_id: uploadIdSchema,
}).strict();
