import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { requireCronSecret } from '../../middleware/cron.js';
import { runReminders } from './scheduler.js';

export const cronRouter = Router();

cronRouter.use(requireCronSecret);

/** Vercel Cron target. GET because scheduled invocations issue GET requests. */
cronRouter.get(
  '/reminders',
  asyncHandler(async (_req, res) => {
    res.json({ result: await runReminders() });
  }),
);
