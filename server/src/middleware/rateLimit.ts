import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  // Auth responses must not vary by anything the limiter infers from the body.
  // IPv6 has to be bucketed by subnet, or a single client can bypass the limit with new addresses.
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? 'unknown'),
};

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

export const refreshLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

export const reportLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 30,
});

export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
});
