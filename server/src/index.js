import { createApp } from './app.js';
import { env, reportConfig } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

try {
  reportConfig(logger);
} catch (err) {
  logger.error(`Configuration error: ${err.message}`);
  process.exit(1);
}

const app = createApp();
const server = app.listen(env.port);

server.on('listening', () => {
  logger.info(`${env.store.name} API listening on ${env.serverUrl} (${env.nodeEnv})`);
  logger.info(`Storefront origin: ${env.clientUrl}`);
});

/**
 * Without this, a leftover process holding the port crashes the app with a raw
 * "Unhandled 'error' event" stack trace that says nothing useful.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      `Port ${env.port} is already in use — another copy of the API is probably still running.\n` +
        `  Stop it with:  lsof -ti:${env.port} | xargs kill\n` +
        `  Or use a different port:  PORT=4001 npm run dev -w server`,
    );
  } else if (err.code === 'EACCES') {
    logger.error(`Not allowed to bind port ${env.port}. Ports below 1024 need elevated privileges.`);
  } else {
    logger.error('Failed to start the server', err);
  }
  process.exit(1);
});

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} received — shutting down`);
  const force = setTimeout(() => {
    logger.warn('Forcing shutdown after 10s');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    clearTimeout(force);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', err);
  shutdown('uncaughtException');
});
