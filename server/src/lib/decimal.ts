import { z } from 'zod';
import { Prisma } from '@prisma/client';

const moneyField = z.coerce
  .number({ message: 'Amount must be a number' })
  .finite()
  .min(0, 'Amount cannot be negative')
  .max(99_999_999, 'Amount is too large')
  .transform((v) => Math.round(v * 100) / 100);

export const decimal = (value: number): Prisma.Decimal => new Prisma.Decimal(moneyField.parse(value));

export const toNum = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);
