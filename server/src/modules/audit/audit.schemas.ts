import { z } from 'zod';

export const AUDIT_STATS_DAYS = 30;

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  entityType: z.string().trim().min(1).max(40).optional(),
  entityId: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  ownerId: z.string().trim().min(1).max(40).optional(),
});

export const auditStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(AUDIT_STATS_DAYS),
});

export type ListAuditInput = z.infer<typeof listAuditQuerySchema>;
export type AuditStatsInput = z.infer<typeof auditStatsQuerySchema>;
