import { logger } from '../../../lib/logger.js';
import type { NotificationProvider, OutgoingMessage, SendResult } from '../provider.js';

/**
 * Development provider: renders the message to the server log instead of
 * delivering it, so reminder flows are testable without an email account.
 */
export const consoleProvider: NotificationProvider = {
  name: 'console',
  canDeliver: (to) => Boolean(to && to.includes('@')),
  async send(message: OutgoingMessage): Promise<SendResult> {
    logger.info('notification_console_delivery', {
      to: message.to,
      name: message.name ?? undefined,
      subject: message.subject,
      body: message.body,
    });
    return { ok: true };
  },
};
