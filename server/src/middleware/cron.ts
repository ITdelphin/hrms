import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';

const matches = (provided: string): boolean => {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Guards scheduled endpoints that run without an owner session. */
export const requireCronSecret = (req: Request, _res: Response, next: NextFunction): void => {
  if (!env.CRON_SECRET) return next(forbidden('Cron scheduling is not configured'));

  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const sharedSecret = req.headers['x-cron-secret'];
  const provided = bearer ?? (typeof sharedSecret === 'string' ? sharedSecret : undefined);

  if (!provided || !matches(provided)) return next(unauthorized('Invalid cron credentials'));
  next();
};
