import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { decimal, toNum } from '../../lib/decimal.js';
import { dueDateFor, toUtcDate } from '../../lib/date.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { syncPropertyStatus } from '../properties/properties.service.js';
import { generateRentSchedule } from './schedule.js';
import type { CreateLeaseInput, ListLeasesInput, UpdateLeaseInput } from './leases.schemas.js';

const leaseInclude = {
  property: { select: { id: true, name: true, unitNumber: true, address: true, status: true } },
  tenant: { select: { id: true, fullName: true, phone: true, idNumber: true, email: true } },
} as const;

const assertUsable = async (propertyId: string, tenantId: string, tx: Prisma.TransactionClient) => {
  const [property, tenant] = await Promise.all([
    tx.property.findFirst({ where: { id: propertyId, deletedAt: null } }),
    tx.tenant.findFirst({ where: { id: tenantId, deletedAt: null } }),
  ]);
  if (!property) throw notFound('Property');
  if (!tenant) throw notFound('Tenant');
  if (property.status === 'OCCUPIED') throw conflict(`${property.name} is already occupied`);
  if (property.status === 'OFFLINE') throw conflict(`${property.name} is offline and cannot be let`);

  const openLease = await tx.lease.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    include: { property: { select: { name: true, unitNumber: true } } },
  });
  if (openLease) {
    throw conflict(
      `${tenant.fullName} already has an active lease at ${openLease.property.name}${
        openLease.property.unitNumber ? ` #${openLease.property.unitNumber}` : ''
      }`,
    );
  }
  return { property, tenant };
};

export const createLease = async (ownerId: string, input: CreateLeaseInput, req?: Request) => {
  const startDate = toUtcDate(input.startDate);
  const endDate = input.endDate ? toUtcDate(input.endDate) : null;
  if (endDate && endDate <= startDate) throw badRequest('End date must be after the start date');

  const lease = await prisma.$transaction(async (tx) => {
    const { property } = await assertUsable(input.propertyId, input.tenantId, tx);

    const created = await tx.lease.create({
      data: {
        propertyId: input.propertyId,
        tenantId: input.tenantId,
        startDate,
        endDate,
        rentAmount: decimal(input.rentAmount),
        deposit: decimal(input.deposit),
        dueDay: input.dueDay,
        status: 'ACTIVE',
        autoGenerateSchedule: input.autoGenerateSchedule,
        notes: input.notes ?? null,
      },
    });

    if (input.autoGenerateSchedule) {
      await generateRentSchedule(tx, created, input.scheduleMonths);
    }
    await tx.property.update({ where: { id: input.propertyId }, data: { status: 'OCCUPIED' } });

    return tx.lease.findUniqueOrThrow({ where: { id: created.id }, include: leaseInclude });
  });

  await recordAudit({
    ownerId,
    action: 'lease.create',
    entityType: 'lease',
    entityId: lease.id,
    summary: `${lease.tenant.fullName} → ${lease.property.name}`,
    after: plain(lease),
    req,
  });

  return { lease: plain(lease), billedPeriods: await countSchedules(lease.id) };
};

const countSchedules = async (leaseId: string) => prisma.rentSchedule.count({ where: { leaseId } });

export const listLeases = async (input: ListLeasesInput) => {
  const where: Prisma.LeaseWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.lease.count({ where }),
    prisma.lease.findMany({
      where,
      include: {
        ...leaseInclude,
        rentItems: { select: { id: true, status: true, dueDate: true, amount: true, amountPaid: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  const data = rows.map((lease) => {
    const items = lease.rentItems;
    const billed = items.reduce((sum, item) => sum + toNum(item.amount), 0);
    const paid = items.reduce((sum, item) => sum + toNum(item.amountPaid), 0);
    return {
      ...lease,
      rentItems: undefined,
      stats: {
        periods: items.length,
        unpaidPeriods: items.filter((item) => item.status !== 'PAID').length,
        overduePeriods: items.filter((item) => item.status !== 'PAID' && item.dueDate < new Date()).length,
        billed: Math.round(billed * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        outstanding: Math.round((billed - paid) * 100) / 100,
      },
    };
  });

  return { data: plain(data), meta: pageMeta(total, input.page, input.pageSize) };
};

export const getLease = async (id: string) => {
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      ...leaseInclude,
      rentItems: {
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
        include: { payments: { where: { reversed: false }, orderBy: { paidAt: 'asc' } } },
      },
    },
  });
  if (!lease) throw notFound('Lease');
  return { lease: plain(lease) };
};

export const updateLease = async (ownerId: string, id: string, input: UpdateLeaseInput, req?: Request) => {
  const existing = await prisma.lease.findUnique({ where: { id }, include: leaseInclude });
  if (!existing) throw notFound('Lease');
  if (existing.status !== 'ACTIVE' && input.rentAmount !== undefined) {
    throw badRequest('Only an active lease can have its rent changed');
  }
  if (input.endDate) {
    const end = toUtcDate(input.endDate);
    if (end <= existing.startDate) throw badRequest('End date must be after the start date');
  }

  const lease = await prisma.$transaction(async (tx) => {
    const updated = await tx.lease.update({
      where: { id },
      data: {
        ...(input.rentAmount !== undefined ? { rentAmount: decimal(input.rentAmount) } : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        ...(input.deposit !== undefined ? { deposit: decimal(input.deposit) } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? toUtcDate(input.endDate) : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.autoGenerateSchedule !== undefined ? { autoGenerateSchedule: input.autoGenerateSchedule } : {}),
      },
    });

    // Re-price unpaid months so the schedule matches the agreed rent.
    if (input.rentAmount !== undefined) {
      await tx.rentSchedule.updateMany({
        where: { leaseId: id, status: { not: 'PAID' } },
        data: { amount: decimal(input.rentAmount) },
      });
    }

    if (input.dueDay !== undefined) {
      const unpaid = await tx.rentSchedule.findMany({
        where: { leaseId: id, status: { not: 'PAID' } },
        select: { id: true, periodYear: true, periodMonth: true },
      });
      await Promise.all(
        unpaid.map((row) =>
          tx.rentSchedule.update({
            where: { id: row.id },
            data: { dueDate: dueDateFor(row.periodYear, row.periodMonth, input.dueDay!) },
          }),
        ),
      );
    }

    return tx.lease.findUniqueOrThrow({ where: { id }, include: leaseInclude });
  });

  await recordAudit({
    ownerId,
    action: 'lease.update',
    entityType: 'lease',
    entityId: id,
    summary: `${existing.tenant.fullName} → ${existing.property.name}`,
    before: plain(existing),
    after: plain(lease),
    req,
  });
  return { lease: plain(lease) };
};

const closeLease = async (
  ownerId: string,
  id: string,
  status: 'ENDED' | 'TERMINATED',
  endDate: Date | undefined,
  reason: string | undefined,
  req: Request | undefined,
) => {
  const existing = await prisma.lease.findUnique({ where: { id }, include: leaseInclude });
  if (!existing) throw notFound('Lease');
  if (existing.status !== 'ACTIVE') throw conflict(`Lease is already ${existing.status.toLowerCase()}`);

  const closeDate = endDate ? toUtcDate(endDate) : new Date();
  if (closeDate <= existing.startDate) throw badRequest('Closing date must be after the start date');

  const lease = await prisma.$transaction(async (tx) => {
    const updated = await tx.lease.update({
      where: { id },
      data: {
        status,
        endDate: closeDate,
        notes: reason ? `${existing.notes ? `${existing.notes}\n` : ''}${status}: ${reason}` : existing.notes,
      },
    });
    await syncPropertyStatus(existing.propertyId, tx);
    return tx.lease.findUniqueOrThrow({ where: { id }, include: leaseInclude });
  });

  await recordAudit({
    ownerId,
    action: `lease.${status.toLowerCase()}`,
    entityType: 'lease',
    entityId: id,
    summary: `${existing.tenant.fullName} out of ${existing.property.name}${reason ? ` — ${reason}` : ''}`,
    before: plain(existing),
    after: plain(lease),
    req,
  });
  return plain(lease);
};

export const endLease = (
  ownerId: string,
  id: string,
  input: { endDate?: Date; reason?: string | null },
  req?: Request,
) => closeLease(ownerId, id, 'ENDED', input.endDate, input.reason ?? undefined, req);

export const terminateLease = (
  ownerId: string,
  id: string,
  input: { endDate?: Date; reason?: string | null },
  req?: Request,
) => closeLease(ownerId, id, 'TERMINATED', input.endDate, input.reason ?? undefined, req);

/** Top-up billing months for a lease (used for open-ended tenancies). */
export const extendSchedule = async (ownerId: string, leaseId: string, months: number, req?: Request) => {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw notFound('Lease');
  if (lease.status !== 'ACTIVE') throw conflict('Only an active lease can be billed forward');

  const result = await generateRentSchedule(prisma, lease, months);
  await recordAudit({
    ownerId,
    action: 'lease.schedule_extend',
    entityType: 'lease',
    entityId: leaseId,
    summary: `${result.created} new month(s) billed`,
    req,
  });
  return result;
};
