import { z } from 'zod';

export const PROPERTY_TYPES = ['HOUSE', 'APARTMENT', 'BEDSITTER', 'STUDIO', 'SHOP', 'OFFICE'] as const;
export const PROPERTY_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'OFFLINE'] as const;
/** OCCUPIED is derived from active leases, so it is not accepted from the client. */
export const MANUAL_PROPERTY_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'OFFLINE'] as const;

export const moneyField = z.coerce
  .number({ message: 'Amount must be a number' })
  .finite()
  .min(0, 'Amount cannot be negative')
  .max(99_999_999, 'Amount is too large')
  .transform((value) => Math.round(value * 100) / 100);

export const positiveMoney = moneyField.refine((value) => value > 0, 'Amount must be greater than 0');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional();

export const createPropertySchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  address: z.string().trim().min(3, 'Address is required').max(250),
  unitNumber: optionalText(30),
  type: z.enum(PROPERTY_TYPES).default('HOUSE'),
  bedrooms: z.coerce.number().int().min(0).max(30).nullable().optional(),
  bathrooms: z.coerce.number().int().min(0).max(30).nullable().optional(),
  monthlyRent: positiveMoney,
  deposit: moneyField.default(0),
  status: z.enum(MANUAL_PROPERTY_STATUSES).default('AVAILABLE'),
  notes: optionalText(2000),
});

export const updatePropertySchema = createPropertySchema.partial();

export const listPropertiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  status: z.enum(PROPERTY_STATUSES).optional(),
  type: z.enum(PROPERTY_TYPES).optional(),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type ListPropertiesInput = z.infer<typeof listPropertiesQuerySchema>;
