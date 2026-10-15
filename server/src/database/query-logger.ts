// Records every SQL query (text, params, duration, rows) against the API request that ran it.
// The http logger prints them under the request line in the console and stores them in the
// log files. Queries outside a request (startup, scripts) are logged at "debug" level.
import { env } from '../config/env.js';
import { getLogContext, type LogContext, type QueryLog } from '../common/logger/context.js';
import { logger } from '../common/logger/logger.js';
import { interpolateSql } from '../common/logger/sql-format.js';

type QueryFn = (...args: any[]) => any;

const instrumented = new WeakSet<object>();

/** Collapses whitespace so multi-line SQL becomes one readable line. */
export const oneLineSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

// Never write secrets that are passed as query params (bcrypt hashes, token hashes, long blobs)
function sanitizeParam(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (/^\$2[aby]\$\d{2}\$/.test(value)) return '[REDACTED:hash]';
  if (/^[a-f0-9]{64}$/i.test(value)) return '[REDACTED:token]';
  if (value.length > 200) return `${value.slice(0, 200)}…(${value.length} chars)`;
  return value;
}

function record(ctx: LogContext | undefined, entry: QueryLog) {
  if (entry.params?.length) entry.statement = oneLineSql(interpolateSql(entry.sql, entry.params));
  if (ctx) ctx.queries.push(entry);
  else logger.debug(`SQL ${entry.durationMs}ms ${oneLineSql(entry.sql)}`, { type: 'db', ...entry });

  if (entry.durationMs >= env.log.slowQueryMs) {
    logger.warn(`Slow query (${entry.durationMs}ms): ${oneLineSql(entry.sql).slice(0, 300)}`, {
      type: 'db',
      durationMs: entry.durationMs,
    });
  }
}

/**
 * Wraps `target.query` (a pg Pool or a transaction client) so each call is timed and recorded.
 * The request context is read at call time, so queries are always attributed to the right request.
 */
export function instrumentQueries<T extends { query: QueryFn }>(target: T): T {
  if (!env.log.sql || instrumented.has(target)) return target;
  instrumented.add(target);

  const original = target.query.bind(target) as QueryFn;
  target.query = ((...args: any[]) => {
    const ctx = getLogContext();
    const config = args[0];
    const sql: string = typeof config === 'string' ? config : (config?.text ?? '');
    const values: unknown[] | undefined = Array.isArray(args[1]) ? args[1] : config?.values;
    const start = performance.now();
    const elapsed = () => Math.round((performance.now() - start) * 10) / 10;
    const params = env.log.sqlParams && values?.length ? values.map(sanitizeParam) : undefined;

    const result = original(...args);
    if (result && typeof result.then === 'function') {
      result.then(
        (res: { rowCount?: number | null }) => record(ctx, { sql, params, durationMs: elapsed(), rowCount: res?.rowCount }),
        (err: Error) => record(ctx, { sql, params, durationMs: elapsed(), error: err.message }),
      );
    }
    return result;
  }) as T['query'];

  return target;
}
