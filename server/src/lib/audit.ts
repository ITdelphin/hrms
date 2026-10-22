import type { Request } from 'express';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

export type AuditInput = {
  ownerId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  req?: Request;
};

/** Audit rows may never contain credentials, even in before/after snapshots. */
const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      out[key] = /password|token|secret|authorization|hash/i.test(key) ? '[redacted]' : redact(raw);
    }
    return out;
  }
  return value;
};

export const recordAudit = async (input: AuditInput): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        ownerId: input.ownerId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: input.before === undefined ? undefined : (redact(input.before) as object),
        after: input.after === undefined ? undefined : (redact(input.after) as object),
        ip: input.req?.ip ?? null,
        userAgent: input.req?.get('user-agent') ?? null,
      },
    });
  } catch (error) {
    logger.error('audit_write_failed', { action: input.action, error: (error as Error).message });
  }
};
