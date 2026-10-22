import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens.js';
import { unauthorized } from '../lib/errors.js';

export type SessionOwner = { id: string; email: string; name: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      owner?: SessionOwner;
    }
  }
}

const bearerToken = (header?: string): string | undefined => {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

export const resolveToken = (req: Request): string | undefined => {
  const fromHeader = bearerToken(req.headers.authorization);
  if (fromHeader) return fromHeader;
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  return cookies?.[ACCESS_COOKIE];
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = resolveToken(req);
  if (!token) return next(unauthorized());
  try {
    const claims = verifyAccessToken(token);
    req.owner = { id: claims.sub, email: claims.email, name: claims.name };
    next();
  } catch {
    next(unauthorized());
  }
};

/** Handlers that already know the owner id (e.g. audit writes) can read it without a null check. */
export const currentOwner = (req: Request): SessionOwner => {
  if (!req.owner) throw unauthorized();
  return req.owner;
};
