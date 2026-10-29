import { z } from 'zod'

export const vendorApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Enter your legal or registered business name.'),
  display_name: z.string().trim().min(1, 'Enter the name customers will see.'),
  address: z.string().trim().min(1, 'Enter your business address.'),
  postal_code: z.string().trim().min(1, 'Enter your postal code.'),
})

export type VendorApplicationFields = z.infer<typeof vendorApplicationSchema>
