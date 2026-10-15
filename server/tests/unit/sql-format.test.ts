import { describe, expect, it } from 'vitest';
import { formatSql, interpolateSql } from '../../src/common/logger/sql-format.js';

describe('interpolateSql', () => {
  it('replaces $n with literal values', () => {
    expect(interpolateSql('SELECT * FROM t WHERE id = $1 AND name = $2 AND x IS $3', [5, "O'Neil", null])).toBe(
      "SELECT * FROM t WHERE id = 5 AND name = 'O''Neil' AND x IS NULL",
    );
  });

  it('does not touch $n inside string literals and handles $10 correctly', () => {
    const params = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(interpolateSql("SELECT '$1', $10", params)).toBe("SELECT '$1', 10");
  });

  it('formats arrays and booleans', () => {
    expect(interpolateSql('WHERE id = ANY($1) AND ok = $2', [[1, 2], true])).toBe('WHERE id = ANY(ARRAY[1, 2]) AND ok = TRUE');
  });
});

describe('formatSql', () => {
  it('keeps short statements on one line', () => {
    expect(formatSql('SELECT name FROM permissions ORDER BY name', 100)).toEqual(['SELECT name FROM permissions ORDER BY name']);
  });

  it('puts top-level clauses on their own lines and keeps LEFT JOIN together', () => {
    const lines = formatSql(
      'SELECT u.id, u.name FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.id = 1 AND u.is_active = TRUE GROUP BY u.id',
      40,
    );
    expect(lines.some((l) => l.trim().startsWith('LEFT JOIN user_roles'))).toBe(true);
    expect(lines.some((l) => l.trim() === 'AND u.is_active = TRUE')).toBe(true);
    expect(lines.every((l) => l.trim() !== 'JOIN')).toBe(true);
  });

  it('does not split clauses inside parentheses', () => {
    const lines = formatSql('SELECT COALESCE(array_agg(x ORDER BY y) FILTER (WHERE z IS NOT NULL), 0) AS a FROM t WHERE b = 1', 30);
    expect(lines.some((l) => l.includes('FILTER (WHERE z IS NOT NULL)'))).toBe(true);
  });
});
