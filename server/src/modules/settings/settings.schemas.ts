import { z } from 'zod';

export const REMINDER_DAYS_KEY = 'reminderDays';
export const DEFAULT_REMINDER_DAYS = 3;

export const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code');

export const reminderDaysSchema = z.coerce
  .number({ message: 'reminderDays must be a number' })
  .int()
  .min(0, 'reminderDays cannot be negative')
  .max(30, 'reminderDays cannot exceed 30');

export const updateSettingsSchema = z
  .object({
    currency: currencySchema.optional(),
    reminderDays: reminderDaysSchema.optional(),
  })
  .refine((value) => value.currency !== undefined || value.reminderDays !== undefined, {
    message: 'Provide currency or reminderDays',
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
