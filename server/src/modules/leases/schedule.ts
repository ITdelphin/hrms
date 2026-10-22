import type { Prisma, PrismaClient } from '@prisma/client';
import { decimal } from '../../lib/decimal.js';
import { addMonths, dueDateFor, monthRange, toUtcDate, type YearMonth } from '../../lib/date.js';

type Db = PrismaClient | Prisma.TransactionClient;

type LeaseLike = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  dueDay: number;
  rentAmount: Prisma.Decimal | number;
};

/**
 * Periods a lease is billed for: from the start month up to the lease end, or
 * `months` ahead for open-ended leases. Never looks past today's horizon by
 * more than the requested window.
 */
export const periodsFor = (lease: LeaseLike, months: number): YearMonth[] => {
  const start = toUtcDate(lease.startDate);
  const horizon = addMonths(start, months - 1);
  const end = lease.endDate ? toUtcDate(lease.endDate) : horizon;
  const capped = end.getTime() < horizon.getTime() ? end : horizon;
  if (capped.getTime() < start.getTime()) return [];
  return monthRange(start, capped);
};

/** Idempotent: only months that are not already billed get inserted. */
export const generateRentSchedule = async (
  db: Db,
  lease: LeaseLike,
  months: number,
): Promise<{ created: number; total: number }> => {
  const existing = await db.rentSchedule.findMany({
    where: { leaseId: lease.id },
    select: { periodYear: true, periodMonth: true },
  });
  const taken = new Set(existing.map((row) => `${row.periodYear}-${row.periodMonth}`));

  const missing = periodsFor(lease, months).filter(
    (period) => !taken.has(`${period.year}-${period.month}`),
  );

  if (missing.length > 0) {
    await db.rentSchedule.createMany({
      data: missing.map((period) => ({
        leaseId: lease.id,
        periodYear: period.year,
        periodMonth: period.month,
        dueDate: dueDateFor(period.year, period.month, lease.dueDay),
        amount: decimal(Number(lease.rentAmount)),
      })),
      skipDuplicates: true,
    });
  }

  const total = await db.rentSchedule.count({ where: { leaseId: lease.id } });
  return { created: missing.length, total };
};
