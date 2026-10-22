import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { decimal } from '../../lib/decimal.js';
import { conflict, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import type {
  CreatePropertyInput,
  ListPropertiesInput,
  UpdatePropertyInput,
} from './properties.schemas.js';

type Db = PrismaClient | Prisma.TransactionClient;

const ACTIVE_LEASE_WHERE = { status: 'ACTIVE' as const };

/** Occupancy is a consequence of leases, never typed in by hand. */
export const syncPropertyStatus = async (propertyId: string, db: Db = prisma): Promise<void> => {
  const property = await db.property.findUnique({ where: { id: propertyId } });
  if (!property) return;

  const activeLeases = await db.lease.count({ where: { propertyId, ...ACTIVE_LEASE_WHERE } });
  const nextStatus =
    activeLeases > 0
      ? 'OCCUPIED'
      : property.status === 'MAINTENANCE' || property.status === 'OFFLINE'
        ? property.status
        : 'AVAILABLE';

  if (nextStatus !== property.status) {
    await db.property.update({ where: { id: propertyId }, data: { status: nextStatus } });
  }
};

export const listProperties = async (input: ListPropertiesInput) => {
  const where: Prisma.PropertyWhereInput = {
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' } },
            { address: { contains: input.search, mode: 'insensitive' } },
            { unitNumber: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      include: {
        leases: {
          where: ACTIVE_LEASE_WHERE,
          orderBy: { startDate: 'desc' },
          take: 1,
          include: { tenant: { select: { id: true, fullName: true, phone: true } } },
        },
        maintenanceReqs: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return {
    data: plain(
      rows.map(({ leases, maintenanceReqs, ...property }) => ({
        ...property,
        currentTenant: leases[0]?.tenant ?? null,
        currentLease: leases[0]
          ? { id: leases[0].id, startDate: leases[0].startDate, endDate: leases[0].endDate, rentAmount: leases[0].rentAmount }
          : null,
        openMaintenance: maintenanceReqs.length,
      })),
    ),
    meta: pageMeta(total, input.page, input.pageSize),
  };
};

export const getProperty = async (id: string) => {
  const property = await prisma.property.findFirst({
    where: { id, deletedAt: null },
    include: {
      leases: {
        orderBy: { startDate: 'desc' },
        include: { tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } } },
      },
      maintenanceReqs: { orderBy: { reportedAt: 'desc' }, take: 10 },
      expenses: { orderBy: { incurredAt: 'desc' }, take: 10 },
    },
  });
  if (!property) throw notFound('Property');

  const active = property.leases.filter((lease) => lease.status === 'ACTIVE');
  return plain({
    ...property,
    currentTenants: active.map((lease) => lease.tenant),
    leaseHistory: property.leases,
  });
};

export const createProperty = async (ownerId: string, input: CreatePropertyInput, req?: Request) => {
  const property = await prisma.property.create({
    data: {
      name: input.name,
      address: input.address,
      unitNumber: input.unitNumber ?? null,
      type: input.type,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      monthlyRent: decimal(input.monthlyRent),
      deposit: decimal(input.deposit),
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  await recordAudit({
    ownerId,
    action: 'property.create',
    entityType: 'property',
    entityId: property.id,
    summary: `${property.name}${property.unitNumber ? ` #${property.unitNumber}` : ''}`,
    after: plain(property),
    req,
  });
  return plain(property);
};

export const updateProperty = async (
  ownerId: string,
  id: string,
  input: UpdatePropertyInput,
  req?: Request,
) => {
  const existing = await prisma.property.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Property');

  if (input.status === 'AVAILABLE') {
    const activeLeases = await prisma.lease.count({ where: { propertyId: id, ...ACTIVE_LEASE_WHERE } });
    if (activeLeases > 0) throw conflict('Property still has an active lease');
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber ?? null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.bedrooms !== undefined ? { bedrooms: input.bedrooms ?? null } : {}),
      ...(input.bathrooms !== undefined ? { bathrooms: input.bathrooms ?? null } : {}),
      ...(input.monthlyRent !== undefined ? { monthlyRent: decimal(input.monthlyRent) } : {}),
      ...(input.deposit !== undefined ? { deposit: decimal(input.deposit) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });

  await recordAudit({
    ownerId,
    action: 'property.update',
    entityType: 'property',
    entityId: id,
    summary: property.name,
    before: plain(existing),
    after: plain(property),
    req,
  });
  return plain(property);
};

/** Soft delete keeps financial history intact for reporting. */
export const deleteProperty = async (ownerId: string, id: string, req?: Request) => {
  const property = await prisma.property.findFirst({ where: { id, deletedAt: null } });
  if (!property) throw notFound('Property');

  const activeLeases = await prisma.lease.count({ where: { propertyId: id, ...ACTIVE_LEASE_WHERE } });
  if (activeLeases > 0) throw conflict('End or terminate the active lease before removing this property');

  await prisma.property.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    ownerId,
    action: 'property.delete',
    entityType: 'property',
    entityId: id,
    summary: property.name,
    before: plain(property),
    req,
  });
};
