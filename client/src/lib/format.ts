let currencyCode = 'USD';

export const setCurrency = (code: string) => {
  currencyCode = code || 'USD';
};

export const getCurrency = () => currencyCode;

export const formatMoney = (value: number | null | undefined, code = currencyCode): string => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatNumber = (value: number | null | undefined): string =>
  new Intl.NumberFormat('en-US').format(Number(value ?? 0));

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** "2025-07" -> "Jul 2025" */
export const formatPeriod = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
};

export const monthOfPeriod = (period: string): { year: number; month: number } => {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
};

export const todayInput = (): string => new Date().toISOString().slice(0, 10);
