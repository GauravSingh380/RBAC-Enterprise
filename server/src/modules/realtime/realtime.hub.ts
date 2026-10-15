// Realtime updates: Server-Sent Events (SSE) + PostgreSQL LISTEN/NOTIFY.
//
//   browser ──EventSource──▶ GET /api/realtime/stream   (one long-lived HTTP response per tab)
//
//   a service changes data ──▶ publish(event) ──▶ SELECT pg_notify('tf_events', json)
//                                                          │
//            every API instance LISTENs on 'tf_events' ◀───┘   (works with 1 or 20 servers)
//                         │
//                         └──▶ writes the event to its OWN connected streams that may see the project
//
// Why this design:
//   * SSE is plain HTTP (no extra protocol / library), auto-reconnects, and we only need server → browser.
//   * NOTIFY goes through the database we already have, so several server instances behind a load
//     balancer all receive every event — no Redis needed at this size.
//   * Events are tiny "something changed" signals (ids only, no titles). The browser re-fetches
//     through the normal APIs, which apply all access rules. Nothing sensitive travels on the stream.
import pg from 'pg';
import type { Response } from 'express';
import { env } from '../../config/env.js';
import { db } from '../../database/db.js';
import { logger } from '../../common/logger/logger.js';
import { logContext } from '../../common/logger/context.js';
import { HttpException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { getProjectAccess } from '../projects/project-access.js';
import { rbacService } from '../rbac/rbac.service.js';

const CHANNEL = 'tf_events';
const HEARTBEAT_MS = 25_000; // proxies close idle connections after ~30-60s; a comment line keeps it open
const REVALIDATE_EVERY = 10; // heartbeats (~4 min): drop streams of removed members / disabled accounts
const ACCESS_CACHE_MS = 30_000;
const MAX_STREAMS_PER_USER = 10;

export type RealtimeAction = 'created' | 'updated' | 'deleted' | 'moved' | 'commented' | 'started' | 'completed';

export interface RealtimeEvent {
  /** what changed: work items, sprints, saved views or test runs of a project — or someone's notifications */
  type: 'items' | 'sprints' | 'views' | 'tests' | 'notifications';
  action: RealtimeAction;
  organizationId: number;
  projectId: number;
  itemIds?: number[];
  sprintId?: number;
  runId?: number;
  /** notifications: only these users receive the event */
  userIds?: number[];
  actorId: number | null;
  /** browser tab that made the change (X-Client-Id) — it already has the result */
  clientId: string | null;
  at: string;
}

interface Subscriber {
  id: number;
  res: Response;
  ctx: RequestContext;
  access: Map<number, { ok: boolean; at: number }>;
}

class RealtimeHub {
  private subscribers = new Set<Subscriber>();
  private listener: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private beats = 0;
  private nextId = 1;
  private stopped = false;

  get connectionCount() {
    return this.subscribers.size;
  }

  /** Publishes an event to every server instance (call it AFTER the transaction committed). */
  async publish(event: Omit<RealtimeEvent, 'at'>): Promise<void> {
    const payload = JSON.stringify({ ...event, itemIds: event.itemIds?.slice(0, 500), at: new Date().toISOString() });
    try {
      await db.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]);
    } catch (err) {
      // realtime is "best effort": never fail the user's request because of it
      logger.warn(`Realtime publish failed: ${(err as Error).message}`);
    }
  }

  /** Turns `res` into an SSE stream for this user + organization. Resolves once the stream is open. */
  async subscribe(res: Response, ctx: RequestContext): Promise<() => void> {
    const userId = ctx.user!.id;
    const open = [...this.subscribers].filter((s) => s.ctx.user!.id === userId).length;
    if (open >= MAX_STREAMS_PER_USER) throw new HttpException(429, 'Too many open realtime connections');

    this.stopped = false;
    await this.ensureListening();

    res.locals.stream = true;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: do not buffer the stream
    });
    res.write('retry: 5000\n\n'); // the browser reconnects 5s after a drop

    const sub: Subscriber = { id: this.nextId++, res, ctx, access: new Map() };
    this.subscribers.add(sub);
    this.send(sub, 'ready', { connectionId: sub.id });
    this.startHeartbeat();
    logger.debug(`Realtime: stream #${sub.id} opened (user #${userId}, org #${ctx.tenant!.organizationId}), ${this.subscribers.size} open`);

    return () => {
      if (!this.subscribers.delete(sub)) return;
      logger.debug(`Realtime: stream #${sub.id} closed, ${this.subscribers.size} open`);
      if (!this.subscribers.size) this.stopHeartbeat();
    };
  }

  /** Closes every stream and the LISTEN connection (graceful shutdown, tests). */
  async stop(): Promise<void> {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const sub of this.subscribers) sub.res.end();
    this.subscribers.clear();
    const listener = this.listener;
    this.listener = null;
    if (listener) await listener.end().catch(() => undefined);
  }

  // ---------------------------------------------------------------- internals

  private async ensureListening(): Promise<void> {
    if (this.listener) return;
    // exit() — the LISTEN connection lives forever and must not belong to the request that opened it
    // (otherwise every later query would be logged under that request id)
    this.connecting ??= logContext.exit(() => this.connect()).finally(() => (this.connecting = null));
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ ...env.db, application_name: 'team-flex-realtime' });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        void this.dispatch(JSON.parse(msg.payload) as RealtimeEvent);
      } catch {
        logger.warn('Realtime: ignored a malformed notification');
      }
    });
    client.on('error', (err) => logger.warn(`Realtime: LISTEN connection error: ${err.message}`));
    client.on('end', () => this.onListenerLost(client));
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    this.listener = client;
    logger.info(`Realtime: listening on PostgreSQL channel "${CHANNEL}"`);
  }

  /** The database connection dropped (DB restart, network): reconnect and tell browsers to refresh. */
  private onListenerLost(client: pg.Client) {
    if (this.listener !== client) return;
    this.listener = null;
    logger.warn('Realtime: LISTEN connection lost');
    this.scheduleReconnect();
  }

  private scheduleReconnect(delayMs = 2000) {
    if (this.stopped || !this.subscribers.size) return; // the next subscriber connects again
    this.reconnectTimer = setTimeout(() => {
      this.ensureListening()
        // events may have been missed while disconnected → browsers re-fetch what they show
        .then(() => this.subscribers.forEach((s) => this.send(s, 'resync', {})))
        .catch((err) => {
          logger.error(`Realtime: reconnect failed: ${(err as Error).message}`);
          this.scheduleReconnect(Math.min(delayMs * 2, 30_000));
        });
    }, delayMs);
    this.reconnectTimer.unref();
  }

  private async dispatch(event: RealtimeEvent) {
    const now = Date.now();
    for (const sub of this.subscribers) {
      if (sub.ctx.tenant!.organizationId !== event.organizationId) continue;
      if (event.type === 'notifications') {
        // personal: only the recipients, no project involved
        if (event.userIds?.includes(sub.ctx.user!.id)) this.send(sub, event.type, { type: event.type, at: event.at });
        continue;
      }
      let cached = sub.access.get(event.projectId);
      if (!cached || now - cached.at > ACCESS_CACHE_MS) {
        // same rule as the REST API: private projects only for their members
        const ok = await getProjectAccess(sub.ctx, event.projectId).then(
          () => true,
          () => false,
        );
        cached = { ok, at: now };
        sub.access.set(event.projectId, cached);
      }
      if (cached.ok) this.send(sub, event.type, event);
    }
  }

  private send(sub: Subscriber, event: string, data: unknown) {
    if (sub.res.writableEnded) return;
    sub.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private startHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = logContext.exit(() =>
      setInterval(() => {
        this.beats++;
        for (const sub of this.subscribers) if (!sub.res.writableEnded) sub.res.write(': ping\n\n');
        if (this.beats % REVALIDATE_EVERY === 0) void this.revalidate();
      }, HEARTBEAT_MS),
    );
    this.heartbeat.unref();
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /** Long-lived streams outlive the 60s ticket: re-check the account and membership now and then. */
  private async revalidate() {
    for (const sub of this.subscribers) {
      const userId = sub.ctx.user!.id;
      const [user, tenant] = await Promise.all([
        rbacService.getAuthUser(userId),
        rbacService.getMembership(userId, sub.ctx.tenant!.organizationId),
      ]).catch(() => [null, null] as const);
      if (!user || !tenant) {
        this.send(sub, 'revoked', {});
        sub.res.end();
        this.subscribers.delete(sub);
      } else {
        sub.ctx = { ...sub.ctx, user, tenant }; // pick up role / permission changes
        sub.access.clear();
      }
    }
  }
}

export const realtime = new RealtimeHub();

/** Helper for services: "these work items of this project changed". */
export function publishItems(
  ctx: RequestContext,
  project: { id: number; organizationId: number },
  action: RealtimeAction,
  itemIds: number[],
) {
  return realtime.publish({
    type: 'items',
    action,
    organizationId: project.organizationId,
    projectId: project.id,
    itemIds,
    actorId: ctx.user?.id ?? null,
    clientId: ctx.clientId ?? null,
  });
}

export function publishSprints(
  ctx: RequestContext,
  project: { id: number; organizationId: number },
  action: RealtimeAction,
  sprintId: number,
) {
  return realtime.publish({
    type: 'sprints',
    action,
    organizationId: project.organizationId,
    projectId: project.id,
    sprintId,
    actorId: ctx.user?.id ?? null,
    clientId: ctx.clientId ?? null,
  });
}
