import { z } from 'zod'

export const vendorApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Enter your legal or registered business name.'),
  display_name: z.string().trim().min(1, 'Enter the name customers will see.'),
  address: z.string().trim().min(1, 'Enter your business address.'),
  postal_code: z.string().trim().min(1, 'Enter your postal code.'),
  bank_account_holder: z.string().trim().min(2, 'Enter the name on the bank account.'),
  bank_account_number: z.string().regex(/^\d{8,18}$/, 'Enter an account number with 8 to 18 digits.'),
  bank_ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code.'),
  bank_name: z.string().trim().min(2, 'Enter the bank name.'),
  bank_account_type: z.enum(['savings', 'current']),
})

export type VendorApplicationFields = z.infer<typeof vendorApplicationSchema>
