import { afterAll } from 'vitest';
import { db } from '../src/database/db.js';
import { realtime } from '../src/modules/realtime/realtime.hub.js';

afterAll(async () => {
  await realtime.stop();
  await db.end();
});
