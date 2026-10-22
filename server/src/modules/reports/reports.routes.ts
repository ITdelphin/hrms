import { Router } from 'express';
import { recordAudit } from '../../lib/audit.js';
import { asyncHandler } from '../../lib/errors.js';
import { idParamSchema } from '../../lib/http.js';
import { monthLabel } from '../../lib/date.js';
import { currentOwner } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import type { MonthReportQuery } from './reports.schemas.js';
import { monthReportQuerySchema } from './reports.schemas.js';
import type { ReportFile } from './reports.service.js';
import { rentReportDocument, rentReportWorkbook, statementDocument, tenantsWorkbook } from './reports.service.js';

export const reportsRouter = Router();

const sendReport = (res: import('express').Response, file: ReportFile): void => {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(file.buffer);
};

reportsRouter.get(
  '/monthly.xlsx',
  validate({ query: monthReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const { year, month, propertyId } = req.query as unknown as MonthReportQuery;
    const file = await rentReportWorkbook(year, month, propertyId);
    await recordAudit({
      ownerId: currentOwner(req).id,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      summary: `Excel rent report exported for ${monthLabel(year, month)}`,
      req,
    });
    sendReport(res, file);
  }),
);

reportsRouter.get(
  '/monthly.docx',
  validate({ query: monthReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const { year, month, propertyId } = req.query as unknown as MonthReportQuery;
    const file = await rentReportDocument(year, month, propertyId);
    await recordAudit({
      ownerId: currentOwner(req).id,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      summary: `Word rent report exported for ${monthLabel(year, month)}`,
      req,
    });
    sendReport(res, file);
  }),
);

reportsRouter.get(
  '/tenants.xlsx',
  asyncHandler(async (req, res) => {
    const file = await tenantsWorkbook();
    await recordAudit({
      ownerId: currentOwner(req).id,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      summary: 'Tenant register exported (Excel)',
      req,
    });
    sendReport(res, file);
  }),
);

reportsRouter.get(
  '/tenants/:id/statement.docx',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id!;
    const file = await statementDocument(tenantId);
    await recordAudit({
      ownerId: currentOwner(req).id,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      summary: `Rent statement exported for tenant ${tenantId}`,
      req,
    });
    sendReport(res, file);
  }),
);
