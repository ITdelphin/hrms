import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';

export const ACCESS_COOKIE = 'hrms_access';
export const REFRESH_COOKIE = 'hrms_refresh';

export type OwnerClaims = { sub: string; email: string; name: string };

export const signAccessToken = (claims: OwnerClaims): string =>
  jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'hrms',
    audience: 'hrms-owner',
  });

export const verifyAccessToken = (token: string): OwnerClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'hrms', audience: 'hrms-owner' });
    if (typeof payload === 'string' || !('sub' in payload)) throw new Error('malformed');
    return { sub: String(payload.sub), email: String(payload.email ?? ''), name: String(payload.name ?? '') };
  } catch {
    throw unauthorized('Session expired or invalid');
  }
};

/** Opaque, high-entropy refresh token; only its SHA-256 digest is persisted. */
export const generateRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const refreshExpiry = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
