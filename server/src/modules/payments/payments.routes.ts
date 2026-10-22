import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  listPaymentsQuerySchema,
  recordPaymentSchema,
  reversePaymentSchema,
} from './payments.schemas.js';
import { listPayments, recordPayment, reversePayment } from './payments.service.js';
import type { ListPaymentsInput, RecordPaymentInput } from './payments.schemas.js';

export const paymentsRouter = Router();

paymentsRouter.get(
  '/',
  validate({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listPayments(req.query as unknown as ListPaymentsInput));
  }),
);

paymentsRouter.post(
  '/',
  validate({ body: recordPaymentSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as RecordPaymentInput;
    res.status(201).json(await recordPayment(currentOwner(req).id, input, req));
  }),
);

paymentsRouter.post(
  '/:id/reverse',
  validate({ params: idParamSchema, body: reversePaymentSchema }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body as { reason: string };
    res.json(await reversePayment(currentOwner(req).id, req.params.id!, reason, req));
  }),
);
