import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { recordAudit } from '../../lib/audit.js';
import { conflict, forbidden, tooMany, unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { plain } from '../../lib/serialize.js';
import { generateRefreshToken, hashToken, refreshExpiry, signAccessToken } from './tokens.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so failed logins cost the same either way.
const DUMMY_HASH = bcrypt.hashSync('hrms-invalid-credential-placeholder', BCRYPT_ROUNDS);

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  owner: { id: string; email: string; fullName: string; phone: string | null };
};

const lockMinutesRemaining = (lockedUntil: Date): number =>
  Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);

/**
 * Creates the single owner account from env on an empty database. There is no
 * tenant login and no public registration anywhere in this system.
 */
export const ensureBootstrapOwner = async (): Promise<{ created: boolean; email?: string }> => {
  const existing = await prisma.owner.count();
  if (existing > 0) return { created: false };

  const email = env.OWNER_BOOTSTRAP_EMAIL?.toLowerCase();
  const password = env.OWNER_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    logger.warn('owner_bootstrap_skipped', {
      reason: 'OWNER_BOOTSTRAP_EMAIL / OWNER_BOOTSTRAP_PASSWORD not set',
    });
    return { created: false };
  }

  await prisma.owner.create({
    data: {
      email,
      fullName: env.OWNER_BOOTSTRAP_NAME,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    },
  });
  await recordAudit({ ownerId: null, action: 'auth.owner_bootstrap', entityType: 'owner', summary: email });
  logger.info('owner_bootstrap_created', { email });
  return { created: true, email };
};

const registerFailure = async (ownerId: string): Promise<void> => {
  const owner = await prisma.owner.findUnique({ where: { id: ownerId }, select: { failedLoginCount: true } });
  const attempts = (owner?.failedLoginCount ?? 0) + 1;
  const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;
  await prisma.owner.update({
    where: { id: ownerId },
    data: {
      failedLoginCount: attempts,
      lockedUntil: shouldLock
        ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000)
        : undefined,
    },
  });
};

export const login = async (
  email: string,
  password: string,
  req: Request,
): Promise<LoginResult> => {
  const owner = await prisma.owner.findUnique({ where: { email } });

  if (owner?.lockedUntil && owner.lockedUntil > new Date()) {
    await recordAudit({
      ownerId: owner.id,
      action: 'auth.login_locked',
      entityType: 'owner',
      entityId: owner.id,
      req,
    });
    throw tooMany(`Too many failed attempts. Try again in ${lockMinutesRemaining(owner.lockedUntil)} minute(s).`);
  }

  const passwordMatches = await bcrypt.compare(password, owner?.passwordHash ?? DUMMY_HASH);

  if (!owner || !passwordMatches) {
    if (owner) await registerFailure(owner.id);
    await recordAudit({
      ownerId: owner?.id ?? null,
      action: 'auth.login_failed',
      entityType: 'owner',
      entityId: owner?.id ?? null,
      summary: `failed login for ${email}`,
      req,
    });
    throw unauthorized('Invalid email or password');
  }

  const refreshToken = generateRefreshToken();
  const [updated] = await Promise.all([
    prisma.owner.update({
      where: { id: owner.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        ownerId: owner.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiry(),
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    }),
  ]);

  await recordAudit({
    ownerId: owner.id,
    action: 'auth.login',
    entityType: 'owner',
    entityId: owner.id,
    req,
  });

  return {
    accessToken: signAccessToken({ sub: owner.id, email: owner.email, name: owner.fullName }),
    refreshToken,
    owner: plain({
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      phone: updated.phone,
    }),
  };
};

/** Rotates the refresh token and detects reuse of a token that was already revoked. */
export const refreshSession = async (token: string, req: Request): Promise<LoginResult> => {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    if (stored?.revokedAt) {
      // Reuse of a rotated token: treat the whole account's sessions as compromised.
      await prisma.refreshToken.updateMany({
        where: { ownerId: stored.ownerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit({
        ownerId: stored.ownerId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'owner',
        entityId: stored.ownerId,
        req,
      });
    }
    throw unauthorized('Session expired, please sign in again');
  }

  const nextRefreshToken = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        ownerId: stored.ownerId,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: refreshExpiry(),
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    }),
  ]);

  return {
    accessToken: signAccessToken({
      sub: stored.ownerId,
      email: stored.owner.email,
      name: stored.owner.fullName,
    }),
    refreshToken: nextRefreshToken,
    owner: plain({
      id: stored.owner.id,
      email: stored.owner.email,
      fullName: stored.owner.fullName,
      phone: stored.owner.phone,
    }),
  };
};

export const logout = async (token: string | undefined, ownerId: string | null): Promise<void> => {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit({ ownerId, action: 'auth.logout', entityType: 'owner', entityId: ownerId });
};

export const changePassword = async (
  ownerId: string,
  currentPassword: string,
  newPassword: string,
  req: Request,
): Promise<void> => {
  const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
  if (!owner) throw unauthorized();
  if (!(await bcrypt.compare(currentPassword, owner.passwordHash))) {
    await recordAudit({
      ownerId,
      action: 'auth.password_change_failed',
      entityType: 'owner',
      entityId: ownerId,
      req,
    });
    throw forbidden('Current password is incorrect');
  }
  if (await bcrypt.compare(newPassword, owner.passwordHash)) {
    throw conflict('New password must be different from the current one');
  }

  await prisma.$transaction([
    prisma.owner.update({
      where: { id: ownerId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), failedLoginCount: 0, lockedUntil: null },
    }),
    // Every other device must sign in again with the new password.
    prisma.refreshToken.updateMany({
      where: { ownerId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({ ownerId, action: 'auth.password_change', entityType: 'owner', entityId: ownerId, req });
};

export const getProfile = async (ownerId: string) => {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: { id: true, email: true, fullName: true, phone: true, lastLoginAt: true, createdAt: true },
  });
  if (!owner) throw unauthorized();
  return plain(owner);
};

export const updateProfile = async (
  ownerId: string,
  data: { fullName?: string; phone?: string | null },
  req: Request,
) => {
  const before = await getProfile(ownerId);
  const owner = await prisma.owner.update({
    where: { id: ownerId },
    data,
    select: { id: true, email: true, fullName: true, phone: true, lastLoginAt: true, createdAt: true },
  });
  await recordAudit({
    ownerId,
    action: 'owner.profile_update',
    entityType: 'owner',
    entityId: ownerId,
    before,
    after: plain(owner),
    req,
  });
  return plain(owner);
};

export const activeSessionCount = async (ownerId: string): Promise<number> =>
  prisma.refreshToken.count({ where: { ownerId, revokedAt: null, expiresAt: { gt: new Date() } } });

export const revokeAllSessions = async (ownerId: string): Promise<number> => {
  const result = await prisma.refreshToken.updateMany({
    where: { ownerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    ownerId,
    action: 'auth.revoke_all_sessions',
    entityType: 'owner',
    entityId: ownerId,
    summary: `${result.count} session(s) revoked`,
  });
  return result.count;
};
