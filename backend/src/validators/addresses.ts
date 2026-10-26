import { z } from "zod";

const addressText = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed");

export const addressCreateSchema = z.object({
  label: addressText(50),
  first_line: addressText(200),
  second_line: addressText(200).optional(),
  postal_code: addressText(32),
  city: addressText(100),
  state: addressText(100),
  country: addressText(100),
  addressee_name: addressText(100),
  contact_number: addressText(32),
}).strict();

export const addressUpdateSchema = addressCreateSchema.partial().strict().refine(
  (address) => Object.keys(address).length > 0,
  "At least one address field must be provided"
);
