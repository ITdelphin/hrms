import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { propertiesRouter } from './modules/properties/properties.routes.js';
import { tenantsRouter } from './modules/tenants/tenants.routes.js';
import { leasesRouter } from './modules/leases/leases.routes.js';
import { rentsRouter } from './modules/rents/rents.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { cronRouter } from './modules/notifications/cron.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { prisma } from './lib/prisma.js';

const origins = new Set(env.CORS_ORIGINS.split(',').map((origin) => origin.trim()));

const requestLog = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - startedAt,
    });
  });
  next();
};

export const createApp = (): Application => {
  const app = express();

  // Behind a reverse proxy the real client IP is needed for rate limiting and audit rows.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origins.has(origin)) return callback(null, true);
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(requestLog);

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/cron', cronRouter);

  app.use('/api/auth', authRouter);

  const protectedRouter = express.Router();
  protectedRouter.use(requireAuth);
  protectedRouter.use('/properties', propertiesRouter);
  protectedRouter.use('/tenants', tenantsRouter);
  protectedRouter.use('/leases', leasesRouter);
  protectedRouter.use('/rents', rentsRouter);
  protectedRouter.use('/payments', paymentsRouter);
  protectedRouter.use('/expenses', expensesRouter);
  protectedRouter.use('/maintenance', maintenanceRouter);
  protectedRouter.use('/notifications', notificationsRouter);
  protectedRouter.use('/dashboard', dashboardRouter);
  protectedRouter.use('/audit', auditRouter);
  protectedRouter.use('/settings', settingsRouter);
  protectedRouter.use('/reports', reportsRouter);

  app.use('/api', apiLimiter, protectedRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
