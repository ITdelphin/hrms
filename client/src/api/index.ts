import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AppNotification,
  DashboardSummary,
  Lease,
  ListResult,
  MaintenanceRequest,
  Owner,
  Payment,
  Property,
  Settings,
  Tenant,
  UpcomingPayment,
} from '@/types';

type Params = Record<string, string | number | boolean | undefined | null>;

// --- Dashboard ------------------------------------------------------------
export const useDashboard = (months = 6) =>
  useQuery({
    queryKey: ['dashboard', months],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary', { months }),
  });

// --- Properties -----------------------------------------------------------
export const useProperties = (params?: Params) =>
  useQuery({
    queryKey: ['properties', params],
    queryFn: () => api.get<ListResult<Property>>('/properties', params),
  });

export const useCreateProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ property: Property }>('/properties', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
};

export const useUpdateProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ property: Property }>(`/properties/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
};

export const useDeleteProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/properties/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
};

// --- Tenants --------------------------------------------------------------
export const useTenants = (params?: Params) =>
  useQuery({
    queryKey: ['tenants', params],
    queryFn: () => api.get<ListResult<Tenant>>('/tenants', params),
  });

export const useCreateTenant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ tenant: Tenant }>('/tenants', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  });
};

export const useUpdateTenant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ tenant: Tenant }>(`/tenants/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  });
};

export const useDeleteTenant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  });
};

// --- Leases ---------------------------------------------------------------
export const useLeases = (params?: Params) =>
  useQuery({
    queryKey: ['leases', params],
    queryFn: () => api.get<ListResult<Lease>>('/leases', params),
  });

export const useCreateLease = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ lease: Lease; billedPeriods: number }>('/leases', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
};

export const useEndLease = (mode: 'end' | 'terminate') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; endDate?: string; reason?: string }) =>
      api.post<{ lease: Lease }>(`/leases/${id}/${mode}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
};

export const useExtendSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, months }: { id: string; months: number }) =>
      api.post<{ created: number }>(`/leases/${id}/schedule/extend`, { months }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leases'] }),
  });
};

// --- Payments -------------------------------------------------------------
export const usePayments = (params?: Params) =>
  useQuery({
    queryKey: ['payments', params],
    queryFn: () =>
      api.get<ListResult<Payment> & { totals: { collected: number } }>('/payments', params),
  });

export const useRecordPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ payment: Payment }>('/payments', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['leases'] });
    },
  });
};

export const useReversePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<{ payment: Payment }>(`/payments/${id}/reverse`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// --- Maintenance ----------------------------------------------------------
export const useMaintenance = (params?: Params) =>
  useQuery({
    queryKey: ['maintenance', params],
    queryFn: () => api.get<ListResult<MaintenanceRequest>>('/maintenance', params),
  });

export const useCreateMaintenance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ request: MaintenanceRequest }>('/maintenance', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
};

export const useTransitionMaintenance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post<{ request: MaintenanceRequest }>(`/maintenance/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
};

export const useDeleteMaintenance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/maintenance/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });
};

// --- Notifications --------------------------------------------------------
export interface NotificationConfig {
  provider: { name: string; type: string; [k: string]: unknown };
  scheduler: { [k: string]: unknown };
  stats: { total: number; sent: number; failed: number };
}

export const useNotifications = (params?: Params) =>
  useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api.get<ListResult<AppNotification>>('/notifications', params),
  });

export const useNotificationConfig = () =>
  useQuery({
    queryKey: ['notifications', 'config'],
    queryFn: () => api.get<NotificationConfig>('/notifications/config'),
  });

export const useUpcomingPayments = () =>
  useQuery({
    queryKey: ['notifications', 'upcoming'],
    queryFn: () => api.get<{ data: UpcomingPayment[] }>('/notifications/upcoming'),
  });

export const useRunReminders = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ result: unknown }>('/notifications/run'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
};

export const useSendTestNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (to: string) => api.post<{ result: unknown }>('/notifications/test', { to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
};

// --- Settings -------------------------------------------------------------
export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { currency?: string; reminderDays?: number }) =>
      api.patch<Settings>('/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// --- Profile --------------------------------------------------------------
export const useUpdateProfile = () =>
  useMutation({
    mutationFn: (body: { fullName?: string; phone?: string | null }) =>
      api.patch<{ owner: Owner }>('/auth/me', body),
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/password', body),
  });
