import { describe, expect, it } from 'vitest';
import { lastEmailTo, publicApi, registerOwner, runJobs, uniqueEmail } from '../helpers.js';

describe('auth', () => {
  it('signup creates an organization, owner role, and queues a welcome email', async () => {
    const owner = await registerOwner('Acme Auth');
    const me = await owner.api.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.isOwner).toBe(true);
    expect(me.body.data.organization.name).toBe('Acme Auth');

    await runJobs();
    const email = await lastEmailTo(owner.email);
    expect(email?.template).toBe('welcome');
    expect(email?.status).toBe('sent');
  });

  it('rejects wrong passwords and validates input', async () => {
    const owner = await registerOwner();
    const wrong = await publicApi().post('/api/auth/login').send({ email: owner.email, password: 'nope12345' });
    expect(wrong.status).toBe(401);
    const weak = await publicApi()
      .post('/api/auth/register')
      .send({ name: 'Weak', email: uniqueEmail('weak'), password: 'short', organizationName: 'X Org' });
    expect(weak.status).toBe(400);
  });

  it('rotates refresh tokens and revokes everything when an old token is reused', async () => {
    const owner = await registerOwner();
    const first = await publicApi().post('/api/auth/refresh').set('Cookie', owner.cookie);
    expect(first.status).toBe(200);
    const rotated = (first.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const reuse = await publicApi().post('/api/auth/refresh').set('Cookie', owner.cookie);
    expect(reuse.status).toBe(401);
    const afterReuse = await publicApi().post('/api/auth/refresh').set('Cookie', rotated);
    expect(afterReuse.status).toBe(401); // whole family revoked
  });

  it('updates the own profile name', async () => {
    const owner = await registerOwner();
    const res = await owner.api.patch('/auth/me', { name: 'Renamed Person' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Person');
  });
});
