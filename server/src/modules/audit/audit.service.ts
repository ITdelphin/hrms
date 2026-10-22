import type { Prisma } from '@prisma/client';
import { toUtcDate } from '../../lib/date.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { AUDIT_STATS_DAYS } from './audit.schemas.js';
import type { AuditStatsInput, ListAuditInput } from './audit.schemas.js';

/** Owner is joined by select so credentials can never ride along on an audit row. */
const auditInclude = {
  owner: { select: { id: true, email: true, fullName: true } },
} as const;

const auditOrderBy = { createdAt: 'desc' } as const;

export const listAuditLog = async (input: ListAuditInput) => {
  const createdAt: Prisma.DateTimeFilter = {};
  if (input.from) createdAt.gte = toUtcDate(input.from);
  if (input.to) createdAt.lte = toUtcDate(input.to);

  const where: Prisma.AuditLogWhereInput = {
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: auditInclude,
      orderBy: auditOrderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return {
    data: plain(
      rows.map(({ owner, ...log }) => ({
        ...log,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.fullName ?? null,
      })),
    ),
    meta: pageMeta(total, input.page, input.pageSize),
  };
};

/** Activity counters for the trailing window, used by the admin dashboard widgets. */
export const getAuditStats = async (input: Partial<AuditStatsInput> = {}) => {
  const days = input.days ?? AUDIT_STATS_DAYS;
  const since = new Date(Date.now() - days * 86_400_000);
  const where: Prisma.AuditLogWhereInput = { createdAt: { gte: since } };

  const { total, byAction, byEntityType, byOwner } = await prisma.$transaction(async (tx) => ({
    total: await tx.auditLog.count({ where }),
    byAction: await tx.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    byEntityType: await tx.auditLog.groupBy({ by: ['entityType'], where, _count: { _all: true } }),
    byOwner: await tx.auditLog.groupBy({
      by: ['ownerId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  }));

  return {
    days,
    since,
    total,
    byAction: byAction.map((row) => ({ action: row.action, count: row._count._all })),
    byEntityType: byEntityType.map((row) => ({ entityType: row.entityType, count: row._count._all })),
    byOwner: byOwner.map((row) => ({ ownerId: row.ownerId, count: row._count._all })),
  };
};
