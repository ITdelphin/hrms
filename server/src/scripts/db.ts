#!/usr/bin/env tsx
/**
 * Runs a real PostgreSQL server from the `embedded-postgres` package, so the
 * project needs no system Postgres install and no Docker. Data lives in
 * server/.data/postgres and survives restarts.
 */
import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

type Config = {
  databaseDir: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const readConfig = (defaults: Partial<Config> = {}): Config => ({
  databaseDir: defaults.databaseDir ?? process.env.EMBEDDED_PG_DIR ?? path.resolve('.data/postgres'),
  port: defaults.port ?? Number(process.env.EMBEDDED_PG_PORT ?? 5433),
  user: defaults.user ?? process.env.EMBEDDED_PG_USER ?? 'hrms',
  password: defaults.password ?? process.env.EMBEDDED_PG_PASSWORD ?? 'hrms-local',
  database: defaults.database ?? process.env.EMBEDDED_PG_DATABASE ?? 'hrms',
});

const portIsOpen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net
      .connect({ port, host: '127.0.0.1' })
      .setTimeout(800)
      .once('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .once('timeout', () => {
        socket.destroy();
        resolve(false);
      })
      .once('error', () => resolve(false));
  });

const build = (config: Config) =>
  new EmbeddedPostgres({
    databaseDir: config.databaseDir,
    port: config.port,
    user: config.user,
    password: config.password,
    persistent: true,
  });

const ensureDatabase = async (config: Config): Promise<void> => {
  const pg = build(config);
  const client = pg.getPgClient('postgres');
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${config.database.replace(/[^a-z0-9_]/gi, '')}"`);
      console.log(`created database ${config.database}`);
    }
  } finally {
    await client.end();
  }
};

export const startCluster = async (overrides: Partial<Config> = {}) => {
  const config = readConfig(overrides);
  if (await portIsOpen(config.port)) {
    console.log(`postgres already listening on ${config.port}`);
    return { config, wasRunning: true as const };
  }

  const pg = build(config);
  const initialised = fs.existsSync(path.join(config.databaseDir, 'PG_VERSION'));
  if (!initialised) {
    console.log(`initialising cluster in ${config.databaseDir}`);
    await pg.initialise();
  }
  await pg.start();
  await ensureDatabase(config);
  return { config, wasRunning: false as const };
};

const command = process.argv[2] ?? 'start';

if (command === 'status') {
  const config = readConfig();
  console.log(`${config.port}:${(await portIsOpen(config.port)) ? 'up' : 'down'} database=${config.database} dir=${config.databaseDir}`);
  process.exit(0);
}

if (command === 'stop') {
  const config = readConfig();
  await build(config).stop();
  console.log(`postgres stopped (${config.databaseDir})`);
  process.exit(0);
}

if (command !== 'start') {
  console.error(`unknown command: ${command} (use start | stop | status)`);
  process.exit(1);
}

const { config, wasRunning } = await startCluster();

console.log('');
console.log(`  PostgreSQL is running on 127.0.0.1:${config.port}`);
console.log(`  database: ${config.database}`);
console.log(`  url:      postgresql://${config.user}:${config.password}@localhost:${config.port}/${config.database}`);
console.log(`  data dir: ${config.databaseDir}`);
console.log('');
console.log(wasRunning ? '  (reusing the existing cluster — Ctrl+C detaches this terminal only)' : '  Press Ctrl+C to stop the server');

if (wasRunning) {
  process.exit(0);
}

const shutdown = async () => {
  console.log('\nstopping postgres...');
  await build(config).stop();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
