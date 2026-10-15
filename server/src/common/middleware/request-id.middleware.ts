import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logContext } from '../logger/context.js';

/**
 * Gives every request an id (reuses a valid incoming X-Request-Id, e.g. from a gateway),
 * returns it in the X-Request-Id response header, and makes it available to the logger.
 * Mount AFTER the body/cookie parsers so the async context is not lost.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  res.setHeader('X-Request-Id', id);
  logContext.run({ requestId: id, queries: [] }, () => next());
};
