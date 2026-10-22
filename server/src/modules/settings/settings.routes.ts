import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { updateSettingsSchema } from './settings.schemas.js';
import { getSettings, updateSettings } from './settings.service.js';
import type { UpdateSettingsInput } from './settings.schemas.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

settingsRouter.patch(
  '/',
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateSettings(currentOwner(req).id, req.body as UpdateSettingsInput, req));
  }),
);
