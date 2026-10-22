import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createTenantSchema, listTenantsQuerySchema, updateTenantSchema } from './tenants.schemas.js';
import {
  createTenant,
  deleteTenant,
  getTenant,
  listTenants,
  updateTenant,
} from './tenants.service.js';
import type { CreateTenantInput, ListTenantsInput } from './tenants.schemas.js';

export const tenantsRouter = Router();

tenantsRouter.get(
  '/',
  validate({ query: listTenantsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listTenants(req.query as unknown as ListTenantsInput));
  }),
);

tenantsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ tenant: await getTenant(req.params.id!) });
  }),
);

tenantsRouter.post(
  '/',
  validate({ body: createTenantSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ tenant: await createTenant(currentOwner(req).id, req.body as CreateTenantInput, req) });
  }),
);

tenantsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTenantSchema }),
  asyncHandler(async (req, res) => {
    res.json({ tenant: await updateTenant(currentOwner(req).id, req.params.id!, req.body, req) });
  }),
);

tenantsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteTenant(currentOwner(req).id, req.params.id!, req);
    res.status(204).send();
  }),
);
