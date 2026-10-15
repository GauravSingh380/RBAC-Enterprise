// Production error capture — reuses what the logging system already knows about a request.
//
//   server: errorHandler (500) ──▶ captureServerError(err, req)
//   browser: POST /api/client-errors ──▶ captureClientError(report, ...)
//
// Each occurrence is UPSERTed into error_groups by fingerprint (count + last seen) and stored as an
// error_events row with its context: request id (→ the matching lines in logs/http-*.log), route,
// user, release and — for server errors — the SQL statements the request ran just before failing.
//
// Rules:
//   * capture NEVER throws and never slows the response (runs after the 500 is sent)
//   * a RESOLVED group that happens again is re-opened ("regressed") and its linked bug gets a history event
//   * IGNORED groups keep counting but stay ignored
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { db } from '../../database/db.js';
import { getLogContext } from '../../common/logger/context.js';
import { logger } from '../../common/logger/logger.js';
import { recordEvents } from '../work-items/work-item-events.js';
import { membersWithPermission, notify } from '../notifications/notify.js';
import { clientTopFrame, fingerprint, normalizeMessage, routePattern, serverTopFrame } from './fingerprint.js';

const KEEP_EVENTS = 100; // newest occurrences kept per group
const PRUNE_EVERY = 25; // occurrences between clean-ups

interface Occurrence {
  organizationId: number | null;
  source: 'server' | 'client';
  fingerprint: string;
  title: string;
  culprit: string | null;
  message: string;
  stack: string | null;
  requestId: string | null;
  userId: number | null;
  method: string | null;
  url: string | null;
  userAgent: string | null;
  release: string | null;
  context: Record<string, unknown>;
}

export async function captureServerError(err: unknown, req: Request): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const route = routePattern(req.originalUrl, typeof req.route?.path === 'string' ? req.route.path : undefined); // "/api/projects/:projectRef/items"
    const logCtx = getLogContext();
    // the last statements of this request (the failing one is usually the last) — straight from the SQL logger
    const queries = (logCtx?.queries ?? []).slice(-5).map((q) => ({
      sql: q.statement ?? q.sql.replace(/\s+/g, ' ').trim(),
      durationMs: q.durationMs,
      error: q.error,
    }));
    const frame = serverTopFrame(e.stack);
    await record({
      organizationId: req.tenant?.organizationId ?? null,
      source: 'server',
      fingerprint: fingerprint(['server', e.name, normalizeMessage(e.message), frame, req.method, route]),
      title: `${e.name}: ${e.message}`.slice(0, 500),
      culprit: `${req.method} ${route}`.slice(0, 500),
      message: e.message.slice(0, 5000),
      stack: e.stack?.slice(0, 16000) ?? null,
      requestId: logCtx?.requestId ?? null,
      userId: req.user?.id ?? null,
      method: req.method,
      url: req.originalUrl.replace(/([?&](ticket|token)=)[^&]+/g, '$1[REDACTED]').slice(0, 2000),
      userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
      release: env.appVersion,
      context: { route, frame, code: (e as { code?: string }).code, queries, environment: env.nodeEnv },
    });
  } catch (captureErr) {
    logger.warn(`Error capture failed: ${(captureErr as Error).message}`);
  }
}

export interface ClientReport {
  source: string;
  name?: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent?: string;
  release?: string;
  errorId: string;
}

export async function captureClientError(report: ClientReport, who: { userId: number | null; organizationId: number | null }): Promise<void> {
  try {
    const frame = clientTopFrame(report.stack);
    const name = report.name || 'Error';
    let path = report.url;
    try {
      path = new URL(report.url).pathname;
    } catch {
      /* keep as is */
    }
    await record({
      organizationId: who.organizationId,
      source: 'client',
      fingerprint: fingerprint(['client', name, normalizeMessage(report.message), frame]),
      title: `${name}: ${report.message}`.slice(0, 500),
      culprit: (frame ?? path).slice(0, 500),
      message: report.message.slice(0, 5000),
      stack: report.stack?.slice(0, 16000) ?? null,
      requestId: report.errorId,
      userId: who.userId,
      method: null,
      url: report.url.slice(0, 2000),
      userAgent: report.userAgent?.slice(0, 500) ?? null,
      release: report.release ?? null,
      context: { kind: report.source, frame, componentStack: report.componentStack?.slice(0, 8000), page: path },
    });
  } catch (captureErr) {
    logger.warn(`Client error capture failed: ${(captureErr as Error).message}`);
  }
}

