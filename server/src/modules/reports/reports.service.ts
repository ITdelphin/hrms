import ExcelJS from 'exceljs';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { MonthlyRow } from '../rents/rents.service.js';
import { monthlyTable, tenantStatement } from '../rents/rents.service.js';
import { listTenants } from '../tenants/tenants.service.js';
import { daysInMonth, toIsoDate } from '../../lib/date.js';
import { formatAmount, getCurrency } from '../../lib/settings.js';
import { prisma } from '../../lib/prisma.js';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ReportFile = { filename: string; contentType: string; buffer: Buffer };

export type ReportPeriod = { year: number; month: number; label: string };

export type MonthlySummary = {
  tenants: number;
  fullyPaid: number;
  partial: number;
  unpaid: number;
  billed: number;
  collected: number;
  outstanding: number;
};

export type MonthlyReportRow = MonthlyRow & { idNumber: string | null };

export type PaymentReportRow = {
  tenantName: string;
  propertyName: string | null;
  unitNumber: string | null;
  period: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: Date | null;
};

export type TenantReportRow = {
  fullName: string;
  phone: string;
  idNumber: string;
  email: string | null;
  house: string | null;
  outstanding: number;
};

export type StatementData = Awaited<ReturnType<typeof tenantStatement>>;

const STATUS_MARK: Record<MonthlyRow['status'], string> = {
  PAID: '✓ Paid',
  PARTIAL: '! Partial',
  UNPAID: '— Unpaid',
  NOT_BILLED: 'not billed',
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const houseLabel = (property: { name: string; unitNumber: string | null }): string =>
  property.unitNumber ? `${property.name} #${property.unitNumber}` : property.name;

const sanitizeFileToken = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);

const toBuffer = (value: Buffer | ArrayBuffer): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value);

// ---------------------------------------------------------------------------
// Pure buffer builders — no database, no HTTP, safe to unit-test with fixtures.
// ---------------------------------------------------------------------------

const MONTHLY_HEADERS = [
  'Tenant',
  'Phone',
  'ID Number',
  'House',
  'Unit',
  'Month',
  'Due Date',
  'Amount',
  'Paid',
  'Outstanding',
  'Status',
  'Paid On',
];

const MONTHLY_WIDTHS = [26, 16, 16, 22, 10, 12, 14, 14, 14, 14, 14, 16];

const styleHeaderRow = (row: ExcelJS.Row): void => {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
};

const markMoneyCells = (row: ExcelJS.Row, columns: number[]): void => {
  for (const column of columns) {
    row.getCell(column).numFmt = '#,##0.00';
  }
};

