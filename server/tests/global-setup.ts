// Runs once before all test files: recreate the test database from schema.sql + migrations.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { TEST_ENV } from '../vitest.config.js';

export default function setup() {
  execSync('npx tsx src/database/init.ts --reset', {
    stdio: 'pipe',
    env: { ...process.env, ...TEST_ENV },
  });
  rmSync(TEST_ENV.STORAGE_DIR, { recursive: true, force: true });

  return () => rmSync(TEST_ENV.STORAGE_DIR, { recursive: true, force: true });
}
