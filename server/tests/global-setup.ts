import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { connectionString, portIsOpen, startCluster } from '../src/scripts/cluster.js';

const serverRoot = path.resolve('.');

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '4100',
  JWT_SECRET: 'test-only-secret-value-with-more-than-32-characters',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '7',
  COOKIE_SECURE: 'false',
  CORS_ORIGINS: 'http://localhost:5173',
  OWNER_BOOTSTRAP_EMAIL: 'test-owner@example.com',
  OWNER_BOOTSTRAP_PASSWORD: 'test-owner-password',
  OWNER_BOOTSTRAP_NAME: 'Test Owner',
  LOGIN_MAX_ATTEMPTS: '3',
  LOGIN_LOCK_MINUTES: '15',
  NOTIFICATION_PROVIDER: 'console',
  SMTP_HOST: '',
  ENABLE_SCHEDULER: 'false',
  REMINDER_DAYS_BEFORE_DUE: '3',
};

const runPrisma = (args: string[], databaseUrl: string): void => {
  const result = spawnSync('npx', ['--no-install', 'prisma', ...args], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
};

export const setup = async () => {
  const { config } = await startCluster({
    databaseDir: path.resolve('.data/postgres-test'),
    port: 5434,
    database: 'hrms_test',
  });

  if (!(await portIsOpen(config.port))) throw new Error(`test postgres is not listening on ${config.port}`);

  const databaseUrl = connectionString(config);
  // Proves the migration history is what tests actually run against.
  runPrisma(['migrate', 'reset', '--force', '--skip-generate'], databaseUrl);

  return { ...TEST_ENV, DATABASE_URL: databaseUrl };
};
