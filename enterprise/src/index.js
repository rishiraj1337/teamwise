'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./core/logger');
const { testConnection, closePool } = require('./database/connection');
const { runMigrations } = require('./database/migrator');
const { createServer } = require('./server/server');
const { jobScheduler } = require('./jobs/scheduler');

let server = null;
let isShuttingDown = false;

async function bootstrap() {
  logger.debug({ nodeEnv: env.NODE_ENV, port: env.PORT }, 'Starting Unified Review Platform Enterprise Service');

  let dbHealthy = false;
  const maxRetries = 10;
  for (let i = 1; i <= maxRetries; i++) {
    dbHealthy = await testConnection();
    if (dbHealthy) {
      break;
    }
    logger.debug({ attempt: i, maxRetries }, 'Database not ready yet, retrying in 2 seconds...');
    await new Promise(res => setTimeout(res, 2000));
  }

  if (!dbHealthy) {
    logger.error('Could not connect to database after maximum retries. Exiting.');
    process.exit(1);
  }

  await runMigrations();

  const app = createServer();
  server = http.createServer(app);

  server.listen(env.PORT, env.HOST, async () => {
    logger.info(`Server ready at http://${env.HOST}:${env.PORT}`);
    await jobScheduler.start();
  });
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.debug({ signal }, 'Graceful shutdown initiated');

  jobScheduler.stop();

  if (server) {
    server.close(() => {
      logger.debug('HTTP server closed');
    });
  }

  try {
    await closePool();
  } catch (err) {
    logger.error(`Error closing database pool: ${err.message}`);
  }

  logger.debug('Graceful shutdown completed');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught Exception');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

bootstrap().catch((err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Fatal error during platform bootstrap');
  process.exit(1);
});
