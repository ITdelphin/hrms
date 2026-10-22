import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X, Octagon, CalendarPlus } from 'lucide-react';
import { useCreateLease, useEndLease, useExtendSchedule, useLeases, useProperties, useTenants } from '@/api';
import { Button, Card, EmptyState, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { SelectField, TextField } from '@/components/ui/Fields';
import { formatDate, formatMoney } from '@/lib/format';
import type { Lease } from '@/types';

const schema = z.object({
  propertyId: z.string().min(1, 'Select a property'),
  tenantId: z.string().min(1, 'Select a tenant'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  rentAmount: z.coerce.number().positive('Rent must be greater than 0'),
  deposit: z.coerce.number().min(0).default(0),
  dueDay: z.coerce.number().int().min(1).max(28).default(5),
  autoGenerateSchedule: z.boolean().default(true),
  scheduleMonths: z.coerce.number().int().min(1).max(60).default(12),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  propertyId: '',
  tenantId: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  rentAmount: 0,
  deposit: 0,
  dueDay: 5,
  autoGenerateSchedule: true,
  scheduleMonths: 12,
};

export const Leases = () => {
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'ENDED' | 'TERMINATED'>('ACTIVE');
  const [showForm, setShowForm] = useState(false);
  const [closeTarget, setCloseTarget] = useState<{ lease: Lease; mode: 'end' | 'terminate' } | null>(null);
  const [extendTarget, setExtendTarget] = useState<Lease | null>(null);

  const { data, isLoading, isError, error } = useLeases({ pageSize: 100, status: status || undefined });
  const properties = useProperties({ pageSize: 100 });
  const tenants = useTenants({ pageSize: 100 });
  const create = useCreateLease();
  const end = useEndLease('end');
  const terminate = useEndLease('terminate');
  const extend = useExtendSchedule();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const availableProperties = (properties.data?.data ?? []).filter((p) => p.status === 'AVAILABLE');
  const freeTenants = (tenants.data?.data ?? []).filter((t) => !t.activeLeaseId);

  const openCreate = () => {
    form.reset(defaults);
    setShowForm(true);
  };

  // Pre-fill rent when a property is chosen.
  const onPropertyChange = (id: string) => {
    const p = availableProperties.find((x) => x.id === id);
    if (p) form.setValue('rentAmount', p.monthlyRent, { shouldValidate: true });
  };

  const submit = form.handleSubmit(async (values) => {
    await create.mutateAsync({
      ...values,
      endDate: values.endDate || null,
    });
    setShowForm(false);
  });

  const doClose = async () => {
    if (!closeTarget) return;
    const mutation = closeTarget.mode === 'end' ? end : terminate;
    await mutation.mutateAsync({ id: closeTarget.lease.id });
    setCloseTarget(null);
  };

  const doExtend = async (months: number) => {
    if (!extendTarget) return;
    await extend.mutateAsync({ id: extendTarget.id, months });
    setExtendTarget(null);
  };

  const mutationError = (create.error ?? end.error ?? terminate.error ?? extend.error) as Error | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Leases</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Lease
        </Button>
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <Card>
        <div className="border-b border-slate-100 p-4">
          <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ACTIVE">Active</option>
            <option value="ENDED">Ended</option>
            <option value="TERMINATED">Terminated</option>
            <option value="">All</option>
          </select>
        </div>
        {isLoading && <Spinner />}
        {isError && <ErrorState message={(error as Error).message} />}
        {!isLoading && !isError && (
          <Table<Lease>
            columns={[
              { header: 'Tenant', cell: (l) => <span className="font-medium text-slate-800">{l.tenant.fullName}</span> },
              { header: 'Property', cell: (l) => `${l.property.name}${l.property.unitNumber ? ` #${l.property.unitNumber}` : ''}` },
              { header: 'Start', cell: (l) => formatDate(l.startDate) },
              { header: 'End', cell: (l) => (l.endDate ? formatDate(l.endDate) : 'Open-ended') },
              { header: 'Rent', cell: (l) => formatMoney(l.rentAmount) },
              { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
              {
                header: 'Outstanding',
                cell: (l) => (l.stats && l.stats.outstanding > 0 ? <span className="font-medium text-red-600">{formatMoney(l.stats.outstanding)}</span> : <span className="text-slate-400">—</span>),
              },
              {
                header: '',
                className: 'text-right',
                cell: (l) =>
                  l.status === 'ACTIVE' ? (
                    <div className="flex justify-end gap-1">
                      <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Extend billing" onClick={() => setExtendTarget(l)}>
                        <CalendarPlus className="h-4 w-4" />
                      </button>
                      <button className="rounded p-1.5 text-amber-500 hover:bg-amber-50" title="End lease" onClick={() => setCloseTarget({ lease: l, mode: 'end' })}>
                        <X className="h-4 w-4" />
                      </button>
                      <button className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Terminate lease" onClick={() => setCloseTarget({ lease: l, mode: 'terminate' })}>
                        <Octagon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null,
              },
            ]}
            rows={data?.data ?? []}
          />
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && <EmptyState message="No leases found." />}
      </Card>

      <Modal
        open={showForm}
        title="New Lease"
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              Create lease
            </Button>
          </>
        }
      >
        {availableProperties.length === 0 || freeTenants.length === 0 ? (
          <ErrorState message="You need an available property and a tenant without an active lease before creating a lease." />
        ) : (
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <div className="sm:col-span-2">
              <SelectField label="Property" error={form.formState.errors.propertyId?.message} {...form.register('propertyId', { onChange: (e) => onPropertyChange(e.target.value) })}>
                <option value="">Select property…</option>
                {availableProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.unitNumber ? ` #${p.unitNumber}` : ''} — {formatMoney(p.monthlyRent)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="sm:col-span-2">
              <SelectField label="Tenant" error={form.formState.errors.tenantId?.message} {...form.register('tenantId')}>
                <option value="">Select tenant…</option>
                {freeTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.phone})
                  </option>
                ))}
              </SelectField>
            </div>
            <TextField label="Start Date" type="date" error={form.formState.errors.startDate?.message} {...form.register('startDate')} />
            <TextField label="End Date (optional)" type="date" {...form.register('endDate')} />
            <TextField label="Rent Amount" type="number" step="0.01" error={form.formState.errors.rentAmount?.message} {...form.register('rentAmount')} />
            <TextField label="Deposit" type="number" step="0.01" {...form.register('deposit')} />
            <TextField label="Due Day (1-28)" type="number" {...form.register('dueDay')} />
            <TextField label="Schedule Months" type="number" hint="Months billed forward on creation" {...form.register('scheduleMonths')} />
          </form>
        )}
      </Modal>

      <Modal
        open={!!closeTarget}
        title={closeTarget?.mode === 'terminate' ? 'Terminate lease' : 'End lease'}
        onClose={() => setCloseTarget(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doClose} loading={end.isPending || terminate.isPending}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {closeTarget?.mode === 'terminate' ? 'Terminate' : 'End'} the lease for{' '}
          <span className="font-semibold">{closeTarget?.lease.tenant.fullName}</span>? The property will become available.
        </p>
      </Modal>

      <Modal
        open={!!extendTarget}
        title="Extend billing"
        onClose={() => setExtendTarget(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => doExtend(12)} loading={extend.isPending}>
              Add 12 months
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Generate 12 more billed months for <span className="font-semibold">{extendTarget?.tenant.fullName}</span>'s lease.
        </p>
      </Modal>
    </div>
  );
};
