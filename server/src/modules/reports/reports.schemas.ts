import { z } from 'zod';

export const monthReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  propertyId: z.string().trim().max(40).optional(),
});

export type MonthReportQuery = z.infer<typeof monthReportQuerySchema>;