export const buildMonthlyWorkbook = async (
  rows: MonthlyReportRow[],
  summary: MonthlySummary,
  period: ReportPeriod,
  payments: PaymentReportRow[],
  currency: string,
): Promise<ReportFile> => {
  const generatedAt = new Date().toISOString();
  const wb = new ExcelJS.Workbook();

  const sheet = wb.addWorksheet('Rent Report');
  sheet.columns = MONTHLY_HEADERS.map((_, index) => ({ width: MONTHLY_WIDTHS[index] ?? 16 }));

  sheet.mergeCells('A1:L1');
  const title = sheet.getCell('A1');
  title.value = `HRMS Rent Report — ${period.label}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells('A2:L2');
  const stamp = sheet.getCell('A2');
  stamp.value = `Generated ${generatedAt} · amounts in ${currency}`;
  stamp.font = { italic: true, color: { argb: 'FF666666' } };

  styleHeaderRow(sheet.addRow(MONTHLY_HEADERS));
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  if (rows.length === 0) {
    const empty = sheet.addRow(['No records for this period']);
    sheet.mergeCells(empty.number, 1, empty.number, MONTHLY_HEADERS.length);
    empty.getCell(1).font = { italic: true, color: { argb: 'FF999999' } };
  } else {
    for (const row of rows) {
      const added = sheet.addRow([
        row.tenantName,
        row.phone,
        row.idNumber ?? '',
        row.propertyName,
        row.unitNumber ?? '',
        row.period,
        row.dueDate ? toIsoDate(row.dueDate) : '',
        row.amount,
        row.amountPaid,
        row.outstanding,
        STATUS_MARK[row.status],
        row.paidAt ? toIsoDate(row.paidAt) : '',
      ]);
      markMoneyCells(added, [8, 9, 10]);
    }
  }

  const statusCounts = {
    PAID: rows.filter((row) => row.status === 'PAID').length,
    PARTIAL: rows.filter((row) => row.status === 'PARTIAL').length,
    UNPAID: rows.filter((row) => row.status === 'UNPAID').length,
    NOT_BILLED: rows.filter((row) => row.status === 'NOT_BILLED').length,
  };

  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.columns = [{ width: 28 }, { width: 20 }];
  summarySheet.mergeCells('A1:B1');
  const summaryTitle = summarySheet.getCell('A1');
  summaryTitle.value = `Summary — ${period.label}`;
  summaryTitle.font = { bold: true, size: 13 };

  const addSummary = (label: string, value: string | number, money = false): void => {
    const added = summarySheet.addRow([label, value]);
    added.getCell(1).font = { bold: true };
    if (money) {
      added.getCell(2).numFmt = '#,##0.00';
    }
  };
  summarySheet.addRow([]);
  addSummary('Tenants', summary.tenants);
  addSummary('Billed (' + currency + ')', summary.billed, true);
  addSummary('Collected (' + currency + ')', summary.collected, true);
  addSummary('Outstanding (' + currency + ')', summary.outstanding, true);
  summarySheet.addRow([]);
  addSummary('Fully paid', statusCounts.PAID);
  addSummary('Partially paid', statusCounts.PARTIAL);
  addSummary('Unpaid', statusCounts.UNPAID);
  addSummary('Not billed', statusCounts.NOT_BILLED);

  const paySheet = wb.addWorksheet('Payments');
  const payHeaders = ['Tenant', 'House', 'Unit', 'Period', 'Amount', 'Method', 'Reference', 'Paid On'];
  paySheet.columns = payHeaders.map(() => ({ width: 18 }));
  styleHeaderRow(paySheet.addRow(payHeaders));
  paySheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  if (payments.length === 0) {
    const empty = paySheet.addRow(['No payments recorded for this period']);
    paySheet.mergeCells(empty.number, 1, empty.number, payHeaders.length);
    empty.getCell(1).font = { italic: true, color: { argb: 'FF999999' } };
  } else {
    for (const payment of payments) {
      const added = paySheet.addRow([
        payment.tenantName,
        payment.propertyName ?? '',
        payment.unitNumber ?? '',
        payment.period,
        payment.amount,
        payment.method,
        payment.reference ?? '',
        payment.paidAt ? toIsoDate(payment.paidAt) : '',
      ]);
      added.getCell(5).numFmt = '#,##0.00';
    }
  }

  const buffer = toBuffer(await wb.xlsx.writeBuffer());
  return {
    filename: `hrms-rent-report-${period.year}-${pad2(period.month)}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    buffer,
  };
};

const docxCell = (
  text: string,
  options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): TableCell =>
  new TableCell({
    children: [
      new Paragraph({
        alignment: options.align,
        children: [new TextRun({ text, bold: options.bold })],
      }),
    ],
  });

const docxHeaderRow = (headers: string[]): TableRow =>
  new TableRow({
    tableHeader: true,
    children: headers.map((header) => docxCell(header, { bold: true, align: AlignmentType.CENTER })),
  });

const docxMoney = (value: number, currency: string): string => formatAmount(value, currency);

export const buildMonthlyDocument = async (
  rows: MonthlyReportRow[],
  summary: MonthlySummary,
  period: ReportPeriod,
  currency: string,
): Promise<ReportFile> => {
  const generatedAt = new Date().toISOString();
  const headers = ['Tenant', 'House', 'Month', 'Amount', 'Paid', 'Balance', 'Status'];

  const rentRows: TableRow[] = [docxHeaderRow(headers)];
  if (rows.length === 0) {
    rentRows.push(
      new TableRow({
        children: [
          docxCell('No records for this period'),
          docxCell(''),
          docxCell(''),
          docxCell(''),
          docxCell(''),
          docxCell(''),
          docxCell(''),
        ],
      }),
    );
  } else {
    for (const row of rows) {
      rentRows.push(
        new TableRow({
          children: [
            docxCell(row.tenantName),
            docxCell(row.unitNumber ? `${row.propertyName} #${row.unitNumber}` : row.propertyName),
            docxCell(row.period),
            docxCell(docxMoney(row.amount, currency), { align: AlignmentType.RIGHT }),
            docxCell(docxMoney(row.amountPaid, currency), { align: AlignmentType.RIGHT }),
            docxCell(docxMoney(row.outstanding, currency), { align: AlignmentType.RIGHT }),
            docxCell(STATUS_MARK[row.status], { align: AlignmentType.CENTER }),
          ],
        }),
      );
    }
  }

  const summaryTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [docxCell('Period', { bold: true }), docxCell(period.label)] }),
      new TableRow({ children: [docxCell('Tenants', { bold: true }), docxCell(String(summary.tenants))] }),
      new TableRow({ children: [docxCell('Billed', { bold: true }), docxCell(docxMoney(summary.billed, currency))] }),
      new TableRow({ children: [docxCell('Collected', { bold: true }), docxCell(docxMoney(summary.collected, currency))] }),
      new TableRow({ children: [docxCell('Outstanding', { bold: true }), docxCell(docxMoney(summary.outstanding, currency))] }),
    ],
  });

  const rentTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rentRows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('HRMS Rent Report')] }),
          new Paragraph({
            children: [new TextRun({ text: `${period.label} · generated ${generatedAt}`, italics: true })],
          }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Summary')] }),
          summaryTable,
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Tenants')] }),
          rentTable,
        ],
      },
    ],
  });

  const buffer = toBuffer(await Packer.toBuffer(doc));
  return {
    filename: `hrms-rent-report-${period.year}-${pad2(period.month)}.docx`,
    contentType: DOCX_CONTENT_TYPE,
    buffer,
  };
};

