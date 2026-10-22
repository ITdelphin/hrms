import { z } from 'zod';
import { moneyField } from '../properties/properties.schemas.js';

export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional();

const maintenanceFields = {
  propertyId: z.string().trim().min(1, 'Property is required').max(40),
  tenantId: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().min(2, 'Title is too short').max(150),
  description: optionalText(2000),
  status: z.enum(MAINTENANCE_STATUSES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  cost: moneyField.nullable(),
  reportedAt: z.coerce.date(),
};

export const createMaintenanceSchema = z.object({
  ...maintenanceFields,
  status: maintenanceFields.status.default('OPEN'),
  priority: maintenanceFields.priority.default('MEDIUM'),
  cost: maintenanceFields.cost.optional(),
  reportedAt: maintenanceFields.reportedAt.optional(),
});

/** Built from the raw fields, never from the create schema: `partial()` would re-apply its defaults. */
export const updateMaintenanceSchema = z
  .object(maintenanceFields)
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one field to change',
  });

export const transitionMaintenanceSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES),
});

export const listMaintenanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
  propertyId: z.string().trim().max(40).optional(),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type ListMaintenanceInput = z.infer<typeof listMaintenanceQuerySchema>;
