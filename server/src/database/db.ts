import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../common/logger/logger.js';
import { instrumentQueries } from './query-logger.js';

// Every query through the pool is timed and logged against the current API request
export const db = instrumentQueries(new pg.Pool(env.db));

// An idle client lost its connection (e.g. DB restarted) — log instead of crashing
db.on('error', (err) => logger.error(`PostgreSQL pool error: ${err.message}`, { stack: err.stack }));

/** Anything that can run a query: the pool or a transaction client. */
export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function connectDatabase(): Promise<void> {
  const client = await db.connect();
  client.release();
  logger.info(`Connected to PostgreSQL database "${env.db.database}"`, { host: env.db.host, port: env.db.port });
}

/** Runs `fn` inside BEGIN/COMMIT and rolls back on any error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = instrumentQueries(await db.connect());
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
