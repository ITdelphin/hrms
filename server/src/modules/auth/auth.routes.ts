import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler, unauthorized } from '../../lib/errors.js';
import { currentOwner, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import {
  accessCookieOptions,
  refreshCookieOptions,
} from './cookies.js';
import { REFRESH_COOKIE, ACCESS_COOKIE } from './tokens.js';
import {
  activeSessionCount,
  changePassword,
  getProfile,
  login,
  logout,
  refreshSession,
  revokeAllSessions,
  updateProfile,
} from './auth.service.js';
import { changePasswordSchema, loginSchema, updateProfileSchema } from './auth.schemas.js';

export const authRouter = Router();

const setSessionCookies = (res: import('express').Response, accessToken: string, refreshToken: string) => {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
};

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const result = await login(email, password, req);
    setSessionCookies(res, result.accessToken, result.refreshToken);
    res.json({ owner: result.owner });
  }),
);

authRouter.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const token = (req as { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('Missing refresh token');
    const result = await refreshSession(token, req);
    setSessionCookies(res, result.accessToken, result.refreshToken);
    res.json({ owner: result.owner });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req as { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    await logout(token, req.owner?.id ?? null);
    res.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions(), maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = currentOwner(req);
    res.json({
      owner: await getProfile(owner.id),
      sessions: await activeSessionCount(owner.id),
      notificationProvider: env.NOTIFICATION_PROVIDER,
    });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const owner = currentOwner(req);
    res.json({ owner: await updateProfile(owner.id, req.body, req) });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const owner = currentOwner(req);
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    await changePassword(owner.id, currentPassword, newPassword, req);
    res.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions(), maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.status(204).send();
  }),
);

authRouter.post(
  '/sessions/revoke',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = currentOwner(req);
    const count = await revokeAllSessions(owner.id);
    res.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions(), maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ revoked: count });
  }),
);
