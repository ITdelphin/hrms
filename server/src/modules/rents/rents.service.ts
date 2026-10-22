import type { Prisma } from '@prisma/client';
import { toNum } from '../../lib/decimal.js';
import { notFound } from '../../lib/errors.js';
import { monthLabel } from '../../lib/date.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';

export type MonthlyRow = {
  tenantId: string;
  tenantName: string;
  phone: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string | null;
  leaseId: string;
  rentScheduleId: string | null;
  period: string;
  dueDate: Date | null;
  amount: number;
  amountPaid: number;
  outstanding: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'NOT_BILLED';
  paidAt: Date | null;
  leaseStatus: string;
};

/**
 * One row per tenancy for a billing month, with the checkmark flag the UI and
 * the exported reports both need.
 */
export const monthlyTable = async (year: number, month: number, filters?: { propertyId?: string; tenantId?: string }) => {
  const schedules = await prisma.rentSchedule.findMany({
    where: {
      periodYear: year,
      periodMonth: month,
      ...(filters?.propertyId ? { lease: { propertyId: filters.propertyId } } : {}),
      ...(filters?.tenantId ? { lease: { tenantId: filters.tenantId } } : {}),
    },
    include: {
      lease: {
        include: {
          tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } },
          property: { select: { id: true, name: true, unitNumber: true } },
        },
      },
      payments: { where: { reversed: false }, select: { id: true, amount: true, method: true, paidAt: true, reference: true } },
    },
    orderBy: { lease: { tenant: { fullName: 'asc' } } },
  });

  const rows: MonthlyRow[] = schedules.map((schedule) => {
    const paid = toNum(schedule.amountPaid);
    const amount = toNum(schedule.amount);
    return {
      tenantId: schedule.lease.tenantId,
      tenantName: schedule.lease.tenant.fullName,
      phone: schedule.lease.tenant.phone,
      propertyId: schedule.lease.propertyId,
      propertyName: schedule.lease.property.name,
      unitNumber: schedule.lease.property.unitNumber,
      leaseId: schedule.leaseId,
      rentScheduleId: schedule.id,
      period: `${year}-${String(month).padStart(2, '0')}`,
      dueDate: schedule.dueDate,
      amount,
      amountPaid: paid,
      outstanding: Math.max(0, Math.round((amount - paid) * 100) / 100),
      status: schedule.status,
      paidAt: schedule.paidAt,
      leaseStatus: schedule.lease.status,
    };
  });

  // Tenancies billed for other months but silent for this one still belong on the sheet.
  if (!filters?.tenantId && !filters?.propertyId) {
    const activeLeases = await prisma.lease.findMany({
      where: {
        status: 'ACTIVE',
        ...(filters?.propertyId ? { propertyId: filters.propertyId } : {}),
        startDate: { lte: new Date(Date.UTC(year, month - 1 + 1, 0)) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(Date.UTC(year, month - 1, 1)) } }],
      },
      include: {
        tenant: { select: { id: true, fullName: true, phone: true } },
        property: { select: { id: true, name: true, unitNumber: true } },
        rentItems: { where: { periodYear: year, periodMonth: month } },
      },
    });

    const covered = new Set(rows.map((row) => row.leaseId));
    for (const lease of activeLeases) {
      if (covered.has(lease.id) || lease.rentItems.length > 0) continue;
      rows.push({
        tenantId: lease.tenantId,
        tenantName: lease.tenant.fullName,
        phone: lease.tenant.phone,
        propertyId: lease.propertyId,
        propertyName: lease.property.name,
        unitNumber: lease.property.unitNumber,
        leaseId: lease.id,
        rentScheduleId: null,
        period: `${year}-${String(month).padStart(2, '0')}`,
        dueDate: null,
        amount: toNum(lease.rentAmount),
        amountPaid: 0,
        outstanding: toNum(lease.rentAmount),
        status: 'NOT_BILLED',
        paidAt: null,
        leaseStatus: lease.status,
      });
    }
    rows.sort((a, b) => a.tenantName.localeCompare(b.tenantName));
  }

  const billed = rows.reduce((sum, row) => sum + (row.status === 'NOT_BILLED' ? 0 : row.amount), 0);
  const collected = rows.reduce((sum, row) => sum + row.amountPaid, 0);

  return {
    period: { year, month, label: monthLabel(year, month) },
    summary: {
      tenants: rows.length,
      fullyPaid: rows.filter((row) => row.status === 'PAID').length,
      partial: rows.filter((row) => row.status === 'PARTIAL').length,
      unpaid: rows.filter((row) => row.status === 'UNPAID').length,
      billed: Math.round(billed * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      outstanding: Math.round((billed - collected) * 100) / 100,
    },
    rows: plain(rows),
  };
};

/** Every billed month for one tenant, newest first — drives the tick-table. */
export const tenantStatement = async (tenantId: string) => {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    include: {
      leases: {
        orderBy: { startDate: 'desc' },
        include: {
          property: { select: { id: true, name: true, unitNumber: true, address: true } },
          rentItems: {
            orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
            include: { payments: { where: { reversed: false }, orderBy: { paidAt: 'desc' } } },
          },
        },
      },
    },
  });
  if (!tenant) throw notFound('Tenant');

  const leases = tenant.leases.map((lease) => ({
    id: lease.id,
    status: lease.status,
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentAmount: toNum(lease.rentAmount),
    deposit: toNum(lease.deposit),
    dueDay: lease.dueDay,
    property: lease.property,
    months: lease.rentItems.map((item) => ({
      id: item.id,
      period: `${item.periodYear}-${String(item.periodMonth).padStart(2, '0')}`,
      year: item.periodYear,
      month: item.periodMonth,
      dueDate: item.dueDate,
      amount: toNum(item.amount),
      amountPaid: toNum(item.amountPaid),
      outstanding: Math.max(0, Math.round((toNum(item.amount) - toNum(item.amountPaid)) * 100) / 100),
      status: item.status,
      paid: item.status === 'PAID',
      overdue: item.status !== 'PAID' && item.dueDate < new Date(),
      paidAt: item.paidAt,
      payments: item.payments.map((payment) => ({
        id: payment.id,
        amount: toNum(payment.amount),
        method: payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference,
      })),
    })),
  }));

  const totals = leases.reduce(
    (acc, lease) => {
      for (const month of lease.months) {
        acc.billed += month.amount;
        acc.paid += month.amountPaid;
      }
      return acc;
    },
    { billed: 0, paid: 0 },
  );

  return plain({
    tenant: {
      id: tenant.id,
      fullName: tenant.fullName,
      phone: tenant.phone,
      idNumber: tenant.idNumber,
      email: tenant.email,
      postalAddress: tenant.postalAddress,
    },
    leases,
    totals: {
      billed: Math.round(totals.billed * 100) / 100,
      paid: Math.round(totals.paid * 100) / 100,
      outstanding: Math.round((totals.billed - totals.paid) * 100) / 100,
    },
  });
};

export const unpaidSchedulesWhere = (overdueOnly: boolean): Prisma.RentScheduleWhereInput => ({
  status: { not: 'PAID' },
  ...(overdueOnly ? { dueDate: { lt: new Date() } } : {}),
});
