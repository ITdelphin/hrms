import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { app, bootstrapOwner, login, loginCookies, ownerEmail } from './helpers.js';

describe('auth', () => {
  beforeAll(async () => {
    await bootstrapOwner();
  });

  it('reports the database as reachable', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/properties').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('issues a session cookie for the owner credentials', async () => {
    const cookie = await login();
    expect(cookie.startsWith('hrms_access=')).toBe(true);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(res.body.owner.email).toBe(ownerEmail());
  });

  it('rejects a wrong password without leaking the account', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerEmail(), password: 'definitely-not-the-password' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');

    await prisma.owner.update({ where: { email: ownerEmail() }, data: { failedLoginCount: 0, lockedUntil: null } });
  });

  it('refuses to create a second owner', async () => {
    const before = await prisma.owner.count();
    await bootstrapOwner();
    expect(await prisma.owner.count()).toBe(before);
  });

  it('revokes the refresh session on logout', async () => {
    const jar = (await loginCookies()).join('; ');
    await request(app).post('/api/auth/logout').set('Cookie', jar).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', jar).expect(401);
  });
});