const TENANT_HEADERS = ['Full Name', 'Phone', 'ID Number', 'Email', 'Assigned House', 'Outstanding Balance'];

export const buildTenantsWorkbook = async (
  rows: TenantReportRow[],
  currency: string,
): Promise<ReportFile> => {
  const generatedAt = new Date().toISOString();
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Tenants');
  sheet.columns = TENANT_HEADERS.map(() => ({ width: 22 }));

  sheet.mergeCells('A1:F1');
  const title = sheet.getCell('A1');
  title.value = 'HRMS Tenant Register';
  title.font = { bold: true, size: 14 };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells('A2:F2');
  const stamp = sheet.getCell('A2');
  stamp.value = `Generated ${generatedAt} · balances in ${currency}`;
  stamp.font = { italic: true, color: { argb: 'FF666666' } };

  styleHeaderRow(sheet.addRow(TENANT_HEADERS));
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  if (rows.length === 0) {
    const empty = sheet.addRow(['No tenant records']);
    sheet.mergeCells(empty.number, 1, empty.number, TENANT_HEADERS.length);
    empty.getCell(1).font = { italic: true, color: { argb: 'FF999999' } };
  } else {
    for (const row of rows) {
      const added = sheet.addRow([
        row.fullName,
        row.phone,
        row.idNumber,
        row.email ?? '',
        row.house ?? 'Unassigned',
        row.outstanding,
      ]);
      added.getCell(6).numFmt = '#,##0.00';
    }
  }

  const buffer = toBuffer(await wb.xlsx.writeBuffer());
  return { filename: 'hrms-tenants.xlsx', contentType: XLSX_CONTENT_TYPE, buffer };
};

export const buildStatementDocument = async (
  data: StatementData,
  currency: string,
): Promise<ReportFile> => {
  const generatedAt = new Date().toISOString();
  const months = data.leases.flatMap((lease) =>
    lease.months.map((month) => ({ ...month, house: houseLabel(lease.property) })),
  );
  const payments = data.leases.flatMap((lease) =>
    lease.months.flatMap((month) =>
      month.payments.map((payment) => ({ ...payment, period: month.period })),
    ),
  );

  const monthHeaders = ['Month', 'House', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'];
  const monthRows: TableRow[] = [docxHeaderRow(monthHeaders)];
  if (months.length === 0) {
    monthRows.push(
      new TableRow({
        children: [docxCell('No billed months'), docxCell(''), docxCell(''), docxCell(''), docxCell(''), docxCell(''), docxCell('')],
      }),
    );
  } else {
    for (const month of months) {
      monthRows.push(
        new TableRow({
          children: [
            docxCell(month.period),
            docxCell(month.house),
            docxCell(toIsoDate(month.dueDate)),
            docxCell(docxMoney(month.amount, currency), { align: AlignmentType.RIGHT }),
            docxCell(docxMoney(month.amountPaid, currency), { align: AlignmentType.RIGHT }),
            docxCell(docxMoney(month.outstanding, currency), { align: AlignmentType.RIGHT }),
            docxCell(STATUS_MARK[month.status], { align: AlignmentType.CENTER }),
          ],
        }),
      );
    }
  }

  const payHeaders = ['Paid On', 'Month', 'Method', 'Reference', 'Amount'];
  const payRows: TableRow[] = [docxHeaderRow(payHeaders)];
  if (payments.length === 0) {
    payRows.push(
      new TableRow({
        children: [docxCell('No payments recorded'), docxCell(''), docxCell(''), docxCell(''), docxCell('')],
      }),
    );
  } else {
    for (const payment of payments) {
      payRows.push(
        new TableRow({
          children: [
            docxCell(payment.paidAt ? toIsoDate(payment.paidAt) : ''),
            docxCell(payment.period),
            docxCell(String(payment.method)),
            docxCell(payment.reference ?? ''),
            docxCell(docxMoney(payment.amount, currency), { align: AlignmentType.RIGHT }),
          ],
        }),
      );
    }
  }

  const totalsTable = new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [docxCell('Total billed', { bold: true }), docxCell(docxMoney(data.totals.billed, currency))] }),
      new TableRow({ children: [docxCell('Total paid', { bold: true }), docxCell(docxMoney(data.totals.paid, currency))] }),
      new TableRow({ children: [docxCell('Outstanding', { bold: true }), docxCell(docxMoney(data.totals.outstanding, currency))] }),
    ],
  });

  const metaLine = (label: string, value: string): Paragraph =>
    new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`Rent Statement — ${data.tenant.fullName}`)] }),
          new Paragraph({ children: [new TextRun({ text: `Generated ${generatedAt}`, italics: true })] }),
          metaLine('Phone', data.tenant.phone),
          metaLine('ID number', data.tenant.idNumber),
          metaLine('Email', data.tenant.email ?? '—'),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Totals')] }),
          totalsTable,
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Billed months')] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: monthRows }),
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Payment history')] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: payRows }),
        ],
      },
    ],
  });

  const buffer = toBuffer(await Packer.toBuffer(doc));
  return {
    filename: `hrms-tenant-statement-${sanitizeFileToken(data.tenant.id)}.docx`,
    contentType: DOCX_CONTENT_TYPE,
    buffer,
  };
};

