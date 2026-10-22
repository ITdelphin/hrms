import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../lib/audit.js';
import { decimal, toNum } from '../../lib/decimal.js';
import { toUtcDate } from '../../lib/date.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import type { CreateExpenseInput, ListExpensesInput, UpdateExpenseInput } from './expenses.schemas.js';

const expenseInclude = {
  property: { select: { id: true, name: true, unitNumber: true } },
} as const;

const propertyLabel = (property: { name: string; unitNumber: string | null } | null): string | null =>
  property ? `${property.name}${property.unitNumber ? ` #${property.unitNumber}` : ''}` : null;

const assertProperty = async (propertyId: string | null | undefined): Promise<void> => {
  if (!propertyId) return;
  const property = await prisma.property.findFirst({ where: { id: propertyId, deletedAt: null } });
  if (!property) throw notFound('Property');
};

const summaryFor = (expense: { category: string; amount: Prisma.Decimal | number; description: string }) =>
  `${expense.category} ${toNum(expense.amount)} — ${expense.description}`;

export const listExpenses = async (input: ListExpensesInput) => {
  const incurredAt: Prisma.DateTimeFilter = {};
  if (input.from) incurredAt.gte = toUtcDate(input.from);
  if (input.to) incurredAt.lte = toUtcDate(input.to);

  const where: Prisma.ExpenseWhereInput = {
    ...(Object.keys(incurredAt).length > 0 ? { incurredAt } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
  };

  // Interactive transaction so the page, the count and the category totals share one snapshot.
  const { total, rows, grouped } = await prisma.$transaction(async (tx) => ({
    total: await tx.expense.count({ where }),
    rows: await tx.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    grouped: await tx.expense.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: { _all: true } }),
  }));

  const byCategory = grouped
    .map((row) => ({
      category: row.category,
      count: row._count._all,
      total: toNum(row._sum.amount),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    data: plain(
      rows.map((expense) => ({
        ...expense,
        amount: toNum(expense.amount),
        propertyName: propertyLabel(expense.property),
      })),
    ),
    meta: pageMeta(total, input.page, input.pageSize),
    // Totals are computed from the whole filtered range, not just the current page.
    totals: {
      amount: Math.round(byCategory.reduce((sum, row) => sum + row.total, 0) * 100) / 100,
      byCategory,
    },
  };
};

export const createExpense = async (ownerId: string, input: CreateExpenseInput, req?: Request) => {
  await assertProperty(input.propertyId);

  const expense = await prisma.expense.create({
    data: {
      propertyId: input.propertyId ?? null,
      category: input.category,
      amount: decimal(input.amount),
      description: input.description,
      incurredAt: toUtcDate(input.incurredAt ?? new Date()),
      createdById: ownerId,
    },
    include: expenseInclude,
  });

  await recordAudit({
    ownerId,
    action: 'expense.create',
    entityType: 'expense',
    entityId: expense.id,
    summary: `${summaryFor(expense)}${propertyLabel(expense.property) ? ` @ ${propertyLabel(expense.property)}` : ''}`,
    after: plain(expense),
    req,
  });
  return plain(expense);
};

export const updateExpense = async (
  ownerId: string,
  id: string,
  input: UpdateExpenseInput,
  req?: Request,
) => {
  const existing = await prisma.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!existing) throw notFound('Expense');
  if (input.propertyId) await assertProperty(input.propertyId);

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      ...(input.propertyId !== undefined ? { propertyId: input.propertyId ?? null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: decimal(input.amount) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.incurredAt !== undefined ? { incurredAt: toUtcDate(input.incurredAt) } : {}),
    },
    include: expenseInclude,
  });

  await recordAudit({
    ownerId,
    action: 'expense.update',
    entityType: 'expense',
    entityId: id,
    summary: summaryFor(expense),
    before: plain(existing),
    after: plain(expense),
    req,
  });
  return plain(expense);
};

/** Expenses are small, reversible bookkeeping rows, so a hard delete with an audit trail is enough. */
export const deleteExpense = async (ownerId: string, id: string, req?: Request) => {
  const expense = await prisma.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!expense) throw notFound('Expense');

  await prisma.expense.delete({ where: { id } });
  await recordAudit({
    ownerId,
    action: 'expense.delete',
    entityType: 'expense',
    entityId: id,
    summary: summaryFor(expense),
    before: plain(expense),
    req,
  });
};
