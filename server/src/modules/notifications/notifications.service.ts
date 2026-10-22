import type { NotificationChannel, NotificationEvent, NotificationStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { daysBetween } from '../../lib/date.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getCurrency, formatAmount } from '../../lib/settings.js';
import { plain } from '../../lib/serialize.js';
import { outstandingOf } from '../payments/ledger.js';
import { getProvider, providerStatus } from './registry.js';
import type { OutgoingMessage } from './provider.js';
import {
  ownerDigestTemplate,
  ownerPaymentAlertTemplate,
  rentOverdueTemplate,
  rentReminderTemplate,
  tenantReceiptTemplate,
} from './templates.js';

type DispatchInput = {
  event: NotificationEvent;
  to: string | null | undefined;
  name?: string | null;
  subject: string;
  body: string;
  tenantId?: string | null;
  rentScheduleId?: string | null;
  dedupeKey?: string;
};

type DispatchOutcome = { id: string; status: string; channel: NotificationChannel; reason?: string };

/**
 * Every message is written to the notifications table first, so reminders are
 * auditable and a failed delivery is visible instead of silently lost.
 */
export const dispatch = async (input: DispatchInput): Promise<DispatchOutcome> => {
  const provider = getProvider();

  if (input.dedupeKey) {
    const seen = await prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (seen) {
      return { id: seen.id, status: 'DUPLICATE', channel: seen.channel, reason: 'already sent for this period' };
    }
  }

  const channel: NotificationChannel = provider.canDeliver(input.to) ? (provider.name === 'smtp' ? 'EMAIL' : 'CONSOLE') : 'CONSOLE';

  if (!input.to) {
    const row = await prisma.notification.create({
      data: {
        event: input.event,
        channel: 'CONSOLE',
        recipient: '(no recipient)',
        recipientName: input.name ?? null,
        subject: input.subject,
        body: input.body,
        status: 'SKIPPED',
        error: 'Recipient has no email address on file',
        tenantId: input.tenantId ?? null,
        rentScheduleId: input.rentScheduleId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
    return { id: row.id, status: 'SKIPPED', channel: 'CONSOLE', reason: 'no email on file' };
  }

  const message: OutgoingMessage = { to: input.to, name: input.name, subject: input.subject, body: input.body };
  const row = await prisma.notification.create({
    data: {
      event: input.event,
      channel,
      recipient: input.to,
      recipientName: input.name ?? null,
      subject: input.subject,
      body: input.body,
      status: 'PENDING',
      tenantId: input.tenantId ?? null,
      rentScheduleId: input.rentScheduleId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    },
  });

  const result = await provider.send(message);

  const updated = await prisma.notification.update({
    where: { id: row.id },
    data: {
      status: result.ok ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED',
      error: result.error ?? result.skipped ?? null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  return { id: updated.id, status: updated.status, channel: updated.channel, reason: result.error ?? result.skipped };
};

const ownerContact = async (ownerId?: string | null) => {
  const owner = ownerId
    ? await prisma.owner.findUnique({ where: { id: ownerId }, select: { email: true, fullName: true } })
    : await prisma.owner.findFirst({ select: { email: true, fullName: true }, orderBy: { createdAt: 'asc' } });
  return owner ?? { email: env.OWNER_BOOTSTRAP_EMAIL ?? null, fullName: env.OWNER_BOOTSTRAP_NAME };
};

export type PaymentNotificationInput = {
  ownerId: string;
  tenant: { id: string; name: string; phone: string };
  propertyName: string;
  period: { year: number; month: number };
  amount: number;
  method: string;
  balance: number;
  paidAt: Date;
};

/** Owner alert + tenant receipt, called after a payment commits. */
export const notifyPaymentReceived = async (input: PaymentNotificationInput): Promise<void> => {
  try {
    const currency = await getCurrency();
    const owner = await ownerContact(input.ownerId);

    const alert = ownerPaymentAlertTemplate({
      ownerName: owner.fullName,
      currency,
      tenantName: input.tenant.name,
      propertyName: input.propertyName,
      year: input.period.year,
      month: input.period.month,
      amount: input.amount,
      balance: input.balance,
      method: input.method,
      paidOn: input.paidAt,
    });

    await dispatch({
      event: 'PAYMENT_RECEIVED',
      to: owner.email,
      name: owner.fullName,
      subject: alert.subject,
      body: alert.body,
      tenantId: input.tenant.id,
      dedupeKey: `payment-received:${input.tenant.id}:${input.period.year}-${input.period.month}:${input.amount}:${Date.now()}`,
    });

    const schedule = await prisma.rentSchedule.findFirst({
      where: { lease: { tenantId: input.tenant.id }, periodYear: input.period.year, periodMonth: input.period.month },
      include: { lease: { include: { tenant: { select: { email: true, fullName: true } } } } },
    });

    const tenantEmail = schedule?.lease.tenant.email;
    if (tenantEmail) {
      const receipt = tenantReceiptTemplate({
        tenantName: schedule.lease.tenant.fullName,
        currency,
        propertyName: input.propertyName,
        year: input.period.year,
        month: input.period.month,
        amount: input.amount,
        balance: input.balance,
        method: input.method,
      });
      await dispatch({
        event: 'PAYMENT_RECEIVED',
        to: tenantEmail,
        name: schedule.lease.tenant.fullName,
        subject: receipt.subject,
        body: receipt.body,
        tenantId: input.tenant.id,
        rentScheduleId: schedule.id,
        dedupeKey: `receipt:${schedule.id}:${Date.now()}`,
      });
    }
  } catch (error) {
    logger.error('payment_notification_failed', { tenantId: input.tenant.id, error: (error as Error).message });
  }
};

export type ReminderSummary = {
  windowDays: number;
  upcoming: { count: number; total: number; delivered: number };
  overdue: { count: number; total: number; delivered: number };
  owner: { status: string } | null;
};

/**
 * Daily job body: reminds tenants whose rent is due within
 * REMINDER_DAYS_BEFORE_DUE, chases overdue months, and sends the owner one digest.
 */
export const runRentReminders = async (): Promise<ReminderSummary> => {
  const currency = await getCurrency();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(today.getTime() + env.REMINDER_DAYS_BEFORE_DUE * 86_400_000);
  const dayKey = today.toISOString().slice(0, 10);

  const [upcoming, overdue] = await Promise.all([
    prisma.rentSchedule.findMany({
      where: {
        status: { not: 'PAID' },
        dueDate: { gte: today, lte: windowEnd },
        lease: { status: 'ACTIVE', tenant: { deletedAt: null } },
      },
      include: { lease: { include: { tenant: true, property: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.rentSchedule.findMany({
      where: {
        status: { not: 'PAID' },
        dueDate: { lt: today },
        lease: { status: 'ACTIVE', tenant: { deletedAt: null } },
      },
      include: { lease: { include: { tenant: true, property: true } } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  let upcomingTotal = 0;
  let upcomingDelivered = 0;
  for (const schedule of upcoming) {
    const balance = outstandingOf(schedule);
    upcomingTotal += balance;
    const propertyLabel = `${schedule.lease.property.name}${schedule.lease.property.unitNumber ? ` #${schedule.lease.property.unitNumber}` : ''}`;
    const message = rentReminderTemplate({
      tenantName: schedule.lease.tenant.fullName,
      propertyName: propertyLabel,
      amount: Number(schedule.amount),
      balance,
      dueDate: schedule.dueDate,
      currency,
    });
    const sent = await dispatch({
      event: 'RENT_REMINDER',
      to: schedule.lease.tenant.email,
      name: schedule.lease.tenant.fullName,
      subject: message.subject,
      body: message.body,
      tenantId: schedule.lease.tenantId,
      rentScheduleId: schedule.id,
      dedupeKey: `reminder:${schedule.id}:${dayKey}`,
    });
    if (sent.status === 'SENT' || sent.status === 'DUPLICATE') upcomingDelivered += 1;
  }

  let overdueTotal = 0;
  let overdueDelivered = 0;
  const digestLines: string[] = [];
  for (const schedule of overdue) {
    const balance = outstandingOf(schedule);
    overdueTotal += balance;
    const daysLate = Math.max(0, daysBetween(schedule.dueDate, today));
    const propertyLabel = `${schedule.lease.property.name}${schedule.lease.property.unitNumber ? ` #${schedule.lease.property.unitNumber}` : ''}`;
    digestLines.push(
      `• ${schedule.lease.tenant.fullName} — ${propertyLabel} — ${schedule.periodYear}-${String(schedule.periodMonth).padStart(2, '0')} — ${formatAmount(balance, currency)} (${daysLate} day(s) late)`,
    );

    const message = rentOverdueTemplate({
      tenantName: schedule.lease.tenant.fullName,
      propertyName: propertyLabel,
      amount: Number(schedule.amount),
      balance,
      dueDate: schedule.dueDate,
      daysLate,
      currency,
    });
    const sent = await dispatch({
      event: 'RENT_OVERDUE',
      to: schedule.lease.tenant.email,
      name: schedule.lease.tenant.fullName,
      subject: message.subject,
      body: message.body,
      tenantId: schedule.lease.tenantId,
      rentScheduleId: schedule.id,
      dedupeKey: `overdue:${schedule.id}:${dayKey}`,
    });
    if (sent.status === 'SENT' || sent.status === 'DUPLICATE') overdueDelivered += 1;
  }

  const owner = await ownerContact(null);
  const digest = ownerDigestTemplate({
    ownerName: owner.fullName,
    currency,
    upcoming: upcoming.length,
    upcomingTotal: Math.round(upcomingTotal * 100) / 100,
    overdue: overdue.length,
    overdueTotal: Math.round(overdueTotal * 100) / 100,
    lines: digestLines.slice(0, 40),
  });
  const ownerSent = await dispatch({
    event: 'RENT_OVERDUE',
    to: owner.email,
    name: owner.fullName,
    subject: digest.subject,
    body: digest.body,
    dedupeKey: `digest:${dayKey}`,
  });

  return {
    windowDays: env.REMINDER_DAYS_BEFORE_DUE,
    upcoming: { count: upcoming.length, total: Math.round(upcomingTotal * 100) / 100, delivered: upcomingDelivered },
    overdue: { count: overdue.length, total: Math.round(overdueTotal * 100) / 100, delivered: overdueDelivered },
    owner: { status: ownerSent.status },
  };
};

export const listNotifications = async (input: {
  page: number;
  pageSize: number;
  event?: NotificationEvent;
  status?: NotificationStatus;
}) => {
  const where = {
    ...(input.event ? { event: input.event } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      include: { tenant: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  return { data: plain(rows), meta: { total, page: input.page, pageSize: input.pageSize, pages: Math.max(1, Math.ceil(total / input.pageSize)) } };
};

export const sendTestMessage = async (to: string): Promise<DispatchOutcome> => {
  const provider = getProvider();
  return dispatch({
    event: 'RENT_REMINDER',
    to,
    name: 'Test recipient',
    subject: `[HRMS] Test message from ${provider.name} provider`,
    body: `This is a test notification sent through the "${provider.name}" provider at ${new Date().toISOString()}.\n\nProvider status: ${JSON.stringify(providerStatus())}`,
  });
};
