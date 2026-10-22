import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 \-()]{6,19}$/, 'Enter a valid phone number');

export const idNumberField = z
  .string()
  .trim()
  .min(3, 'Identification number is too short')
  .max(40, 'Identification number is too long')
  .regex(/^[A-Za-z0-9\-\/]+$/, 'Identification number may contain letters, numbers, - and /');

export const createTenantSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is too short').max(120),
  phone: phoneField,
  idNumber: idNumberField,
  email: z.string().trim().toLowerCase().email('Enter a valid email').nullable().optional(),
  postalAddress: optionalText(160),
  emergencyContact: optionalText(160),
  notes: optionalText(2000),
});

export const updateTenantSchema = createTenantSchema.partial();

export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['ALL', 'HOUSED', 'NOT_HOUSED']).default('ALL'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type ListTenantsInput = z.infer<typeof listTenantsQuerySchema>;