async function record(o: Occurrence): Promise<void> {
  const { rows } = await db.query<{ id: number; occurrences: number; workItemId: number | null; regressed: boolean; created: boolean }>(
    `INSERT INTO error_groups (organization_id, source, fingerprint, title, culprit, occurrences, last_release)
     VALUES ($1, $2, $3, $4, $5, 1, $6)
     ON CONFLICT ((COALESCE(organization_id, 0)), source, fingerprint) DO UPDATE
        SET occurrences  = error_groups.occurrences + 1,
            last_seen_at = NOW(),
            title        = EXCLUDED.title,
            last_release = COALESCE(EXCLUDED.last_release, error_groups.last_release),
            status       = CASE WHEN error_groups.status = 'resolved' THEN 'unresolved' ELSE error_groups.status END,
            regressed_at = CASE WHEN error_groups.status = 'resolved' THEN NOW() ELSE error_groups.regressed_at END
     RETURNING id, occurrences, work_item_id AS "workItemId", (regressed_at IS NOT NULL AND regressed_at = NOW()) AS regressed,
               (xmax = 0) AS created -- xmax = 0: the row was inserted, not updated`,
    [o.organizationId, o.source, o.fingerprint, o.title, o.culprit, o.release],
  );
  const group = rows[0]!;

  await db.query(
    `INSERT INTO error_events (group_id, request_id, user_id, method, url, message, stack, user_agent, release, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [group.id, o.requestId, o.userId, o.method, o.url, o.message, o.stack, o.userAgent, o.release, JSON.stringify(o.context)],
  );
  if (group.occurrences % PRUNE_EVERY === 0) {
    await db.query(
      `DELETE FROM error_events WHERE group_id = $1
          AND id < (SELECT id FROM error_events WHERE group_id = $1 ORDER BY id DESC OFFSET $2 LIMIT 1)`,
      [group.id, KEEP_EVENTS - 1],
    );
  }

  if (group.regressed && group.workItemId && o.organizationId) {
    // the bug was fixed (or the error resolved) but it is happening again → visible in the bug's history
    await recordEvents(db, { id: group.workItemId, organizationId: o.organizationId }, null, [
      { type: 'error_regressed', newValue: { groupId: group.id, occurrences: group.occurrences, release: o.release } },
    ]);
  }
  // people who work the inbox (errors.manage) hear about NEW problems and regressions — not every occurrence
  if (o.organizationId && (group.created || group.regressed)) {
    const watchers = group.workItemId
      ? (await db.query<{ userId: number }>('SELECT user_id AS "userId" FROM work_item_watchers WHERE work_item_id = $1', [group.workItemId])).rows.map((w) => w.userId)
      : [];
    await notify(db, {
      organizationId: o.organizationId,
      userIds: [...(await membersWithPermission(db, o.organizationId, 'errors.manage')), ...(group.regressed ? watchers : [])],
      actorId: null,
      type: group.created ? 'error_new' : 'error_regressed',
      title: group.created ? `New ${o.source === 'server' ? 'server' : 'browser'} error: ${o.title}` : `Regression: ${o.title} is back`,
      body: o.culprit,
      url: `/errors/${group.id}`,
    });
  }
  logger.info(`Production error recorded (${o.source}) group #${group.id} ×${group.occurrences}${group.regressed ? ' — REGRESSION' : ''}`, {
    errorGroupId: group.id,
  });
}
