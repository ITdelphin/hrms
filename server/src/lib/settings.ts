import { prisma } from './prisma.js';

export const CURRENCY_KEY = 'currency';
export const DEFAULT_CURRENCY = 'RWF';

export const getCurrency = async (): Promise<string> => {
  const row = await prisma.setting.findUnique({ where: { key: CURRENCY_KEY } });
  const value = typeof row?.value === 'string' ? row.value : null;
  return value && value.length <= 8 ? value : DEFAULT_CURRENCY;
};

export const setCurrency = async (currency: string) =>
  prisma.setting.upsert({
    where: { key: CURRENCY_KEY },
    create: { key: CURRENCY_KEY, value: currency },
    update: { value: currency },
  });

export const formatAmount = (value: number, currency: string): string =>
  `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
