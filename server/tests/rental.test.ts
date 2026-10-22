import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bootstrapOwner, login } from './helpers.js';

let cookie = '';

const property = {
  name: 'Test House',
  address: '12 Test Street, Kigali',
  type: 'HOUSE',
  monthlyRent: 250000,
  deposit: 250000,
};

describe('rental workflow', () => {
  beforeAll(async () => {
    await bootstrapOwner();
    cookie = await login();
  });

  it('starts with no properties', async () => {
    const res = await request(app).get('/api/properties').set('Cookie', cookie).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('creates a property and returns it in the list', async () => {
    const created = await request(app).post('/api/properties').set('Cookie', cookie).send(property).expect(201);
    expect(created.body.property).toMatchObject({ name: property.name, status: 'AVAILABLE' });

    const listed = await request(app).get('/api/properties').set('Cookie', cookie).expect(200);
    expect(listed.body.data.map((row: { id: string }) => row.id)).toContain(created.body.property.id);
  });

  it('rejects a negative rent amount', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Cookie', cookie)
      .send({ ...property, name: 'Bad House', monthlyRent: -1 })
      .expect(422);
    expect(res.body.error).toBeTruthy();
  });

  it('does not accept the derived OCCUPIED status from the client', async () => {
    await request(app)
      .post('/api/properties')
      .set('Cookie', cookie)
      .send({ ...property, name: 'Occupied House', status: 'OCCUPIED' })
      .expect(422);
  });

  it('reports amounts in the configured currency', async () => {
    const settings = await request(app).get('/api/settings').set('Cookie', cookie).expect(200);
    expect(settings.body.currency).toBe('RWF');

    const summary = await request(app).get('/api/dashboard/summary').set('Cookie', cookie).expect(200);
    expect(summary.body.currency).toBe('RWF');
  });

  it('deletes a property', async () => {
    const created = await request(app).post('/api/properties').set('Cookie', cookie).send(property).expect(201);
    await request(app).delete(`/api/properties/${created.body.property.id}`).set('Cookie', cookie).expect(204);
    await request(app).get(`/api/properties/${created.body.property.id}`).set('Cookie', cookie).expect(404);
  });
});
