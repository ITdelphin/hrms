import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../lib/http.js';
import { monthlyTable, tenantStatement } from './rents.service.js';

const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  propertyId: z.string().trim().max(40).optional(),
  tenantId: z.string().trim().max(40).optional(),
});

export const rentsRouter = Router();

rentsRouter.get(
  '/monthly',
  validate({ query: monthQuerySchema }),
  asyncHandler(async (req, res) => {
    const { year, month, propertyId, tenantId } = req.query as unknown as z.infer<typeof monthQuerySchema>;
    res.json(await monthlyTable(year, month, { propertyId, tenantId }));
  }),
);

rentsRouter.get(
  '/tenants/:id/statement',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantStatement(req.params.id!));
  }),
);
