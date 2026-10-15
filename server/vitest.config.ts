// Tests run against a separate database (team_flex_test) that is rebuilt from schema.sql
// before every run — your development data is never touched.
import { defineConfig } from 'vitest/config';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DB_NAME: 'team_flex_test',
  LOG_LEVEL: 'error',
  LOG_SQL: 'false',
  LOG_DIR: 'logs/test',
  JOBS_ENABLED: 'false', // tests run jobs explicitly with drainJobs()
  EMAIL_DRIVER: 'outbox',
  STORAGE_DIR: 'uploads-test',
  APP_URL: 'http://app.test',
  NOTIFY_EMAIL_DELAY_SECONDS: '0', // notification emails are due immediately (drainJobs runs them)
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
    env: TEST_ENV,
    fileParallelism: false, // one shared test database
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
