import { env } from '../../config/env.js';
import { consoleProvider } from './providers/console.provider.js';
import { smtpProvider } from './providers/smtp.provider.js';
import type { NotificationProvider } from './provider.js';

const providers = {
  console: consoleProvider,
  smtp: smtpProvider,
} as const;

export const getProvider = (): NotificationProvider => providers[env.NOTIFICATION_PROVIDER];

export const providerStatus = () => {
  const provider = getProvider();
  const configured = provider.name === 'smtp' ? Boolean(env.SMTP_HOST && env.SMTP_USER) : true;
  return {
    active: provider.name,
    configured,
    sender: provider.name === 'smtp' ? env.SMTP_FROM : 'server log',
    hint: configured
      ? 'Reminders and receipts are dispatched through the active provider.'
      : 'Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS to deliver real email.',
  };
};
