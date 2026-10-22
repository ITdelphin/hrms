import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { decimal, toNum } from '../../lib/decimal.js';
import { toUtcDate } from '../../lib/date.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { notifyPaymentReceived } from '../notifications/notifications.service.js';
import { MONEY_EPSILON, outstandingOf, recalculateSchedule } from './ledger.js';
import type { ListPaymentsInput, RecordPaymentInput } from './payments.schemas.js';

const paymentInclude = {
  rentSchedule: {
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      amount: true,
      amountPaid: true,
      status: true,
      dueDate: true,
    },
  },
  tenant: { select: { id: true, fullName: true, phone: true } },
  lease: { include: { property: { select: { id: true, name: true, unitNumber: true } } } },
} as const;

export const recordPayment = async (ownerId: string, input: RecordPaymentInput, req?: Request) => {
  const paidAt = toUtcDate(input.paidAt ?? new Date());
  if (paidAt.getTime() > Date.now() + 86_400_000) {
    throw badRequest('Payment date cannot be in the future');
  }

  const schedule = await prisma.rentSchedule.findUnique({
    where: { id: input.rentScheduleId },
    include: { lease: { include: { tenant: true, property: true } } },
  });
  if (!schedule) throw notFound('Rent schedule');
  if (schedule.status === 'PAID') {
    throw conflict(
      `${schedule.lease.tenant.fullName} has already paid ${schedule.periodYear}-${String(schedule.periodMonth).padStart(2, '0')} in full`,
    );
  }

  const outstanding = outstandingOf(schedule);
  if (input.amount > outstanding + MONEY_EPSILON) {
    throw badRequest(
      `Payment of ${input.amount} exceeds the outstanding balance of ${outstanding} for this month`,
    );
  }

  const { payment, recalculated } = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        rentScheduleId: schedule.id,
        leaseId: schedule.leaseId,
        tenantId: schedule.lease.tenantId,
        amount: decimal(input.amount),
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        paidAt,
        recordedById: ownerId,
      },
    });
    const status = await recalculateSchedule(tx, schedule.id);
    return { payment: created, recalculated: status };
  });

  await recordAudit({
    ownerId,
    action: 'payment.record',
    entityType: 'payment',
    entityId: payment.id,
    summary: `${input.method} ${input.amount} for ${schedule.lease.tenant.fullName} (${schedule.periodYear}-${String(schedule.periodMonth).padStart(2, '0')}) → ${recalculated.status}`,
    after: plain({ ...payment, scheduleStatus: recalculated.status }),
    req,
  });

  await notifyPaymentReceived({
    ownerId,
    tenant: { id: schedule.lease.tenantId, name: schedule.lease.tenant.fullName, phone: schedule.lease.tenant.phone },
    propertyName: `${schedule.lease.property.name}${schedule.lease.property.unitNumber ? ` #${schedule.lease.property.unitNumber}` : ''}`,
    period: { year: schedule.periodYear, month: schedule.periodMonth },
    amount: toNum(payment.amount),
    method: payment.method,
    balance: recalculated.status === 'PAID' ? 0 : outstanding - toNum(payment.amount),
    paidAt,
  });

  return {
    payment: plain({ ...payment, amount: toNum(payment.amount) }),
    schedule: { id: schedule.id, ...recalculated, outstanding: Math.max(0, outstanding - toNum(payment.amount)) },
  };
};

export const listPayments = async (input: ListPaymentsInput) => {
  const paidAt: Prisma.DateTimeFilter = {};
  if (input.from) paidAt.gte = toUtcDate(input.from);
  if (input.to) paidAt.lte = toUtcDate(input.to);

  const where: Prisma.PaymentWhereInput = {
    ...(Object.keys(paidAt).length > 0 ? { paidAt } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.leaseId ? { leaseId: input.leaseId } : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(input.includeReversed ? {} : { reversed: false }),
  };
  if (input.propertyId) where.lease = { propertyId: input.propertyId };

  const [total, rows, grouped] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { paidAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where,
      orderBy: { method: 'asc' },
      _sum: { amount: true },
    }),
  ]);

  return {
    data: plain(
      rows.map((payment) => ({
        ...payment,
        amount: toNum(payment.amount),
        propertyName: payment.lease?.property?.name ?? null,
      })),
    ),
    meta: pageMeta(total, input.page, input.pageSize),
    totals: {
      collected: Math.round(rows.reduce((sum, payment) => sum + toNum(payment.amount), 0) * 100) / 100,
      byMethod: grouped.map((row) => ({ method: row.method, total: toNum(row._sum?.amount) })),
    },
  };
};

export const reversePayment = async (ownerId: string, id: string, reason: string, req?: Request) => {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { rentSchedule: { include: { lease: { include: { tenant: true } } } } },
  });
  if (!payment) throw notFound('Payment');
  if (payment.reversed) throw conflict('Payment is already reversed');

  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: { reversed: true, note: `${payment.note ? `${payment.note} — ` : ''}reversed: ${reason}` },
    });
    return recalculateSchedule(tx, payment.rentScheduleId);
  });

  await recordAudit({
    ownerId,
    action: 'payment.reverse',
    entityType: 'payment',
    entityId: id,
    summary: `Reversed ${toNum(payment.amount)} for ${payment.rentSchedule.lease.tenant.fullName}: ${reason}`,
    before: plain(payment),
    after: plain(result),
    req,
  });

  return { payment: plain({ id, reversed: true }), schedule: result };
};
