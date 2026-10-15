// Human-friendly console output for development. Files always keep full JSON detail.
//
//   10:21:33.120 ✓ GET    /api/users?page=1  200  12.3ms  · user #1 · 2 queries 4.1ms  6698e1de
//      ├─ #1  1.2ms · 1 row
//            SELECT u.id, u.name, u.email
//              FROM users u
//             WHERE u.id = 1
//      └─ #2  2.9ms · 13 rows
//            SELECT name FROM permissions ORDER BY name
//
//   10:21:41.500 INFO  Server running on http://localhost:5000
import type { Logform } from 'winston';
import { env } from '../../config/env.js';
import type { QueryLog } from './context.js';
import { formatSql, highlightSql, interpolateSql } from './sql-format.js';

const useColor = process.stdout.isTTY || !!process.env.FORCE_COLOR;
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;
type Color = keyof typeof ANSI;

const paint = (color: Color, text: string) => (useColor ? `${ANSI[color]}${text}${ANSI.reset}` : text);

const LEVEL_COLORS: Record<string, Color> = { error: 'red', warn: 'yellow', info: 'green', http: 'cyan', verbose: 'blue', debug: 'magenta' };
const METHOD_COLORS: Record<string, Color> = { GET: 'blue', POST: 'green', PUT: 'yellow', PATCH: 'yellow', DELETE: 'red' };

const INDENT = '   ';
const MAX_SQL_LINES = 14;

// Keys that are shown in a dedicated way (or are noise) and should not be repeated as key=value
const HIDDEN_KEYS = new Set([
  'level', 'message', 'timestamp', 'service', 'env', 'type', 'requestId', 'stack', 'componentStack', 'direction',
]);

function time(timestamp: unknown) {
  const d = new Date(String(timestamp));
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return paint('gray', `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}`);
}

const shortId = (id: unknown) => (id ? paint('gray', String(id).slice(0, 8)) : '');

function statusColor(status: number): Color {
  if (status >= 500) return 'red';
  if (status >= 400) return 'yellow';
  if (status >= 300) return 'cyan';
  return 'green';
}

function durationText(ms: number) {
  const text = ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms * 10) / 10}ms`;
  return paint(ms >= 1000 ? 'red' : ms >= 300 ? 'yellow' : 'gray', text);
}

/** Indented, dimmed block (stack traces etc.), limited to `maxLines`. */
function block(text: string, maxLines: number) {
  const lines = text.trim().split('\n');
  const shown = lines.slice(0, maxLines).map((l) => `${INDENT}${paint('gray', l.trim())}`);
  if (lines.length > maxLines) shown.push(`${INDENT}${paint('gray', `… ${lines.length - maxLines} more lines`)}`);
  return `\n${shown.join('\n')}`;
}

/** Usable width for SQL text: terminal width minus the tree gutter. */
function sqlWidth() {
  return Math.max(60, Math.min(140, (process.stdout.columns ?? 120) - 12));
}

function queryHeader(q: QueryLog, index: number) {
  const number = `#${index + 1}`;
  if (q.error) return `${paint('red', `${number}  ✖ ${q.durationMs}ms`)}  ${paint('red', q.error)}`;

  const slow = q.durationMs >= env.log.slowQueryMs;
  const duration = paint(slow ? 'yellow' : 'gray', `${q.durationMs}ms${slow ? ' (slow)' : ''}`);
  const rows =
    q.rowCount !== undefined && q.rowCount !== null ? paint('gray', ` · ${q.rowCount} row${q.rowCount === 1 ? '' : 's'}`) : '';
  return `${paint('magenta', number)}  ${duration}${rows}`;
}

// Draws the queries of one request as a small tree under the request line
function formatQueries(queries: QueryLog[]) {
  const width = sqlWidth();

  return queries
    .map((q, i) => {
      const last = i === queries.length - 1;
      const branch = paint('gray', last ? `${INDENT}└─ ` : `${INDENT}├─ `);
      // Plain spaces only (no "│") so a copied query is valid SQL as-is
      const gutter = `${INDENT}      `;

      // Show real values instead of $1, $2 … (display only)
      let lines = formatSql(interpolateSql(q.sql, q.params), width);
      if (lines.length > MAX_SQL_LINES) {
        const hidden = lines.length - MAX_SQL_LINES;
        lines = [...lines.slice(0, MAX_SQL_LINES), `… ${hidden} more lines (full query in logs/http-*.log)`];
      }
      const body = lines.map((l) => `${gutter}${useColor ? highlightSql(l, paint) : l}`).join('\n');
      return `${branch}${queryHeader(q, i)}\n${body}`;
    })
    .join('\n');
}

