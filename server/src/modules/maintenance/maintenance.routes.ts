import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createMaintenanceSchema,
  listMaintenanceQuerySchema,
  transitionMaintenanceSchema,
  updateMaintenanceSchema,
} from './maintenance.schemas.js';
import {
  createMaintenance,
  deleteMaintenance,
  getMaintenance,
  listMaintenance,
  transitionMaintenance,
  updateMaintenance,
} from './maintenance.service.js';
import type {
  CreateMaintenanceInput,
  ListMaintenanceInput,
  MaintenanceStatus,
  UpdateMaintenanceInput,
} from './maintenance.schemas.js';

export const maintenanceRouter = Router();

maintenanceRouter.get(
  '/',
  validate({ query: listMaintenanceQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listMaintenance(req.query as unknown as ListMaintenanceInput));
  }),
);

maintenanceRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ request: await getMaintenance(req.params.id!) });
  }),
);

maintenanceRouter.post(
  '/',
  validate({ body: createMaintenanceSchema }),
  asyncHandler(async (req, res) => {
    const created = await createMaintenance(currentOwner(req).id, req.body as CreateMaintenanceInput, req);
    res.status(201).json({ request: created });
  }),
);

maintenanceRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateMaintenanceSchema }),
  asyncHandler(async (req, res) => {
    const updated = await updateMaintenance(
      currentOwner(req).id,
      req.params.id!,
      req.body as UpdateMaintenanceInput,
      req,
    );
    res.json({ request: updated });
  }),
);

maintenanceRouter.post(
  '/:id/status',
  validate({ params: idParamSchema, body: transitionMaintenanceSchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: MaintenanceStatus };
    const updated = await transitionMaintenance(currentOwner(req).id, req.params.id!, status, req);
    res.json({ request: updated });
  }),
);

maintenanceRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteMaintenance(currentOwner(req).id, req.params.id!, req);
    res.status(204).send();
  }),
);
