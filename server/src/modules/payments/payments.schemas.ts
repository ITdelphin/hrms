import { z } from 'zod';
import { positiveMoney } from '../properties/properties.schemas.js';

export const PAYMENT_METHODS = ['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_APP', 'OTHER'] as const;

export const recordPaymentSchema = z.object({
  rentScheduleId: z.string().min(1).max(40),
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  paidAt: z.coerce.date().optional(),
});

/** Query strings are text, so "false" must not coerce to true. */
const queryBoolean = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true');

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tenantId: z.string().trim().max(40).optional(),
  propertyId: z.string().trim().max(40).optional(),
  leaseId: z.string().trim().max(40).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  includeReversed: queryBoolean(false),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type ListPaymentsInput = z.infer<typeof listPaymentsQuerySchema>;
