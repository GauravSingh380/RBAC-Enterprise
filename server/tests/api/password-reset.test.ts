import { describe, expect, it } from 'vitest';
import { lastEmailTo, publicApi, registerOwner, runJobs, uniqueEmail } from '../helpers.js';

const extractToken = (html: string) => /reset-password\?token=([A-Za-z0-9_-]+)/.exec(html)?.[1];

describe('password reset', () => {
  it('answers the same for unknown emails (no account enumeration)', async () => {
    const res = await publicApi().post('/api/auth/forgot-password').send({ email: uniqueEmail('nobody') });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('If an account exists');
  });

  it('full flow: email link → reset → old password and old sessions stop working', async () => {
    const owner = await registerOwner();
    await runJobs();

    const forgot = await publicApi().post('/api/auth/forgot-password').send({ email: owner.email });
    expect(forgot.status).toBe(200);
    await runJobs();

    const email = await lastEmailTo(owner.email);
    expect(email?.template).toBe('passwordReset');
    expect(email?.status).toBe('sent');
    const token = extractToken(email!.html)!;
    expect(token).toBeTruthy();

    const check = await publicApi().get(`/api/auth/reset-password/${token}`);
    expect(check.body.data.valid).toBe(true);
    expect(check.body.data.email).toContain('*'); // masked

    const reset = await publicApi().post('/api/auth/reset-password').send({ token, password: 'brandNew123' });
    expect(reset.status).toBe(204);

    // single use
    const again = await publicApi().post('/api/auth/reset-password').send({ token, password: 'another123' });
    expect(again.status).toBe(400);

    // old password fails, new works
    expect((await publicApi().post('/api/auth/login').send({ email: owner.email, password: owner.password })).status).toBe(401);
    expect((await publicApi().post('/api/auth/login').send({ email: owner.email, password: 'brandNew123' })).status).toBe(200);

    // sessions created before the reset are revoked
    expect((await publicApi().post('/api/auth/refresh').set('Cookie', owner.cookie)).status).toBe(401);

    await runJobs();
    expect((await lastEmailTo(owner.email))?.template).toBe('passwordChanged');
  });

  it('only the newest reset link works', async () => {
    const owner = await registerOwner();
    await publicApi().post('/api/auth/forgot-password').send({ email: owner.email });
    const first = extractToken((await lastEmailTo(owner.email))!.html)!;
    await publicApi().post('/api/auth/forgot-password').send({ email: owner.email });
    const second = extractToken((await lastEmailTo(owner.email))!.html)!;

    expect((await publicApi().get(`/api/auth/reset-password/${first}`)).body.data.valid).toBe(false);
    expect((await publicApi().get(`/api/auth/reset-password/${second}`)).body.data.valid).toBe(true);
  });

  it('change password: requires the current one and keeps this session only', async () => {
    const owner = await registerOwner();
    const other = await publicApi().post('/api/auth/login').send({ email: owner.email, password: owner.password });
    const otherCookie = (other.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const wrong = await owner.api.post('/auth/change-password', { currentPassword: 'wrong1234', newPassword: 'changed123' });
    expect(wrong.status).toBe(400);

    const ok = await owner.api
      .post('/auth/change-password', { currentPassword: owner.password, newPassword: 'changed123' })
      .set('Cookie', owner.cookie);
    expect(ok.status).toBe(204);

    expect((await publicApi().post('/api/auth/refresh').set('Cookie', owner.cookie)).status).toBe(200); // this device kept
    expect((await publicApi().post('/api/auth/refresh').set('Cookie', otherCookie)).status).toBe(401); // other device out
  });
});
