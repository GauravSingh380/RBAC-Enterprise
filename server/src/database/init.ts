// Database CLI.
//   npm run db:init                 create DB if missing, apply schema.sql, run pending migrations (safe)
//   npm run db:reset                DROP everything and recreate (refused in production)
//   npm run db:status               list migrations and whether they are applied
//   npm run db:new -- <name>        create migrations/NNNN_<name>.sql
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { env } from '../config/env.js';
import { MIGRATIONS_DIR, migrationStatus, runMigrations } from './migrate.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');

async function createDatabaseIfMissing(): Promise<void> {
  // Connect to the default "postgres" database so we can create ours
  const client = new pg.Client({ ...env.db, database: 'postgres' });
  await client.connect();

  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.db.database]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${env.db.database}"`);
    console.log(`Created database "${env.db.database}"`);
  }

  await client.end();
}

async function init(): Promise<void> {
  await createDatabaseIfMissing();
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = new pg.Client(env.db);
  await client.connect();
  try {
    if (reset) {
      if (env.isProduction) throw new Error('db:reset is disabled in production');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('Dropped all tables');
    }

    await client.query(sql);
    console.log('Schema and master data applied');

    const applied = await runMigrations(client);
    console.log(applied.length ? `${applied.length} migration(s) applied` : 'No pending migrations');
  } finally {
    await client.end();
  }
}

async function status(): Promise<void> {
  const client = new pg.Client(env.db);
  await client.connect();
  try {
    const list = await migrationStatus(client);
    if (!list.length) console.log('No migrations found');
    for (const m of list) {
      const state = m.modified ? 'MODIFIED (!)' : m.applied ? `applied ${m.appliedAt?.toISOString()}` : 'pending';
      console.log(`${m.version.padEnd(50)} ${state}`);
    }
  } finally {
    await client.end();
  }
}

async function newMigration(name: string | undefined): Promise<void> {
  if (!name || !/^[a-z0-9_]+$/.test(name)) throw new Error('Usage: npm run db:new -- <name_in_snake_case>');
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(MIGRATIONS_DIR).catch(() => [] as string[])).filter((f) => /^\d{4}_/.test(f)).sort();
  const next = String(Number(files.at(-1)?.slice(0, 4) ?? 0) + 1).padStart(4, '0');
  const file = `${next}_${name}.sql`;
  await writeFile(
    new URL(file, MIGRATIONS_DIR),
    `-- ${file}\n-- One-time change. Runs once inside a transaction (npm run db:init).\n-- New tables / columns / master data belong in schema.sql; use this for data changes.\n\n`,
  );
  console.log(`Created src/database/migrations/${file}`);
}

try {
  if (args.includes('--status')) await status();
  else if (args.includes('--new')) await newMigration(args[args.indexOf('--new') + 1]);
  else await init();
} catch (err) {
  console.error('Database command failed:', (err as Error).message);
  process.exit(1);
}
