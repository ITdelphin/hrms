import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { decimal, toNum } from '../../lib/decimal.js';
import { toUtcDate } from '../../lib/date.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import type { MaintenanceStatus } from './maintenance.schemas.js';
import type {
  CreateMaintenanceInput,
  ListMaintenanceInput,
  UpdateMaintenanceInput,
} from './maintenance.schemas.js';

const maintenanceInclude = {
  property: { select: { id: true, name: true, unitNumber: true } },
  tenant: { select: { id: true, fullName: true, phone: true } },
} as const;

const EXPENSE_PREFIX = 'Maintenance: ';
const expenseDescription = (title: string) => `${EXPENSE_PREFIX}${title}`;

type CostRow = { propertyId: string; title: string; cost: Prisma.Decimal | null; reportedAt: Date };

/** RESOLVED/CLOSED stamp a resolution date; reopening to OPEN removes it. IN_PROGRESS leaves it alone. */
const resolvedAtFor = (status: MaintenanceStatus, current: Date | null): Date | null | undefined => {
  if (status === 'OPEN') return null;
  if (status === 'RESOLVED' || status === 'CLOSED') return current ?? new Date();
  return undefined;
};

const assertRefs = async (
  tx: Prisma.TransactionClient,
  propertyId: string,
  tenantId?: string | null,
): Promise<void> => {
  const property = await tx.property.findFirst({ where: { id: propertyId, deletedAt: null } });
  if (!property) throw notFound('Property');
  if (tenantId) {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw notFound('Tenant');
  }
};

/**
 * A request without a recorded cost never booked an expense, so nothing is searched for.
 * The amount is part of the match because several requests can share one property.
 */