// ---------------------------------------------------------------------------
// Data-fetching wrappers used by the routes. They resolve the DB, then hand the
// plain arrays to the pure builders above.
// ---------------------------------------------------------------------------

const withIdNumbers = async (rows: MonthlyRow[]): Promise<MonthlyReportRow[]> => {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((row) => row.tenantId)));
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, idNumber: true },
  });
  const lookup = new Map(tenants.map((tenant) => [tenant.id, tenant.idNumber]));
  return rows.map((row) => ({ ...row, idNumber: lookup.get(row.tenantId) ?? null }));
};

const collectMonthPayments = async (
  year: number,
  month: number,
  propertyId?: string,
): Promise<PaymentReportRow[]> => {
  const { listPayments } = await import('../payments/payments.service.js');
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month - 1, daysInMonth(year, month)));
  const pageSize = 100;
  const out: PaymentReportRow[] = [];
  let page = 1;
  for (;;) {
    const result = await listPayments({
      page,
      pageSize,
      from,
      to,
      includeReversed: false,
      ...(propertyId ? { propertyId } : {}),
    });
    for (const payment of result.data) {
      const schedule = payment.rentSchedule;
      out.push({
        tenantName: payment.tenant?.fullName ?? '',
        propertyName: payment.lease?.property?.name ?? null,
        unitNumber: payment.lease?.property?.unitNumber ?? null,
        period: schedule ? `${schedule.periodYear}-${pad2(schedule.periodMonth)}` : '',
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference ?? null,
        paidAt: payment.paidAt ?? null,
      });
    }
    if (page >= result.meta.pages) break;
    page += 1;
  }
  return out;
};

const collectTenants = async (): Promise<TenantReportRow[]> => {
  const pageSize = 100;
  const out: TenantReportRow[] = [];
  let page = 1;
  for (;;) {
    const result = await listTenants({ page, pageSize, status: 'ALL' });
    for (const tenant of result.data) {
      const house = tenant.assignedHouse ? houseLabel(tenant.assignedHouse) : null;
      out.push({
        fullName: tenant.fullName,
        phone: tenant.phone,
        idNumber: tenant.idNumber,
        email: tenant.email ?? null,
        house,
        outstanding: tenant.outstanding,
      });
    }
    if (page >= result.meta.pages) break;
    page += 1;
  }
  return out;
};

export const rentReportWorkbook = async (
  year: number,
  month: number,
  propertyId?: string,
): Promise<ReportFile> => {
  const table = await monthlyTable(year, month, propertyId ? { propertyId } : undefined);
  const [rows, payments, currency] = await Promise.all([
    withIdNumbers(table.rows),
    collectMonthPayments(year, month, propertyId),
    getCurrency(),
  ]);
  return buildMonthlyWorkbook(rows, table.summary, table.period, payments, currency);
};

export const rentReportDocument = async (
  year: number,
  month: number,
  propertyId?: string,
): Promise<ReportFile> => {
  const table = await monthlyTable(year, month, propertyId ? { propertyId } : undefined);
  const [rows, currency] = await Promise.all([withIdNumbers(table.rows), getCurrency()]);
  return buildMonthlyDocument(rows, table.summary, table.period, currency);
};

export const tenantsWorkbook = async (): Promise<ReportFile> => {
  const [rows, currency] = await Promise.all([collectTenants(), getCurrency()]);
  return buildTenantsWorkbook(rows, currency);
};

export const statementDocument = async (tenantId: string): Promise<ReportFile> => {
  const [data, currency] = await Promise.all([tenantStatement(tenantId), getCurrency()]);
  return buildStatementDocument(data, currency);
};
