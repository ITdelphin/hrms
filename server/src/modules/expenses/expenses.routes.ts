import { Router } from 'express';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expenses.schemas.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './expenses.service.js';
import type { CreateExpenseInput, ListExpensesInput, UpdateExpenseInput } from './expenses.schemas.js';

export const expensesRouter = Router();

expensesRouter.get(
  '/',
  validate({ query: listExpensesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listExpenses(req.query as unknown as ListExpensesInput));
  }),
);

expensesRouter.post(
  '/',
  validate({ body: createExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ expense: await createExpense(currentOwner(req).id, req.body as CreateExpenseInput, req) });
  }),
);

expensesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateExpenseSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      expense: await updateExpense(currentOwner(req).id, req.params.id!, req.body as UpdateExpenseInput, req),
    });
  }),
);

expensesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteExpense(currentOwner(req).id, req.params.id!, req);
    res.status(204).send();
  }),
);
