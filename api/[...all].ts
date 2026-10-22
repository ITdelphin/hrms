import type { Request, Response } from 'express';
import { createApp } from '../server/dist/app.js';
import { ensureBootstrapOwner } from '../server/dist/modules/auth/auth.service.js';

const app = createApp();

// Serverless has no boot phase, so the owner row is created on the first cold start.
let bootstrap: Promise<unknown> | null = null;

export default async function handler(req: Request, res: Response): Promise<void> {
  bootstrap ??= ensureBootstrapOwner().catch(() => undefined);
  await bootstrap;
  app(req, res);
}
