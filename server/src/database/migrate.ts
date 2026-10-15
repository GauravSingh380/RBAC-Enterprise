// Versioned, one-time migrations.
//
//   schema.sql                 declarative + idempotent: every table, index and master-data row
//                              (re-run safely on every deploy — the readable "current state")
//   migrations/NNNN_name.sql   ONE-TIME changes that cannot be expressed idempotently:
//                              data fixes, back-fills, renames, granting new permissions to
//                              existing organizations, ...
//
// Applied migrations are recorded in schema_migrations with a SHA-256 checksum.
// Editing an already-applied migration is refused — write a new one instead.
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

export const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationStatus {
  version: string;
  applied: boolean;
  appliedAt: Date | null;
  modified: boolean;
}

const checksum = (sql: string) => crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

async function listFiles(): Promise<string[]> {
  try {
    return (await readdir(MIGRATIONS_DIR)).filter((f) => FILE_PATTERN.test(f)).sort();
  } catch {
    return [];
  }
}

async function ensureTable(client: pg.Client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

export async function migrationStatus(client: pg.Client): Promise<MigrationStatus[]> {
  await ensureTable(client);
  const { rows } = await client.query<{ version: string; checksum: string; applied_at: Date }>(
    'SELECT version, checksum, applied_at FROM schema_migrations',
  );
  const applied = new Map(rows.map((r) => [r.version, r]));

  const result: MigrationStatus[] = [];
  for (const file of await listFiles()) {
    const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
    const row = applied.get(file);
    result.push({ version: file, applied: !!row, appliedAt: row?.applied_at ?? null, modified: !!row && row.checksum !== checksum(sql) });
  }
  return result;
}

/** Applies pending migrations in order, each in its own transaction. Returns the applied versions. */
export async function runMigrations(client: pg.Client, log: (msg: string) => void = console.log): Promise<string[]> {
  const status = await migrationStatus(client);

  const modified = status.filter((m) => m.modified).map((m) => m.version);
  if (modified.length) {
    throw new Error(`Applied migration(s) were modified: ${modified.join(', ')}. Never edit an applied migration — add a new one.`);
  }

  const applied: string[] = [];
  for (const m of status.filter((s) => !s.applied)) {
    const sql = await readFile(new URL(m.version, MIGRATIONS_DIR), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [m.version, checksum(sql)]);
      await client.query('COMMIT');
      applied.push(m.version);
      log(`Applied migration ${m.version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${m.version} failed: ${(err as Error).message}`);
    }
  }
  return applied;
}
