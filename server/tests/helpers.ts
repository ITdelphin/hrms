import request from 'supertest';
import { createApp } from '../src/app.js';
import { ensureBootstrapOwner } from '../src/modules/auth/auth.service.js';
import { ACCESS_COOKIE } from '../src/modules/auth/tokens.js';

export const app = createApp();

export const bootstrapOwner = async (): Promise<void> => {
  await ensureBootstrapOwner();
};

export const ownerEmail = (): string => process.env.OWNER_BOOTSTRAP_EMAIL as string;
export const ownerPassword = (): string => process.env.OWNER_BOOTSTRAP_PASSWORD as string;

/** Returns the access cookie value, which is what every protected route reads. */
export const loginCookies = async (): Promise<string[]> => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ownerEmail(), password: ownerPassword() })
    .expect(200);
  const cookies = res.headers['set-cookie'] ?? [];
  if (!cookies.some((cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`))) {
    throw new Error('login did not set an access cookie');
  }
  return cookies.map((cookie) => cookie.split(';')[0]);
};

export const login = async (): Promise<string> => {
  const access = (await loginCookies()).find((cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`));
  return access as string;
};
