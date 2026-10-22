import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createLeaseSchema,
  endLeaseSchema,
  extendSchema,
  listLeasesQuerySchema,
  updateLeaseSchema,
} from './leases.schemas.js';
import {
  createLease,
  endLease,
  extendSchedule,
  getLease,
  listLeases,
  terminateLease,
  updateLease,
} from './leases.service.js';
import type { CreateLeaseInput, ListLeasesInput, UpdateLeaseInput } from './leases.schemas.js';

export const leasesRouter = Router();

leasesRouter.get(
  '/',
  validate({ query: listLeasesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listLeases(req.query as unknown as ListLeasesInput));
  }),
);

leasesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getLease(req.params.id!));
  }),
);

leasesRouter.post(
  '/',
  validate({ body: createLeaseSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateLeaseInput;
    res.status(201).json(await createLease(currentOwner(req).id, input, req));
  }),
);

leasesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateLeaseSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateLease(currentOwner(req).id, req.params.id!, req.body as UpdateLeaseInput, req));
  }),
);

leasesRouter.post(
  '/:id/end',
  validate({ params: idParamSchema, body: endLeaseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ lease: await endLease(currentOwner(req).id, req.params.id!, req.body, req) });
  }),
);

leasesRouter.post(
  '/:id/terminate',
  validate({ params: idParamSchema, body: endLeaseSchema }),
  asyncHandler(async (req, res) => {
    res.json({ lease: await terminateLease(currentOwner(req).id, req.params.id!, req.body, req) });
  }),
);

leasesRouter.post(
  '/:id/schedule/extend',
  validate({ params: idParamSchema, body: extendSchema }),
  asyncHandler(async (req, res) => {
    const { months } = req.body as z.infer<typeof extendSchema>;
    res.json(await extendSchedule(currentOwner(req).id, req.params.id!, months, req));
  }),
);
