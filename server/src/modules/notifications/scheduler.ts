import cron from 'node-cron';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { runRentReminders } from './notifications.service.js';

export const REMINDER_CRON = '10 8 * * *';

let lastRunAt: Date | null = null;
let lastSummary: unknown = null;
let running = false;

/** Daily tenant reminders + owner digest. Also callable on demand from the API. */
export const runReminders = async () => {
  if (running) return { skipped: 'already running' };
  running = true;
  try {
    const summary = await runRentReminders();
    lastRunAt = new Date();
    lastSummary = summary;
    logger.info('rent_reminders_completed', summary);
    return summary;
  } catch (error) {
    logger.error('rent_reminders_failed', { error: (error as Error).message });
    throw error;
  } finally {
    running = false;
  }
};

export const reminderState = () => ({
  enabled: env.ENABLE_SCHEDULER,
  schedule: REMINDER_CRON,
  provider: env.NOTIFICATION_PROVIDER,
  daysBeforeDue: env.REMINDER_DAYS_BEFORE_DUE,
  lastRunAt,
  lastSummary,
});

export const startScheduler = (): (() => void) | undefined => {
  if (!env.ENABLE_SCHEDULER) {
    logger.info('scheduler_disabled');
    return undefined;
  }
  const task = cron.schedule(REMINDER_CRON, () => {
    runReminders().catch(() => undefined);
  });
  logger.info('scheduler_started', { schedule: REMINDER_CRON, provider: env.NOTIFICATION_PROVIDER });
  return () => task.stop();
};
