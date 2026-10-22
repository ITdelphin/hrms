// Types mirroring the HRMS backend API responses.

export type ISODate = string;

export interface Owner {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  lastLoginAt: ISODate | null;
  createdAt: ISODate;
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ListResult<T> {
  data: T[];
  meta: PageMeta;
}

// --- Properties -----------------------------------------------------------
export type PropertyType = 'HOUSE' | 'APARTMENT' | 'BEDSITTER' | 'STUDIO' | 'SHOP' | 'OFFICE';
export type PropertyStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'OFFLINE';

export interface TenantRef {
  id: string;
  fullName: string;
  phone?: string;
  idNumber?: string;
  email?: string | null;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  unitNumber: string | null;
  type: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  monthlyRent: number;
  deposit: number;
  status: PropertyStatus;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  currentTenant?: TenantRef | null;
  currentLease?: { id: string; startDate: ISODate; endDate: ISODate | null; rentAmount: number } | null;
  openMaintenance?: number;
}

// --- Tenants --------------------------------------------------------------
export interface PropertyRef {
  id: string;
  name: string;
  unitNumber: string | null;
  address?: string;
}

export interface LeaseRef {
  id: string;
  status: string;
  startDate: ISODate;
  endDate: ISODate | null;
  property: PropertyRef;
}

export interface Tenant {
  id: string;
  fullName: string;
  phone: string;
  idNumber: string;
  email: string | null;
  postalAddress: string | null;
  emergencyContact: string | null;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  assignedHouse: PropertyRef | null;
  activeLeaseId: string | null;
  leaseHistory: LeaseRef[];
  outstanding: number;
  overdueCount: number;
}

// --- Leases ---------------------------------------------------------------
export type LeaseStatus = 'ACTIVE' | 'ENDED' | 'TERMINATED';

export interface LeaseStats {
  periods: number;
  unpaidPeriods: number;
  overduePeriods: number;
  billed: number;
  paid: number;
  outstanding: number;
}

export interface Lease {
  id: string;
  propertyId: string;
  tenantId: string;
  startDate: ISODate;
  endDate: ISODate | null;
  rentAmount: number;
  deposit: number;
  dueDay: number;
  status: LeaseStatus;
  autoGenerateSchedule: boolean;
  notes: string | null;
  property: PropertyRef & { status?: PropertyStatus };
  tenant: TenantRef;
  stats?: LeaseStats;
}

export interface RentScheduleItem {
  id: string;
  periodYear: number;
  periodMonth: number;
  dueDate: ISODate;
  amount: number;
  amountPaid: number;
  status: RentStatus;
  paidAt: ISODate | null;
}

export type RentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

// --- Payments -------------------------------------------------------------
export type PaymentMethod = 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE' | 'MOBILE_APP' | 'OTHER';

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: ISODate;
  reversed: boolean;
  rentSchedule: {
    id: string;
    periodYear: number;
    periodMonth: number;
    amount: number;
    amountPaid: number;
    status: RentStatus;
    dueDate: ISODate;
  };
  tenant: TenantRef;
  lease: { id: string; property: PropertyRef };
  propertyName: string | null;
}

// --- Maintenance ----------------------------------------------------------
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  tenantId: string | null;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  cost: number | null;
  reportedAt: ISODate;
  resolvedAt: ISODate | null;
  property?: PropertyRef;
  tenant?: TenantRef | null;
}

// --- Notifications --------------------------------------------------------
export type NotificationEvent =
  | 'RENT_REMINDER'
  | 'RENT_OVERDUE'
  | 'PAYMENT_RECEIVED'
  | 'LEASE_CREATED'
  | 'LEASE_EXPIRING';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface AppNotification {
  id: string;
  event: NotificationEvent;
  channel: string;
  recipient: string;
  recipientName: string | null;
  subject: string;
  body: string;
  status: NotificationStatus;
  error: string | null;
  sentAt: ISODate | null;
  createdAt: ISODate;
  tenant?: { id: string; fullName: string } | null;
}

export interface UpcomingPayment {
  rentScheduleId: string;
  tenantId: string;
  tenantName: string;
  hasEmail: boolean;
  period: string;
  dueDate: ISODate;
  amount: number;
  amountPaid: number;
  balance: number;
  status: RentStatus;
}

// --- Dashboard ------------------------------------------------------------
export interface DashboardMonthly {
  period: string;
  billed: number;
  billedPaid: number;
  received: number;
  expenses: number;
}

export interface DashboardSummary {
  currency: string;
  income: {
    collectedThisMonth: number;
    collectedThisYear: number;
    billedThisMonth: number;
    outstandingThisMonth: number;
    collectionRate: number;
    totalOutstanding: number;
  };
  rent: {
    unpaidThisMonth: number;
    overduePeriods: number;
    topDebtors: Array<{
      tenantId: string;
      tenantName: string;
      phone: string;
      outstanding: number;
      overduePeriods: number;
      earliestDueDate: ISODate;
    }>;
  };
  expenses: { thisMonth: number; thisYear: number };
  net: { thisMonth: number; thisYear: number };
  occupancy: {
    properties: number;
    occupied: number;
    available: number;
    maintenance: number;
    offline: number;
    rate: number;
    tenants: number;
    potentialMonthlyRent: number;
  };
  maintenance: {
    open: number;
    byStatus: Array<{ status: MaintenanceStatus; count: number }>;
  };
  monthly: DashboardMonthly[];
  recentPayments: Array<{
    id: string;
    tenantName: string;
    property: string;
    amount: number;
    method: PaymentMethod;
    paidAt: ISODate;
  }>;
}

// --- Settings -------------------------------------------------------------
export interface Settings {
  currency: string;
  reminderDays: number;
  defaults: { currency: string; reminderDays: number };
}
