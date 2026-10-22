import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Not allowed') => new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource: string) =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const tooMany = (message: string) => new AppError(429, 'RATE_LIMITED', message);

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

export const asyncHandler =
  (fn: Handler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
