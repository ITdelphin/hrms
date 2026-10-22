const isDecimal = (value: unknown): value is { toNumber: () => number } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { toNumber?: unknown }).toNumber === 'function';

/** Prisma returns Decimal wrappers and Dates; JSON-friendly numbers/strings keep the API simple. */
export const plain = <T>(value: T): T => {
  if (isDecimal(value)) return value.toNumber() as T;
  if (Array.isArray(value)) return value.map((item) => plain(item)) as T;
  if (value instanceof Date) return value as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      out[key] = plain(raw);
    }
    return out as T;
  }
  return value;
};
