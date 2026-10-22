import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors.js';

export type RequestSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

const formatIssues = (error: ZodError) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query'];
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError(422, 'VALIDATION_ERROR', 'Invalid request data', formatIssues(error)));
        return;
      }
      next(error);
    }
  };
