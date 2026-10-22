import { Router } from 'express';
import { currentOwner } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../lib/http.js';
import {
  createPropertySchema,
  listPropertiesQuerySchema,
  updatePropertySchema,
} from './properties.schemas.js';
import {
  createProperty,
  deleteProperty,
  getProperty,
  listProperties,
  updateProperty,
} from './properties.service.js';
import type { ListPropertiesInput } from './properties.schemas.js';

export const propertiesRouter = Router();

propertiesRouter.get(
  '/',
  validate({ query: listPropertiesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listProperties(req.query as unknown as ListPropertiesInput));
  }),
);

propertiesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ property: await getProperty(req.params.id!) });
  }),
);

propertiesRouter.post(
  '/',
  validate({ body: createPropertySchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ property: await createProperty(currentOwner(req).id, req.body, req) });
  }),
);

propertiesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updatePropertySchema }),
  asyncHandler(async (req, res) => {
    res.json({ property: await updateProperty(currentOwner(req).id, req.params.id!, req.body, req) });
  }),
);

propertiesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteProperty(currentOwner(req).id, req.params.id!, req);
    res.status(204).send();
  }),
);
