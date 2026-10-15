// Per-request storage that follows async calls, so every log line
// written while handling a request carries its requestId / userId / organizationId,
// and every SQL query run for the request is collected in one place.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface QueryLog {
  sql: string;
  params?: unknown[];
  /** The query with parameter values filled in — copy/paste into pgAdmin or psql. */
  statement?: string;
  durationMs: number;
  rowCount?: number | null;
  error?: string;
}

export interface LogContext {
  requestId: string;
  userId?: number;
  organizationId?: number;
  queries: QueryLog[];
}

export const logContext = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext | undefined {
  return logContext.getStore();
}
