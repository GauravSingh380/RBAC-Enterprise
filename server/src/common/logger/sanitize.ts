// Makes request/response bodies safe and small enough to log.
import { env } from '../../config/env.js';

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;
const MAX_STRING = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 6;

function clean(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(${value.length} chars)` : value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[Object]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => clean(v, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…${value.length - MAX_ARRAY_ITEMS} more items`);
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : clean(v, depth + 1);
  }
  return result;
}

/** Redacts secrets (password, tokens, ...) and truncates large payloads. */
export function sanitizeForLog(value: unknown): unknown {
  if (value === undefined) return undefined;
  const cleaned = clean(value, 0);
  const text = JSON.stringify(cleaned) ?? '';
  if (text.length <= env.log.maxBodyLength) return cleaned;
  return { truncated: true, size: text.length, preview: text.slice(0, env.log.maxBodyLength) };
}
