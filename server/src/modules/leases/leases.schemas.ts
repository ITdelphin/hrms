import { z } from 'zod';
import { positiveMoney, moneyField } from '../properties/properties.schemas.js';

export const LEASE_STATUSES = ['ACTIVE', 'ENDED', 'TERMINATED'] as const;

export const createLeaseSchema = z.object({
  propertyId: z.string().min(1).max(40),
  tenantId: z.string().min(1).max(40),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  rentAmount: positiveMoney,
  deposit: moneyField.default(0),
  dueDay: z.coerce.number().int().min(1).max(28).default(5),
  autoGenerateSchedule: z.boolean().default(true),
  scheduleMonths: z.coerce.number().int().min(1).max(60).default(12),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateLeaseSchema = z
  .object({
    rentAmount: positiveMoney.optional(),
    dueDay: z.coerce.number().int().min(1).max(28).optional(),
    endDate: z.coerce.date().nullable().optional(),
    deposit: moneyField.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    autoGenerateSchedule: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const endLeaseSchema = z.object({
  endDate: z.coerce.date().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const extendSchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});

export const listLeasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LEASE_STATUSES).optional(),
  tenantId: z.string().min(1).max(40).optional(),
  propertyId: z.string().min(1).max(40).optional(),
});

export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;
export type ListLeasesInput = z.infer<typeof listLeasesQuerySchema>;
