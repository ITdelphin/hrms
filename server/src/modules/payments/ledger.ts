import type { Prisma, PrismaClient } from '@prisma/client';
import type { RentStatus } from '@prisma/client';
import { toNum } from '../../lib/decimal.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const MONEY_EPSILON = 0.005;

export const outstandingOf = (schedule: { amount: Prisma.Decimal | number; amountPaid: Prisma.Decimal | number }): number =>
  Math.max(0, Math.round((toNum(schedule.amount) - toNum(schedule.amountPaid)) * 100) / 100);

export const isPaid = (schedule: { status: string }): boolean => schedule.status === 'PAID';

/**
 * Status is always recomputed from the paid total rather than trusted from the
 * caller, so partial payments, corrections and reversals cannot drift.
 */
export const statusFor = (amount: number, amountPaid: number): RentStatus => {
  if (amountPaid + MONEY_EPSILON >= amount) return 'PAID';
  if (amountPaid > MONEY_EPSILON) return 'PARTIAL';
  return 'UNPAID';
};

export const recalculateSchedule = async (
  db: Db,
  rentScheduleId: string,
): Promise<{ amountPaid: number; status: RentStatus; paidAt: Date | null }> => {
  const schedule = await db.rentSchedule.findUniqueOrThrow({ where: { id: rentScheduleId } });
  const payments = await db.payment.findMany({
    where: { rentScheduleId, reversed: false },
    select: { amount: true, paidAt: true },
  });

  const totalPaid = payments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const amountPaid = Math.round(totalPaid * 100) / 100;
  const status = statusFor(toNum(schedule.amount), amountPaid);
  const paidAt =
    status === 'PAID' && payments.length > 0
      ? payments.reduce<Date>((latest, payment) => (payment.paidAt > latest ? payment.paidAt : latest), payments[0]!.paidAt)
      : null;

  const updated = await db.rentSchedule.update({
    where: { id: rentScheduleId },
    data: { amountPaid, status, paidAt },
  });

  return { amountPaid: toNum(updated.amountPaid), status: updated.status, paidAt: updated.paidAt };
};

/** Aggregate outstanding rent for tenants, used by listings and the dashboard. */
export const outstandingByTenant = async (
  db: Db,
  tenantIds: string[],
): Promise<Record<string, { billed: number; paid: number; outstanding: number; overdueCount: number }>> => {
  if (tenantIds.length === 0) return {};

  const rows = await db.rentSchedule.groupBy({
    by: ['leaseId'],
    where: { lease: { tenantId: { in: tenantIds } } },
    _sum: { amount: true, amountPaid: true },
    _count: { _all: true },
  });

  const leases = await db.lease.findMany({
    where: { id: { in: rows.map((row) => row.leaseId) } },
    select: { id: true, tenantId: true },
  });
  const leaseToTenant = new Map(leases.map((lease) => [lease.id, lease.tenantId]));

  const overdue = await db.rentSchedule.groupBy({
    by: ['leaseId'],
    where: {
      lease: { tenantId: { in: tenantIds } },
      status: { not: 'PAID' },
      dueDate: { lt: new Date() },
    },
    _count: { _all: true },
  });

  const out: Record<string, { billed: number; paid: number; outstanding: number; overdueCount: number }> = {};
  for (const tenantId of tenantIds) {
    out[tenantId] = { billed: 0, paid: 0, outstanding: 0, overdueCount: 0 };
  }
  for (const row of rows) {
    const tenantId = leaseToTenant.get(row.leaseId);
    if (!tenantId) continue;
    const bucket = out[tenantId]!;
    bucket.billed = Math.round((bucket.billed + toNum(row._sum.amount)) * 100) / 100;
    bucket.paid = Math.round((bucket.paid + toNum(row._sum.amountPaid)) * 100) / 100;
    bucket.outstanding = Math.round((bucket.billed - bucket.paid) * 100) / 100;
  }
  for (const row of overdue) {
    const tenantId = leaseToTenant.get(row.leaseId);
    if (tenantId) out[tenantId]!.overdueCount = row._count._all;
  }
  return out;
};
