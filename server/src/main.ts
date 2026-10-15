import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, db } from './database/db.js';
import { logger } from './common/logger/logger.js';
import { startWorker, stopWorker } from './jobs/index.js';
import { realtime } from './modules/realtime/realtime.hub.js';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : reason });
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on http://localhost:${env.port}`, {
      env: env.nodeEnv,
      logLevel: env.log.level,
      logDir: env.log.dir,
      email: env.email.driver,
    });
  });

  // Background jobs (emails, ...) run in the same process. In production you can run
  // a separate worker process instead by setting JOBS_ENABLED=false on the API instances.
  if (env.jobs.enabled) startWorker({ concurrency: env.jobs.concurrency, pollIntervalMs: env.jobs.pollIntervalMs });

  // Graceful shutdown: stop accepting requests, finish in-flight requests and jobs, close DB
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
    // live streams never finish on their own — close them first or server.close() would wait forever
    void realtime.stop();
    server.close(async () => {
      await stopWorker();
      await db.end();
      logger.info('Server stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
