import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const pageMeta = (total: number, page: number, pageSize: number) => ({
  total,
  page,
  pageSize,
  pages: Math.max(1, Math.ceil(total / pageSize)),
});

export const idParamSchema = z.object({ id: z.string().min(1).max(40) });
