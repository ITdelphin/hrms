import type { Decimal } from '@prisma/client/runtime/library';

/** Money is stored as NUMERIC(12,2); API responses expose plain numbers (2dp). */
export const toMoney = (value: Decimal | number | string): number =>
  Math.round(Number(value) * 100) / 100;

export const money = (value: number): string => toMoney(value).toFixed(2);

export const assertPositiveMoney = (value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number');
  }
};
