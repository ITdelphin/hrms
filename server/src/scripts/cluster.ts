import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export type ClusterConfig = {
  databaseDir: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export const readConfig = (defaults: Partial<ClusterConfig> = {}): ClusterConfig => ({
  databaseDir: defaults.databaseDir ?? process.env.EMBEDDED_PG_DIR ?? path.resolve('.data/postgres'),
  port: defaults.port ?? Number(process.env.EMBEDDED_PG_PORT ?? 5433),
  user: defaults.user ?? process.env.EMBEDDED_PG_USER ?? 'hrms',
  password: defaults.password ?? process.env.EMBEDDED_PG_PASSWORD ?? 'hrms-local',
  database: defaults.database ?? process.env.EMBEDDED_PG_DATABASE ?? 'hrms',
});

export const portIsOpen = (port: number): Promise<boolean> =>
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

export const buildCluster = (config: ClusterConfig) =>
  new EmbeddedPostgres({
    databaseDir: config.databaseDir,
    port: config.port,
    user: config.user,
    password: config.password,
    persistent: true,
  });

export const connectionString = (config: ClusterConfig, database = config.database): string =>
  `postgresql://${config.user}:${config.password}@localhost:${config.port}/${database}`;

const ensureDatabase = async (config: ClusterConfig): Promise<void> => {
  const client = buildCluster(config).getPgClient('postgres');
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    if (found.rowCount === 0) {
      // Identifiers cannot be parameterised, so the name is reduced to safe characters first.
      await client.query(`CREATE DATABASE "${config.database.replace(/[^a-z0-9_]/gi, '')}"`);
    }
  } finally {
    await client.end();
  }
};

export const startCluster = async (overrides: Partial<ClusterConfig> = {}) => {
  const config = readConfig(overrides);
  if (await portIsOpen(config.port)) {
    return { config, wasRunning: true as const };
  }

  const cluster = buildCluster(config);
  if (!fs.existsSync(path.join(config.databaseDir, 'PG_VERSION'))) {
    await cluster.initialise();
  }
  await cluster.start();
  await ensureDatabase(config);
  return { config, wasRunning: false as const };
};

export const stopCluster = async (overrides: Partial<ClusterConfig> = {}): Promise<void> => {
  const config = readConfig(overrides);
  await buildCluster(config).stop();
};
