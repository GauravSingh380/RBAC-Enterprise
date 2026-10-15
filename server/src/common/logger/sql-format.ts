// Small SQL helpers for readable logs (display only — never used to run queries).
//
//   interpolateSql('SELECT * FROM users WHERE id = $1', [5])  ->  SELECT * FROM users WHERE id = 5
//   formatSql(sql, 100)  ->
//     SELECT u.id, u.name, u.email
//       FROM users u
//       LEFT JOIN user_roles ur ON ur.user_id = u.id
//      WHERE u.id = 5
//        AND u.is_active = TRUE

/** Walks the SQL and returns the indexes that are outside quotes and parentheses. */
function topLevelIndexes(sql: string): boolean[] {
  const topLevel = new Array<boolean>(sql.length).fill(false);
  let depth = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") i++; // escaped quote ''
        else inString = false;
      }
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else topLevel[i] = depth === 0;
  }
  return topLevel;
}

// ------------------------------------------------------------ parameters

function toLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) return `ARRAY[${value.map(toLiteral).join(', ')}]`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Replaces $1, $2 … with the actual values (outside of string literals). */
export function interpolateSql(sql: string, params?: unknown[]): string {
  if (!params?.length) return sql;
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inString = !inString;
    if (!inString && ch === '$' && /\d/.test(sql[i + 1] ?? '')) {
      const match = /^\$(\d+)/.exec(sql.slice(i))!;
      const index = Number(match[1]) - 1;
      out += index < params.length ? toLiteral(params[index]) : match[0];
      i += match[0].length - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

// ------------------------------------------------------------ formatting

// Clauses that start a new line when they appear at the top level (longest first)
const CLAUSES = [
  'LEFT OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
  'UNION ALL', 'UNION', 'GROUP BY', 'ORDER BY', 'ON CONFLICT', 'RETURNING', 'SELECT', 'FROM', 'WHERE',
  'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'SET',
].map((kw) => ({ kw, re: new RegExp(`^${kw.replace(/ /g, '\\s+')}\\b`, 'i') }));

const CONDITION = /^(AND|OR)\b/i;
const ALIGN = 6; // width of "SELECT" — clause keywords are right-aligned to it

/**
 * Splits `text` before each top-level keyword match (keeps the keyword).
 * `match` returns the matched keyword length, or 0 — the scan then jumps past it,
 * so "LEFT JOIN" is not split again at "JOIN".
 */
function splitBefore(text: string, match: (rest: string) => number, skip?: (current: string) => boolean): string[] {
  const top = topLevelIndexes(text);
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i++) {
    if (!top[i] || !/\s/.test(text[i - 1])) continue;
    const length = match(text.slice(i));
    if (!length) continue;
    const current = text.slice(start, i).trim();
    if (current && !skip?.(current)) {
      parts.push(current);
      start = i;
    }
    i += length - 1;
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

/** Splits a list at top-level commas ("a, b, fn(x, y)" -> ["a,", "b,", "fn(x, y)"]). */
function splitCommas(text: string): string[] {
  const top = topLevelIndexes(text);
  const items: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (top[i] && text[i] === ',') {
      items.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  items.push(text.slice(start).trim());
  return items.filter(Boolean);
}

/** Right-aligns the leading keyword and wraps long comma lists to `width`. */
function layoutClause(clause: string, width: number): string[] {
  const keyword = /^\S+/.exec(clause)![0];
  const pad = ' '.repeat(Math.max(0, ALIGN - keyword.length));
  const first = `${pad}${clause}`;
  if (first.length <= width) return [first];

  // Pack comma-separated items into lines; continuation lines line up after the keyword
  const [head, ...rest] = splitCommas(clause);
  const indent = ' '.repeat(ALIGN + 1);
  const lines = [`${pad}${head}`];
  for (const item of rest) {
    const last = lines[lines.length - 1];
    if (last.length + 1 + item.length <= width) lines[lines.length - 1] = `${last} ${item}`;
    else lines.push(`${indent}${item}`);
  }
  return lines;
}

/** Pretty-prints one SQL statement into aligned lines no wider than `width` (where possible). */
export function formatSql(sql: string, width = 100): string[] {
  const oneLine = sql.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  if (oneLine.length <= width) return [oneLine];

  const clauses = splitBefore(
    oneLine,
    (rest) => CLAUSES.find(({ re }) => re.test(rest))?.re.exec(rest)?.[0].length ?? 0,
    (current) => /^DELETE$/i.test(current), // keep "DELETE FROM x" together
  );

  const lines: string[] = [];
  for (const clause of clauses) {
    // WHERE / HAVING: one condition per line
    const conditions = /^(WHERE|HAVING)\b/i.test(clause)
      ? splitBefore(clause, (rest) => CONDITION.exec(rest)?.[0].length ?? 0)
      : [clause];
    for (const part of conditions) lines.push(...layoutClause(part, width));
  }
  return lines;
}

// ------------------------------------------------------------ highlighting

const KEYWORDS = new Set(
  (
    'SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER FULL CROSS GROUP BY ORDER ' +
    'HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE RETURNING DISTINCT COUNT CASE WHEN THEN ELSE END ' +
    'EXISTS ANY ALL UNION CONFLICT DO NOTHING ASC DESC NULLS FIRST LAST TRUE FALSE BEGIN COMMIT ROLLBACK ' +
    'COALESCE FILTER ILIKE LIKE BETWEEN INTERVAL NOW ARRAY WITH'
  ).split(' '),
);

/** Adds terminal colours: keywords, 'strings', numbers. */
export function highlightSql(line: string, paint: (color: 'cyan' | 'green' | 'yellow', text: string) => string): string {
  return line.replace(/('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Z_]+\b)/g, (match, str, num, word) => {
    if (str) return paint('green', str);
    if (num) return paint('yellow', num);
    if (word && KEYWORDS.has(word)) return paint('cyan', word);
    return match;
  });
}
