import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 \-()]{7,20}$/, 'Enter a valid phone number')
    .nullable()
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
