import type { Request } from 'express';
import { recordAudit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_CURRENCY, getCurrency, setCurrency } from '../../lib/settings.js';
import { DEFAULT_REMINDER_DAYS, REMINDER_DAYS_KEY } from './settings.schemas.js';
import type { UpdateSettingsInput } from './settings.schemas.js';

const readReminderDays = async (): Promise<number> => {
  const row = await prisma.setting.findUnique({ where: { key: REMINDER_DAYS_KEY } });
  if (typeof row?.value !== 'number' || !Number.isInteger(row.value)) return DEFAULT_REMINDER_DAYS;
  return row.value >= 0 && row.value <= 30 ? row.value : DEFAULT_REMINDER_DAYS;
};

const currentValues = async () => ({
  currency: await getCurrency(),
  reminderDays: await readReminderDays(),
});

export const getSettings = async () => {
  const values = await currentValues();
  return {
    ...values,
    defaults: { currency: DEFAULT_CURRENCY, reminderDays: DEFAULT_REMINDER_DAYS },
  };
};

export const updateSettings = async (ownerId: string, input: UpdateSettingsInput, req?: Request) => {
  const before = await currentValues();

  if (input.currency) await setCurrency(input.currency);
  if (input.reminderDays !== undefined) {
    await prisma.setting.upsert({
      where: { key: REMINDER_DAYS_KEY },
      create: { key: REMINDER_DAYS_KEY, value: input.reminderDays },
      update: { value: input.reminderDays },
    });
  }

  const after = await currentValues();
  await recordAudit({
    ownerId,
    action: 'settings.update',
    entityType: 'settings',
    summary: Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => `${key}: ${before[key as keyof typeof before]} → ${after[key as keyof typeof after]}`)
      .join(', '),
    before,
    after,
    req,
  });
  return getSettings();
};