const findLinkedExpense = async (
  tx: Prisma.TransactionClient,
  propertyId: string,
  cost: Prisma.Decimal | null,
): Promise<{ id: string } | null> => {
  if (cost === null) return null;
  return tx.expense.findFirst({
    where: {
      propertyId,
      category: 'REPAIRS',
      description: { startsWith: EXPENSE_PREFIX },
      amount: decimal(toNum(cost)),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
};

/**
 * The repair expense a request booked is identified by its generated description (there is no link
 * column), so amount, description and property are kept in step with the request inside its transaction.
 */
const syncLinkedExpense = async (
  tx: Prisma.TransactionClient,
  before: CostRow,
  after: CostRow,
  ownerId: string,
): Promise<void> => {
  if (before.cost === null && after.cost === null) return;
  if (
    before.cost !== null &&
    toNum(before.cost) === toNum(after.cost) &&
    before.title === after.title &&
    before.propertyId === after.propertyId &&
    before.reportedAt.getTime() === after.reportedAt.getTime()
  ) {
    return;
  }

  const linked = await findLinkedExpense(tx, before.propertyId, before.cost);
  const nextCost = toNum(after.cost);

  if (linked && nextCost <= 0) {
    await tx.expense.delete({ where: { id: linked.id } });
    return;
  }
  if (linked) {
    await tx.expense.update({
      where: { id: linked.id },
      data: {
        amount: decimal(nextCost),
        description: expenseDescription(after.title),
        propertyId: after.propertyId,
        incurredAt: after.reportedAt,
      },
    });
    return;
  }
  if (nextCost > 0) {
    await tx.expense.create({
      data: {
        propertyId: after.propertyId,
        category: 'REPAIRS',
        amount: decimal(nextCost),
        description: expenseDescription(after.title),
        incurredAt: after.reportedAt,
        createdById: ownerId,
      },
    });
  }
};

export const listMaintenance = async (input: ListMaintenanceInput) => {
  const where: Prisma.MaintenanceRequestWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.maintenanceRequest.count({ where }),
    prisma.maintenanceRequest.findMany({
      where,
      include: maintenanceInclude,
      orderBy: { reportedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return {
    data: plain(rows),
    meta: pageMeta(total, input.page, input.pageSize),
  };
};

export const getMaintenance = async (id: string) => {
  const request = await prisma.maintenanceRequest.findUnique({ where: { id }, include: maintenanceInclude });
  if (!request) throw notFound('Maintenance request');
  return plain(request);
};

export const createMaintenance = async (ownerId: string, input: CreateMaintenanceInput, req?: Request) => {
  const reportedAt = toUtcDate(input.reportedAt ?? new Date());
  const cost = input.cost === undefined || input.cost === null ? null : input.cost;

  const request = await prisma.$transaction(async (tx) => {
    await assertRefs(tx, input.propertyId, input.tenantId);

    const created = await tx.maintenanceRequest.create({
      data: {
        propertyId: input.propertyId,
        tenantId: input.tenantId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        cost: cost === null ? null : decimal(cost),
        reportedAt,
        resolvedAt: resolvedAtFor(input.status, null),
        createdById: ownerId,
      },
    });

    if (cost !== null && cost > 0) {
      await tx.expense.create({
        data: {
          propertyId: input.propertyId,
          category: 'REPAIRS',
          amount: decimal(cost),
          description: expenseDescription(input.title),
          incurredAt: reportedAt,
          createdById: ownerId,
        },
      });
    }

    return tx.maintenanceRequest.findUniqueOrThrow({ where: { id: created.id }, include: maintenanceInclude });
  });

  await recordAudit({
    ownerId,
    action: 'maintenance.create',
    entityType: 'maintenance',
    entityId: request.id,
    summary: `${request.title} @ ${request.property.name}`,
    after: plain(request),
    req,
  });
  return plain(request);
};

export const updateMaintenance = async (
  ownerId: string,
  id: string,
  input: UpdateMaintenanceInput,
  req?: Request,
) => {
  const existing = await prisma.maintenanceRequest.findUnique({ where: { id } });
  if (!existing) throw notFound('Maintenance request');

  const request = await prisma.$transaction(async (tx) => {
    if (input.propertyId || input.tenantId) await assertRefs(tx, input.propertyId ?? existing.propertyId, input.tenantId);

    const updated = await tx.maintenanceRequest.update({
      where: { id },
      data: {
        ...(input.propertyId !== undefined ? { propertyId: input.propertyId } : {}),
        ...(input.tenantId !== undefined ? { tenantId: input.tenantId ?? null } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.cost !== undefined ? { cost: input.cost === null ? null : decimal(input.cost) } : {}),
        ...(input.reportedAt !== undefined ? { reportedAt: toUtcDate(input.reportedAt) } : {}),
        ...(input.status !== undefined
          ? { status: input.status, resolvedAt: resolvedAtFor(input.status, existing.resolvedAt) }
          : {}),
      },
    });

    await syncLinkedExpense(
      tx,
      { propertyId: existing.propertyId, title: existing.title, cost: existing.cost, reportedAt: existing.reportedAt },
      { propertyId: updated.propertyId, title: updated.title, cost: updated.cost, reportedAt: updated.reportedAt },
      ownerId,
    );

    return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: maintenanceInclude });
  });

  await recordAudit({
    ownerId,
    action: 'maintenance.update',
    entityType: 'maintenance',
    entityId: id,
    summary: `${request.title} @ ${request.property.name} → ${request.status}`,
    before: plain(existing),
    after: plain(request),
    req,
  });
  return plain(request);
};

export const transitionMaintenance = (ownerId: string, id: string, status: MaintenanceStatus, req?: Request) =>
  updateMaintenance(ownerId, id, { status }, req);

export const deleteMaintenance = async (ownerId: string, id: string, req?: Request) => {
  const existing = await prisma.maintenanceRequest.findUnique({ where: { id } });
  if (!existing) throw notFound('Maintenance request');

  await prisma.$transaction(async (tx) => {
    const linked = await findLinkedExpense(tx, existing.propertyId, existing.cost);
    if (linked) await tx.expense.delete({ where: { id: linked.id } });
    await tx.maintenanceRequest.delete({ where: { id } });
  });

  await recordAudit({
    ownerId,
    action: 'maintenance.delete',
    entityType: 'maintenance',
    entityId: id,
    summary: existing.title,
    before: plain(existing),
    req,
  });
};
