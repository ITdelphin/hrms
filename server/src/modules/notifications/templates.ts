import { monthLabel, toIsoDate } from '../../lib/date.js';
import { formatAmount } from '../../lib/settings.js';
import { greeting } from './provider.js';

type Money = { amount: number; currency: string };

export const rentReminderTemplate = (
  input: Money & { tenantName: string; propertyName: string; dueDate: Date; balance: number },
) => ({
  subject: `Rent due ${monthLabel(...toPeriod(input.dueDate))} for ${input.propertyName}`,
  body: [
    `Hello ${greeting(input.tenantName)},`,
    '',
    `Rent of ${formatAmount(input.amount, input.currency)} for ${input.propertyName} is due on ${toIsoDate(input.dueDate)}.`,
    `Outstanding balance for the month: ${formatAmount(input.balance, input.currency)}.`,
    '',
    'You can pay by MPesa, bank transfer or cash at the office. Thank you.',
    '— Property management',
  ].join('\n'),
});

export const rentOverdueTemplate = (
  input: Money & { tenantName: string; propertyName: string; dueDate: Date; balance: number; daysLate: number },
) => ({
  subject: `Overdue rent (${input.daysLate} day(s)) — ${input.propertyName}`,
  body: [
    `Hello ${greeting(input.tenantName)},`,
    '',
    `Rent of ${formatAmount(input.amount, input.currency)} for ${input.propertyName} was due on ${toIsoDate(input.dueDate)} and is now ${input.daysLate} day(s) overdue.`,
    `Amount still owed: ${formatAmount(input.balance, input.currency)}.`,
    '',
    'Please settle at your earliest convenience to avoid further reminders.',
    '— Property management',
  ].join('\n'),
});

export const tenantReceiptTemplate = (
  input: Money & { tenantName: string; propertyName: string; year: number; month: number; balance: number; method: string },
) => ({
  subject: `Payment received — ${monthLabel(input.year, input.month)}`,
  body: [
    `Hello ${greeting(input.tenantName)},`,
    '',
    `We received ${formatAmount(input.amount, input.currency)} towards rent for ${input.propertyName} (${monthLabel(input.year, input.month)}) via ${input.method}.`,
    `Remaining balance for the month: ${formatAmount(input.balance, input.currency)}.`,
    '',
    'Thank you.',
  ].join('\n'),
});

export const ownerPaymentAlertTemplate = (
  input: Money & { ownerName: string; tenantName: string; propertyName: string; year: number; month: number; balance: number; method: string; paidOn: Date },
) => ({
  subject: `Rent received: ${input.tenantName} — ${monthLabel(input.year, input.month)}`,
  body: [
    `Hello ${greeting(input.ownerName, 'Owner')},`,
    '',
    `${formatAmount(input.amount, input.currency)} received from ${input.tenantName} for ${input.propertyName} (${monthLabel(input.year, input.month)}) via ${input.method} on ${toIsoDate(input.paidOn)}.`,
    input.balance > 0
      ? `This month is PARTIALLY paid — ${formatAmount(input.balance, input.currency)} still outstanding.`
      : `This month is now FULLY paid.`,
  ].join('\n'),
});

export const ownerDigestTemplate = (input: {
  ownerName: string;
  currency: string;
  upcoming: number;
  upcomingTotal: number;
  overdue: number;
  overdueTotal: number;
  lines: string[];
}) => ({
  subject: `Daily rent digest — ${input.overdue} overdue, ${input.upcoming} due soon`,
  body: [
    `Hello ${greeting(input.ownerName, 'Owner')},`,
    '',
    `Due within the reminder window: ${input.upcoming} month(s), ${formatAmount(input.upcomingTotal, input.currency)} expected.`,
    `Overdue: ${input.overdue} month(s), ${formatAmount(input.overdueTotal, input.currency)} outstanding.`,
    '',
    ...(input.lines.length ? input.lines : ['Nothing outstanding.']),
  ].join('\n'),
});

const toPeriod = (date: Date): [number, number] => [date.getUTCFullYear(), date.getUTCMonth() + 1];
