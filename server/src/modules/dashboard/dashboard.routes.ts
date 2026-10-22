import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { getDashboard } from './dashboard.service.js';

const querySchema = z.object({
  months: z.coerce.number().int().min(3).max(18).default(6),
});

export const dashboardRouter = Router();

dashboardRouter.get(
  '/summary',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as z.infer<typeof querySchema>;
    res.json(await getDashboard(months));
  }),
);
