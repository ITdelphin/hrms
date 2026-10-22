import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { validate } from '../../middleware/validate.js';
import { listNotifications, sendTestMessage } from './notifications.service.js';
import { providerStatus } from './registry.js';
import { reminderState, runReminders } from './scheduler.js';

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  event: z.enum(['RENT_REMINDER', 'RENT_OVERDUE', 'PAYMENT_RECEIVED', 'LEASE_CREATED', 'LEASE_EXPIRING']).optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'SKIPPED']).optional(),
});

const testSchema = z.object({ to: z.string().trim().toLowerCase().email() });

notificationsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    res.json(await listNotifications(query));
  }),
);

notificationsRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const [total, sent, failed] = await prisma.$transaction([
      prisma.notification.count(),
      prisma.notification.count({ where: { status: 'SENT' } }),
      prisma.notification.count({ where: { status: 'FAILED' } }),
    ]);
    res.json({
      provider: providerStatus(),
      scheduler: reminderState(),
      stats: { total, sent, failed },
    });
  }),
);

notificationsRouter.post(
  '/test',
  validate({ body: testSchema }),
  asyncHandler(async (req, res) => {
    const { to } = req.body as z.infer<typeof testSchema>;
    const outcome = await sendTestMessage(to);
    res.json({ result: outcome, provider: providerStatus() });
  }),
);

/** Manual trigger for the daily reminder job. */
notificationsRouter.post(
  '/run',
  asyncHandler(async (_req, res) => {
    res.json({ result: await runReminders() });
  }),
);

notificationsRouter.get(
  '/upcoming',
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rows = await prisma.rentSchedule.findMany({
      where: { status: { not: 'PAID' }, dueDate: { gte: today }, lease: { status: 'ACTIVE' } },
      include: { lease: { include: { tenant: { select: { id: true, fullName: true, email: true, phone: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    });
    res.json({
      data: plain(
        rows.map((row) => ({
          rentScheduleId: row.id,
          tenantId: row.lease.tenant.id,
          tenantName: row.lease.tenant.fullName,
          hasEmail: Boolean(row.lease.tenant.email),
          period: `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}`,
          dueDate: row.dueDate,
          amount: Number(row.amount),
          amountPaid: Number(row.amountPaid),
          balance: Math.round((Number(row.amount) - Number(row.amountPaid)) * 100) / 100,
          status: row.status,
        })),
      ),
    });
  }),
);
