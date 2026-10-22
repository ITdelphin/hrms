import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { auditStatsQuerySchema, listAuditQuerySchema } from './audit.schemas.js';
import { getAuditStats, listAuditLog } from './audit.service.js';
import type { AuditStatsInput, ListAuditInput } from './audit.schemas.js';

export const auditRouter = Router();

/** Audit rows are written by lib/audit.ts; this router only ever reads them. */
auditRouter.get(
  '/',
  validate({ query: listAuditQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listAuditLog(req.query as unknown as ListAuditInput));
  }),
);

auditRouter.get(
  '/stats',
  validate({ query: auditStatsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await getAuditStats(req.query as unknown as AuditStatsInput));
  }),
);
