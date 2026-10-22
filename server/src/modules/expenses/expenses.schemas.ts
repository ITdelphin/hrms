import { z } from 'zod';
import { positiveMoney } from '../properties/properties.schemas.js';

export const EXPENSE_CATEGORIES = [
  'REPAIRS',
  'UTILITIES',
  'TAXES',
  'INSURANCE',
  'MANAGEMENT',
  'SALARIES',
  'OTHER',
] as const;

export const createExpenseSchema = z.object({
  /** No property means the cost is portfolio-wide (insurance, salaries, ...). */
  propertyId: z.string().trim().max(40).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: positiveMoney,
  description: z.string().trim().min(2, 'Description is too short').max(250),
  incurredAt: z.coerce.date().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  'Send at least one field to change',
);

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  propertyId: z.string().trim().max(40).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesQuerySchema>;
