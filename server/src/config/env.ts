import 'dotenv/config';
import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanish.default(false),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  OWNER_BOOTSTRAP_EMAIL: z.string().email().optional(),
  OWNER_BOOTSTRAP_PASSWORD: z.string().min(10).optional(),
  OWNER_BOOTSTRAP_NAME: z.string().default('Property Owner'),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  NOTIFICATION_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('HRMS <no-reply@hrms.local>'),

  REMINDER_DAYS_BEFORE_DUE: z.coerce.number().int().min(0).default(3),
  OVERDUE_REMINDER_DAYS: z.coerce.number().int().min(0).default(1),
  ENABLE_SCHEDULER: booleanish.default(true),
  /** Shared secret for the cron-only endpoints that run outside an owner session. */
  CRON_SECRET: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  console.error('Copy server/.env.example to server/.env and fill in the required values.');
  process.exit(1);
}

type RawEnv = z.infer<typeof schema>;
export type AppEnv = Readonly<RawEnv>;
export const env: AppEnv = Object.freeze(parsed.data);
