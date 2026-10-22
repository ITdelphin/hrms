import { toNum } from '../../lib/decimal.js';
import { addMonths, toUtcDate } from '../../lib/date.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { getCurrency } from '../../lib/settings.js';
import { outstandingByTenant } from '../payments/ledger.js';

const round = (value: number) => Math.round(value * 100) / 100;

export type DashboardQuery = { months?: number };

/** Everything the owner dashboard shows, in one call, for a trailing window of months. */
export const getDashboard = async (months = 6) => {
  const now = new Date();
  const today = toUtcDate(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const windowStart = addMonths(monthStart, -(months - 1));

  const [
    currency,
    propertyGroups,
    tenants,
    currentMonthSchedules,
    monthPayments,
    yearPayments,
    monthExpenses,
    yearExpenses,
    maintenanceGroups,
    openMaintenance,
    overdueSchedules,
  ] = await Promise.all([
    getCurrency(),
    prisma.property.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.rentSchedule.findMany({
      where: { periodYear: today.getUTCFullYear(), periodMonth: today.getUTCMonth() + 1 },
      include: { lease: { include: { tenant: { select: { fullName: true } }, property: { select: { name: true } } } } },
    }),
    prisma.payment.aggregate({ where: { reversed: false, paidAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { reversed: false, paidAt: { gte: yearStart } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { incurredAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { incurredAt: { gte: yearStart } }, _sum: { amount: true } }),
    prisma.maintenanceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.maintenanceRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.rentSchedule.findMany({
      where: { status: { not: 'PAID' }, dueDate: { lt: today }, lease: { status: 'ACTIVE' } },
      include: { lease: { include: { tenant: { select: { id: true, fullName: true, phone: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 100,
    }),
  ]);

  const rentRoll = await prisma.property.aggregate({ where: { deletedAt: null }, _sum: { monthlyRent: true } });

  const statusCount = (status: string) =>
    propertyGroups.find((row) => row.status === status)?._count._all ?? 0;

  const propertiesTotal = propertyGroups.reduce((sum, row) => sum + row._count._all, 0);
  const occupied = statusCount('OCCUPIED');
  const billedThisMonth = currentMonthSchedules.reduce((sum, item) => sum + toNum(item.amount), 0);
  const collectedThisMonth = currentMonthSchedules.reduce((sum, item) => sum + toNum(item.amountPaid), 0);

  const monthly: Array<{ period: string; billed: number; billedPaid: number; received: number; expenses: number }> = [];
  for (let index = 0; index < months; index += 1) {
    const cursor = addMonths(windowStart, index);
    const next = addMonths(cursor, 1);
    const [receivedRow, expenseRow, billedRow] = await Promise.all([
      prisma.payment.aggregate({ where: { reversed: false, paidAt: { gte: cursor, lt: next } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { incurredAt: { gte: cursor, lt: next } }, _sum: { amount: true } }),
      prisma.rentSchedule.aggregate({
        where: { periodYear: cursor.getUTCFullYear(), periodMonth: cursor.getUTCMonth() + 1 },
        _sum: { amount: true, amountPaid: true },
      }),
    ]);
    monthly.push({
      period: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      billed: round(toNum(billedRow._sum.amount)),
      billedPaid: round(toNum(billedRow._sum.amountPaid)),
      received: round(toNum(receivedRow._sum.amount)),
      expenses: round(toNum(expenseRow._sum.amount)),
    });
  }

  const tenantIds = [...new Set(overdueSchedules.map((row) => row.lease.tenant.id))];
  const balances = await outstandingByTenant(prisma, tenantIds);
  const topDebtors = tenantIds
    .map((id) => {
      const schedule = overdueSchedules.find((row) => row.lease.tenant.id === id)!;
      return {
        tenantId: id,
        tenantName: schedule.lease.tenant.fullName,
        phone: schedule.lease.tenant.phone,
        outstanding: balances[id]?.outstanding ?? 0,
        overduePeriods: balances[id]?.overdueCount ?? 0,
        earliestDueDate: schedule.dueDate,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10);

  const collectionRate = billedThisMonth > 0 ? round((collectedThisMonth / billedThisMonth) * 100) : 0;

  const recentPayments = await prisma.payment.findMany({
    where: { reversed: false },
    include: {
      tenant: { select: { fullName: true } },
      lease: { include: { property: { select: { name: true, unitNumber: true } } } },
    },
    orderBy: { paidAt: 'desc' },
    take: 8,
  });

  return plain({
    currency,
    income: {
      collectedThisMonth: round(toNum(monthPayments._sum.amount)),
      collectedThisYear: round(toNum(yearPayments._sum.amount)),
      billedThisMonth: round(billedThisMonth),
      outstandingThisMonth: round(billedThisMonth - collectedThisMonth),
      collectionRate,
      totalOutstanding: round(topDebtors.reduce((sum, row) => sum + row.outstanding, 0)),
    },
    rent: {
      unpaidThisMonth: currentMonthSchedules.filter((item) => item.status !== 'PAID').length,
      overduePeriods: overdueSchedules.length,
      topDebtors,
    },
    expenses: {
      thisMonth: round(toNum(monthExpenses._sum.amount)),
      thisYear: round(toNum(yearExpenses._sum.amount)),
    },
    net: {
      thisMonth: round(toNum(monthPayments._sum.amount) - toNum(monthExpenses._sum.amount)),
      thisYear: round(toNum(yearPayments._sum.amount) - toNum(yearExpenses._sum.amount)),
    },
    occupancy: {
      properties: propertiesTotal,
      occupied,
      available: statusCount('AVAILABLE'),
      maintenance: statusCount('MAINTENANCE'),
      offline: statusCount('OFFLINE'),
      rate: propertiesTotal > 0 ? round((occupied / propertiesTotal) * 100) : 0,
      tenants,
      potentialMonthlyRent: round(toNum(rentRoll._sum.monthlyRent)),
    },
    maintenance: {
      open: openMaintenance,
      byStatus: maintenanceGroups.map((row) => ({ status: row.status, count: row._count._all })),
    },
    monthly,
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      tenantName: payment.tenant.fullName,
      property: `${payment.lease.property.name}${payment.lease.property.unitNumber ? ` #${payment.lease.property.unitNumber}` : ''}`,
      amount: toNum(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
    })),
  });
};
