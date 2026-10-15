import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 5000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  /** Public URL of the web app (used to build links such as invitations). */
  appUrl: process.env.APP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  /** Release / build shown on production errors ("which version broke?"). */
  appVersion: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },
  auth: {
    jwtSecret: required('JWT_SECRET'),
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'http',
    dir: process.env.LOG_DIR ?? 'logs',
    httpBodies: (process.env.LOG_HTTP_BODIES ?? 'true') === 'true',
    maxBodyLength: Number(process.env.LOG_MAX_BODY_LENGTH ?? 4000),
    slowRequestMs: Number(process.env.LOG_SLOW_REQUEST_MS ?? 1000),
    /** Record every SQL query run by an API request (stored in the http/app log files). */
    sql: (process.env.LOG_SQL ?? 'true') === 'true',
    /** Also print those queries under each request line in the console. */
    sqlConsole: (process.env.LOG_SQL_CONSOLE ?? 'true') === 'true',
    /** Include query parameter values in the files (hashes/tokens are always redacted). */
    sqlParams: (process.env.LOG_SQL_PARAMS ?? 'true') === 'true',
    slowQueryMs: Number(process.env.LOG_SLOW_QUERY_MS ?? 200),
  },
  email: {
    /** outbox = store only (view in Platform → Mailbox) · ethereal = free fake SMTP with web preview · smtp = real provider */
    driver: (process.env.EMAIL_DRIVER ?? 'outbox') as 'outbox' | 'ethereal' | 'smtp',
    from: process.env.EMAIL_FROM ?? 'Team-Flex <no-reply@teamflex.local>',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  },
  jobs: {
    /** Start the background worker inside the API process. */
    enabled: (process.env.JOBS_ENABLED ?? 'true') === 'true',
    concurrency: Number(process.env.JOBS_CONCURRENCY ?? 2),
    pollIntervalMs: Number(process.env.JOBS_POLL_INTERVAL_MS ?? 1000),
  },
  notifications: {
    /** wait before an "instant" email, so it is skipped when the person already read it in the app */
    emailDelaySeconds: Number(process.env.NOTIFY_EMAIL_DELAY_SECONDS ?? 60),
  },
  storage: {
    /** Local folder for uploaded files (S3 / MinIO can be added behind the same interface). */
    dir: process.env.STORAGE_DIR ?? 'uploads',
    maxFileMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
  },
};
