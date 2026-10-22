import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { ensureBootstrapOwner } from './modules/auth/auth.service.js';
import { startScheduler } from './modules/notifications/scheduler.js';

const main = async () => {
  const app = createApp();

  await prisma.$connect();
  const bootstrap = await ensureBootstrapOwner();

  const server = app.listen(env.PORT, () => {
    logger.info('hrms_api_listening', { port: env.PORT, env: env.NODE_ENV });
    if (bootstrap.created) logger.info('sign_in_with', { email: bootstrap.email });
  });

  const stopScheduler = startScheduler();

  const shutdown = async (signal: string) => {
    logger.info('shutdown', { signal });
    stopScheduler?.();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Do not hang on lingering connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

main().catch((error) => {
  logger.error('startup_failed', { error: (error as Error).message, stack: (error as Error).stack });
  process.exit(1);
});
