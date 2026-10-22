import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

const send = (res: Response, status: number, body: ErrorBody) => {
  if (res.headersSent) return;
  res.status(status).json(body);
};

export const notFoundHandler = (req: Request, res: Response) =>
  send(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof AppError) {
    logger.warn('request_rejected', { path: req.path, status: err.status, code: err.code });
    send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    send(res, 422, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err.issues },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      send(res, 409, {
        error: {
          code: 'DUPLICATE_VALUE',
          message: target ? `${target} already in use` : 'Record already exists',
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      send(res, 404, { error: { code: 'NOT_FOUND', message: 'Record not found' } });
      return;
    }
    if (err.code === 'P2003') {
      send(res, 409, { error: { code: 'RELATED_RECORD', message: 'Referenced record does not exist' } });
      return;
    }
  }

  logger.error('unhandled_error', {
    path: req.path,
    message: (err as Error)?.message,
    stack: env.NODE_ENV === 'test' ? undefined : (err as Error)?.stack,
  });
  send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
