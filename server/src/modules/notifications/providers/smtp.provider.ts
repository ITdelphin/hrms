import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import type { NotificationProvider, OutgoingMessage, SendResult } from '../provider.js';

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' },
    });
  }
  return transporter;
};

/** Real email delivery; misconfiguration downgrades to a recorded skip rather than a crash. */
export const smtpProvider: NotificationProvider = {
  name: 'smtp',
  canDeliver: (to) => Boolean(to && to.includes('@')) && getTransporter() !== null,
  async send(message: OutgoingMessage): Promise<SendResult> {
    const mail = getTransporter();
    if (!mail) {
      return { ok: false, skipped: 'SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)' };
    }
    try {
      await mail.sendMail({
        from: env.SMTP_FROM,
        to: message.name ? `"${message.name}" <${message.to}>` : message.to,
        subject: message.subject,
        text: message.body,
      });
      return { ok: true };
    } catch (error) {
      logger.error('smtp_send_failed', { to: message.to, error: (error as Error).message });
      return { ok: false, error: (error as Error).message };
    }
  },
};
