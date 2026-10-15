import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../../src/common/logger/sanitize.js';

describe('sanitizeForLog', () => {
  it('redacts secrets at any depth', () => {
    const out = sanitizeForLog({ email: 'a@b.c', password: 'x', nested: { accessToken: 't', list: [{ apiKey: 'k' }] } }) as any;
    expect(out.email).toBe('a@b.c');
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.accessToken).toBe('[REDACTED]');
    expect(out.nested.list[0].apiKey).toBe('[REDACTED]');
  });

  it('truncates very large payloads', () => {
    const out = sanitizeForLog({ items: Array.from({ length: 500 }, (_, i) => ({ i, text: 'x'.repeat(200) })) }) as any;
    expect(out.truncated).toBe(true);
  });
});
