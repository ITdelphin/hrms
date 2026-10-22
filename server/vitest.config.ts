import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The sources are TypeScript but use ESM ".js" import specifiers.
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
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
