import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // A single fork keeps the shared PostgreSQL instance deterministic.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
