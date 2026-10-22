export type YearMonth = { year: number; month: number };

export const startOfTodayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const toUtcDate = (value: Date | string): Date => {
  const d = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const toIsoDate = (value: Date | string): string => toUtcDate(value).toISOString().slice(0, 10);

export const daysBetween = (from: Date | string, to: Date | string): number => {
  const a = toUtcDate(from).getTime();
  const b = toUtcDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
};

export const monthLabel = (year: number, month: number): string =>
  new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

export const shortMonthLabel = (year: number, month: number): string =>
  new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

export const yearMonthOf = (date: Date): YearMonth => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
});

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Clamp a lease due-day into the target month (e.g. dueDay 31 in February). */
export const dueDateFor = (year: number, month: number, dueDay: number): Date =>
  new Date(Date.UTC(year, month - 1, Math.min(Math.max(dueDay, 1), daysInMonth(year, month))));

export const addMonths = (value: Date, months: number): Date => {
  const d = toUtcDate(value);
  const day = d.getUTCDate();
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  shifted.setUTCDate(Math.min(day, daysInMonth(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1)));
  return shifted;
};

export const monthRange = (from: Date, to: Date): YearMonth[] => {
  const start = yearMonthOf(toUtcDate(from));
  const end = yearMonthOf(toUtcDate(to));
  const out: YearMonth[] = [];
  let cursor = start;
  let guard = 0;
  while (guard < 1200) {
    out.push(cursor);
    if (cursor.year === end.year && cursor.month === end.month) break;
    cursor = cursor.month === 12 ? { year: cursor.year + 1, month: 1 } : { year: cursor.year, month: cursor.month + 1 };
    guard += 1;
  }
  return out;
};

export const currentYearMonth = (): YearMonth => yearMonthOf(startOfTodayUtc());
