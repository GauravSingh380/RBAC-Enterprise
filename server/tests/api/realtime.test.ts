// Phase 2d: realtime stream (SSE + LISTEN/NOTIFY) — authentication, delivery, access filtering.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let server: http.Server;
let baseUrl: string;
let owner: TestUser;
let outsider: TestUser; // org member, NOT a member of the private project
let publicKey: string;
let privateKey: string;

interface Stream {
  events: { event: string; data: any }[];
  status: number;
  close: () => void;
  waitFor: (pred: (e: { event: string; data: any }) => boolean, ms?: number) => Promise<{ event: string; data: any }>;
}

/** Minimal SSE client (what the browser's EventSource does). */
function openStream(ticket: string): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/realtime/stream?ticket=${encodeURIComponent(ticket)}`, (res) => {
      const events: Stream['events'] = [];
      const waiters: { pred: (e: Stream['events'][number]) => boolean; done: (e: Stream['events'][number]) => void }[] = [];
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!event || !data) continue;
          const e = { event, data: JSON.parse(data) };
          events.push(e);
          for (const w of [...waiters]) if (w.pred(e)) (waiters.splice(waiters.indexOf(w), 1), w.done(e));
        }
      });
      const stream: Stream = {
        events,
        status: res.statusCode ?? 0,
        close: () => req.destroy(),
        waitFor: (pred, ms = 3000) =>
          new Promise((ok, fail) => {
            const found = events.find(pred);
            if (found) return ok(found);
            const timer = setTimeout(() => fail(new Error('timed out waiting for event')), ms);
            waiters.push({ pred, done: (e) => (clearTimeout(timer), ok(e)) });
          }),
      };
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(stream);
      }
      stream.waitFor((e) => e.event === 'ready').then(() => resolve(stream), reject);
    });
    req.on('error', reject);
  });
}

const ticketFor = async (user: TestUser) => (await user.api.post('/realtime/ticket')).body.data.ticket as string;

beforeAll(async () => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = await registerOwner('Realtime Org');
  outsider = await addMember(owner, 'developer', 'Outsider');
  publicKey = uniqueKey();
  privateKey = uniqueKey();
  await owner.api.post('/projects', { name: 'Public', key: publicKey, visibility: 'organization' });
  await owner.api.post('/projects', { name: 'Private', key: privateKey, visibility: 'private' });
});

afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe('realtime', () => {
  it('requires a valid ticket (an access token is not a ticket)', async () => {
    expect((await openStream('nonsense')).status).toBe(401);
    expect((await openStream(owner.token)).status).toBe(401);
    const res = await owner.api.post('/realtime/ticket');
    expect(res.status).toBe(200);
    expect(res.body.data.expiresIn).toBe(60);
    // ...and a ticket is not an access token
    const asBearer = await owner.api.get('/auth/me');
    expect(asBearer.status).toBe(200);
    const misuse = await (await import('supertest')).default(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.ticket}`);
    expect(misuse.status).toBe(401);
  });

  it('delivers item changes to everyone who can see the project — and only to them', async () => {
    const ownerStream = await openStream(await ticketFor(owner));
    const outsiderStream = await openStream(await ticketFor(outsider));
    try {
      const pub = (await owner.api.post(`/projects/${publicKey}/items`, { type: 'task', title: 'Visible' }).set('X-Client-Id', 'tab-1')).body.data;
      const priv = (await owner.api.post(`/projects/${privateKey}/items`, { type: 'task', title: 'Secret' })).body.data;

      const seenByOwner = await ownerStream.waitFor((e) => e.event === 'items' && e.data.itemIds.includes(priv.id));
      expect(seenByOwner.data).toMatchObject({ action: 'created', actorId: owner.id });
      const seenPublic = await outsiderStream.waitFor((e) => e.event === 'items' && e.data.itemIds.includes(pub.id));
      expect(seenPublic.data).toMatchObject({ action: 'created', clientId: 'tab-1' });
      expect(JSON.stringify(seenPublic.data)).not.toContain('Visible'); // ids only, never content

      // give the private event time to (not) arrive
      await owner.api.patch(`/work-items/${pub.id}`, { title: 'Marker' });
      await outsiderStream.waitFor((e) => e.event === 'items' && e.data.action === 'updated' && e.data.itemIds.includes(pub.id));
      expect(outsiderStream.events.some((e) => e.event === 'items' && e.data.itemIds?.includes(priv.id))).toBe(false);
    } finally {
      ownerStream.close();
      outsiderStream.close();
    }
  });

  it('streams sprint events', async () => {
    const stream = await openStream(await ticketFor(owner));
    try {
      const sprint = (await owner.api.post(`/projects/${publicKey}/sprints`, {})).body.data;
      const e = await stream.waitFor((x) => x.event === 'sprints' && x.data.sprintId === sprint.id);
      expect(e.data.action).toBe('created');
    } finally {
      stream.close();
    }
  });

  it('does not leak events across organizations', async () => {
    const otherOwner = await registerOwner('Another Org');
    const stream = await openStream(await ticketFor(otherOwner));
    try {
      const item = (await owner.api.post(`/projects/${publicKey}/items`, { type: 'task', title: 'Other org' })).body.data;
      const marker = uniqueKey();
      await otherOwner.api.post('/projects', { name: 'Own', key: marker });
      const own = (await otherOwner.api.post(`/projects/${marker}/items`, { type: 'task', title: 'Own item' })).body.data;
      await stream.waitFor((e) => e.event === 'items' && e.data.itemIds.includes(own.id));
      expect(stream.events.some((e) => e.event === 'items' && e.data.itemIds.includes(item.id))).toBe(false);
    } finally {
      stream.close();
    }
  });
});
