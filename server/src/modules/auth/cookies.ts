import type { CookieOptions } from 'express';
import { env } from '../../config/env.js';

export const accessCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
  maxAge: 15 * 60 * 1000,
});

export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});
