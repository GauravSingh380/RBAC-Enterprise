import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { getLogContext } from '../logger/context.js';
import { logger } from '../logger/logger.js';
import { sanitizeForLog } from '../logger/sanitize.js';

const SKIP_PATHS = new Set(['/api/health']);

/**
 * Logs every API request and its response:
 *   --> POST /api/auth/login               (method, url, ip, user agent, query, body)
 *   <-- POST /api/auth/login 200 35.2ms    (status, duration, size, user, body)
 * 5xx responses are logged as "error", 4xx as "warn", everything else as "http".
 * Sensitive fields (password, tokens, cookies) are always redacted.
 */
export const httpLogger: RequestHandler = (req, res, next) => {
  if (SKIP_PATHS.has(req.path)) return next();

  const start = process.hrtime.bigint();
  // never write short-lived secrets in URLs (realtime stream ticket) to the logs
  const url = req.originalUrl.replace(/([?&]ticket=)[^&]+/, '$1[REDACTED]');
  const logCtx = getLogContext();
  const requestId = logCtx?.requestId;
  const logBodies = env.log.httpBodies;

  logger.http(`--> ${req.method} ${url}`, {
    type: 'http',
    direction: 'request',
    requestId,
    method: req.method,
    url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    query: Object.keys(req.query).length ? req.query : undefined,
    body: logBodies && req.body && Object.keys(req.body).length ? sanitizeForLog(req.body) : undefined,
  });

  // Capture the JSON body that the controller sends
  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };

  const durationMs = () => Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;

  res.on('finish', () => {
    if (res.locals.stream) return; // logged on 'close'
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'http';
    const ms = durationMs();
    const queries = logCtx?.queries ?? [];
    const dbTimeMs = Math.round(queries.reduce((sum, q) => sum + q.durationMs, 0) * 10) / 10;

    logger.log(level, `<-- ${req.method} ${url} ${status} ${ms}ms`, {
      type: 'http',
      direction: 'response',
      requestId,
      userId: req.user?.id,
      organizationId: req.tenant?.organizationId,
      method: req.method,
      url,
      status,
      durationMs: ms,
      contentLength: Number(res.get('content-length') ?? 0),
      errorMessage: status >= 400 ? (responseBody as { message?: string } | undefined)?.message : undefined,
      queryCount: queries.length,
      dbTimeMs,
      queries: env.log.sql && queries.length ? queries : undefined,
      body: logBodies ? sanitizeForLog(responseBody) : undefined,
    });

    if (ms > env.log.slowRequestMs) {
      logger.warn(`Slow request: ${req.method} ${url} took ${ms}ms`, { requestId, durationMs: ms });
    }
  });

  res.on('close', () => {
    if (res.locals.stream) {
      // Server-Sent Events: a long-lived response that normally ends when the browser goes away
      logger.http(`<-- ${req.method} ${url} stream closed after ${Math.round(durationMs() / 1000)}s`, { type: 'http', direction: 'response', requestId });
      return;
    }
    if (!res.writableFinished) {
      logger.warn(`xx> ${req.method} ${url} aborted by client after ${durationMs()}ms`, {
        type: 'http',
        direction: 'aborted',
        requestId,
      });
    }
  });

  next();
};
