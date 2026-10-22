import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { outstandingByTenant } from '../payments/ledger.js';
import type { CreateTenantInput, ListTenantsInput } from './tenants.schemas.js';

const tenantInclude = {
  leases: {
    orderBy: { startDate: 'desc' },
    include: { property: { select: { id: true, name: true, unitNumber: true, address: true } } },
  },
} as const;

type PropertyRef = { id: string; name: string; unitNumber: string | null; address: string };
type LeaseRef = { id: string; status: string; startDate: Date; endDate: Date | null; property: PropertyRef };
type TenantRow = {
  id: string;
  fullName: string;
  phone: string;
  idNumber: string;
  email: string | null;
  postalAddress: string | null;
  emergencyContact: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  leases: LeaseRef[];
};

type ShapedTenant = Omit<TenantRow, 'leases'> & {
  assignedHouse: PropertyRef | null;
  activeLeaseId: string | null;
  leaseHistory: LeaseRef[];
};

const shapeTenant = (tenant: TenantRow): ShapedTenant => {
  const { leases, ...base } = tenant;
  const active = leases.find((lease) => lease.status === 'ACTIVE');
  return {
    ...base,
    assignedHouse: active?.property ?? null,
    activeLeaseId: active?.id ?? null,
    leaseHistory: leases.filter((lease) => lease.status !== 'ACTIVE'),
  };
};

const withBalances = async (
  tenants: ShapedTenant[],
): Promise<Array<ShapedTenant & { outstanding: number; overdueCount: number }>> => {
  const balances = await outstandingByTenant(
    prisma,
    tenants.map((tenant) => tenant.id),
  );
  return tenants.map((tenant) => ({
    ...tenant,
    outstanding: balances[tenant.id]?.outstanding ?? 0,
    overdueCount: balances[tenant.id]?.overdueCount ?? 0,
  }));
};

export const listTenants = async (input: ListTenantsInput) => {
  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
    ...(input.search
      ? {
          OR: [
            { fullName: { contains: input.search, mode: 'insensitive' } },
            { phone: { contains: input.search } },
            { idNumber: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(input.status === 'HOUSED'
      ? { leases: { some: { status: 'ACTIVE' } } }
      : input.status === 'NOT_HOUSED'
        ? { leases: { none: { status: 'ACTIVE' } } }
        : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: tenantInclude,
      orderBy: { fullName: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return { data: plain(await withBalances(rows.map(shapeTenant))), meta: pageMeta(total, input.page, input.pageSize) };
};

export const getTenant = async (id: string) => {
  const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null }, include: tenantInclude });
  if (!tenant) throw notFound('Tenant');

  const [shaped] = await withBalances([shapeTenant(tenant)]);
  const rentItems = await prisma.rentSchedule.findMany({
    where: { lease: { tenantId: id } },
    include: { payments: { where: { reversed: false }, orderBy: { paidAt: 'asc' } }, lease: { select: { id: true, status: true, dueDay: true } } },
    orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
  });

  return { ...plain(shaped), rentItems: plain(rentItems) };
};

export const createTenant = async (ownerId: string, input: CreateTenantInput, req?: Request) => {
  const duplicate = await prisma.tenant.findFirst({
    where: { idNumber: input.idNumber, deletedAt: null },
  });
  if (duplicate) throw conflict(`A tenant with identification number ${input.idNumber} already exists`);

  const tenant = await prisma.tenant.create({
    data: {
      fullName: input.fullName,
      phone: input.phone,
      idNumber: input.idNumber,
      email: input.email ?? null,
      postalAddress: input.postalAddress ?? null,
      emergencyContact: input.emergencyContact ?? null,
      notes: input.notes ?? null,
    },
  });

  await recordAudit({
    ownerId,
    action: 'tenant.create',
    entityType: 'tenant',
    entityId: tenant.id,
    summary: tenant.fullName,
    after: plain(tenant),
    req,
  });
  return plain(tenant);
};

export const updateTenant = async (
  ownerId: string,
  id: string,
  input: Partial<CreateTenantInput>,
  req?: Request,
) => {
  const existing = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Tenant');

  if (input.idNumber && input.idNumber !== existing.idNumber) {
    const taken = await prisma.tenant.findFirst({ where: { idNumber: input.idNumber, deletedAt: null, id: { not: id } } });
    if (taken) throw conflict(`Identification number ${input.idNumber} belongs to another tenant`);
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.idNumber !== undefined ? { idNumber: input.idNumber } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.postalAddress !== undefined ? { postalAddress: input.postalAddress ?? null } : {}),
      ...(input.emergencyContact !== undefined ? { emergencyContact: input.emergencyContact ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });

  await recordAudit({
    ownerId,
    action: 'tenant.update',
    entityType: 'tenant',
    entityId: id,
    summary: tenant.fullName,
    before: plain(existing),
    after: plain(tenant),
    req,
  });
  return plain(tenant);
};

export const deleteTenant = async (ownerId: string, id: string, req?: Request) => {
  const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null }, include: { leases: true } });
  if (!tenant) throw notFound('Tenant');
  if (tenant.leases.some((lease) => lease.status === 'ACTIVE')) {
    throw conflict('End or terminate the active lease before removing this tenant');
  }

  await prisma.tenant.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    ownerId,
    action: 'tenant.delete',
    entityType: 'tenant',
    entityId: id,
    summary: tenant.fullName,
    before: plain(tenant),
    req,
  });
};