function formatHttp(info: Logform.TransformableInfo) {
  const status = Number(info.status);
  const method = String(info.method);
  const color = statusColor(status);
  const icon = paint(color, status >= 500 ? '✖' : status >= 400 ? '!' : '✓');
  const queries = (info.queries as QueryLog[] | undefined) ?? [];
  const queryCount = Number(info.queryCount ?? queries.length);

  const extras: string[] = [];
  if (info.organizationId) extras.push(`org #${info.organizationId}`);
  if (info.userId) extras.push(`user #${info.userId}`);
  if (queryCount) extras.push(`${queryCount} ${queryCount === 1 ? 'query' : 'queries'} ${info.dbTimeMs}ms`);

  let line =
    `${time(info.timestamp)} ${icon} ${paint(METHOD_COLORS[method] ?? 'gray', method.padEnd(6))} ` +
    `${info.url}  ${paint(color, String(status))}  ${durationText(Number(info.durationMs))}` +
    `${extras.length ? paint('gray', `  · ${extras.join(' · ')}`) : ''}  ${shortId(info.requestId)}`;

  if (status >= 400 && info.errorMessage) line += `\n${INDENT}${paint(color, `↳ ${info.errorMessage}`)}`;
  // Queries as a tree, then a blank line so each request block stands apart
  if (env.log.sqlConsole && queries.length) line += `\n${formatQueries(queries)}\n`;
  return line;
}

function formatGeneric(info: Logform.TransformableInfo) {
  const level = String(info.level);
  const label = paint(LEVEL_COLORS[level] ?? 'gray', level.toUpperCase().padEnd(5));

  // Show small scalar details inline (key=value); objects stay in the log files
  const details = Object.entries(info)
    .filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== undefined && v !== null && typeof v !== 'object')
    .map(([k, v]) => `${k}=${String(v).length > 80 ? `${String(v).slice(0, 80)}…` : v}`);

  let line = `${time(info.timestamp)} ${label} ${info.message}`;
  if (details.length) line += paint('gray', `  ${details.join('  ')}`);
  if (info.requestId) line += `  ${shortId(info.requestId)}`;
  if (typeof info.stack === 'string') line += block(info.stack, 10);
  if (typeof info.componentStack === 'string') line += block(`Component stack:\n${info.componentStack}`, 8);
  return line;
}

// 10:21:35.001 ⚙ JOB    email.send #12  completed  41ms · attempt 1/5 · 2 queries 3ms  job-12
function formatJob(info: Logform.TransformableInfo) {
  const outcome = String(info.outcome);
  const color: Color = outcome === 'completed' ? 'green' : outcome === 'retry' ? 'yellow' : 'red';
  const queries = (info.queries as QueryLog[] | undefined) ?? [];
  const extras = [`attempt ${info.attempt}/${info.maxAttempts}`];
  if (info.organizationId) extras.push(`org #${info.organizationId}`);
  if (queries.length) extras.push(`${queries.length} ${queries.length === 1 ? 'query' : 'queries'} ${info.dbTimeMs}ms`);

  let line =
    `${time(info.timestamp)} ${paint(color, '⚙')} ${paint('cyan', 'JOB'.padEnd(6))} ${info.queue} #${info.jobId}  ` +
    `${paint(color, outcome)}  ${durationText(Number(info.durationMs))}${paint('gray', `  · ${extras.join(' · ')}`)}`;
  if (info.error) line += `\n${INDENT}${paint(color, `↳ ${info.error}`)}`;
  if (env.log.sqlConsole && queries.length) line += `\n${formatQueries(queries)}\n`;
  return line;
}

export function formatConsoleLine(info: Logform.TransformableInfo): string {
  if (info.type === 'http' && info.direction === 'response') return formatHttp(info);
  if (info.type === 'job') return formatJob(info);
  return formatGeneric(info);
}
