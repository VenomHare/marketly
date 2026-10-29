import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Create a password.'),
})

export type LoginFields = z.infer<typeof loginSchema>
export type RegisterFields = z.infer<typeof registerSchema>
