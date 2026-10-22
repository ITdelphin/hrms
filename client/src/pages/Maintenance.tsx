import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { useCreateMaintenance, useDeleteMaintenance, useMaintenance, useProperties, useTransitionMaintenance } from '@/api';
import { Button, Card, EmptyState, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Fields';
import { formatDate, formatMoney } from '@/lib/format';
import type { MaintenanceRequest, MaintenanceStatus } from '@/types';

const STATUSES: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const schema = z.object({
  propertyId: z.string().min(1, 'Property is required'),
  tenantId: z.string().optional(),
  title: z.string().trim().min(2, 'Title is too short'),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(STATUSES as [string, ...string[]]).default('OPEN'),
  priority: z.enum(PRIORITIES as [string, ...string[]]).default('MEDIUM'),
  cost: z.coerce.number().min(0).optional(),
  reportedAt: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  propertyId: '',
  tenantId: '',
  title: '',
  description: '',
  status: 'OPEN',
  priority: 'MEDIUM',
  cost: undefined,
  reportedAt: new Date().toISOString().slice(0, 10),
};

export const Maintenance = () => {
  const [statusFilter, setStatusFilter] = useState<'' | MaintenanceStatus>('');
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRequest | null>(null);

  const { data, isLoading, isError, error } = useMaintenance({ pageSize: 100, status: statusFilter || undefined });
  const properties = useProperties({ pageSize: 100 });
  const create = useCreateMaintenance();
  const transition = useTransitionMaintenance();
  const remove = useDeleteMaintenance();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const openCreate = () => {
    form.reset(defaults);
    setShowForm(true);
  };

  const submit = form.handleSubmit(async (values) => {
    await create.mutateAsync({
      ...values,
      tenantId: values.tenantId || null,
      description: values.description || null,
      cost: values.cost ?? null,
    });
    setShowForm(false);
  });

  const doDelete = async () => {
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const mutationError = (create.error ?? transition.error ?? remove.error) as Error | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Maintenance</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Request
        </Button>
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <Card>
        <div className="border-b border-slate-100 p-4">
          <select className="input max-w-[200px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <Spinner />}
        {isError && <ErrorState message={(error as Error).message} />}
        {!isLoading && !isError && (
          <Table<MaintenanceRequest>
            columns={[
              { header: 'Title', cell: (m) => <span className="font-medium text-slate-800">{m.title}</span> },
              { header: 'Property', cell: (m) => m.property?.name ?? '—' },
              { header: 'Priority', cell: (m) => <StatusBadge status={m.priority} /> },
              { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
              { header: 'Cost', cell: (m) => (m.cost != null ? formatMoney(m.cost) : '—') },
              { header: 'Reported', cell: (m) => formatDate(m.reportedAt) },
              {
                header: 'Move to',
                cell: (m) => (
                  <select
                    className="input max-w-[160px] py-1 text-xs"
                    value={m.status}
                    onChange={(e) => transition.mutate({ id: m.id, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                header: '',
                className: 'text-right',
                cell: (m) => (
                  <button className="rounded p-1.5 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(m)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                ),
              },
            ]}
            rows={data?.data ?? []}
          />
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && <EmptyState message="No maintenance requests." />}
      </Card>

      <Modal
        open={showForm}
        title="New Maintenance Request"
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              Create
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div className="sm:col-span-2">
            <TextField label="Title" error={form.formState.errors.title?.message} {...form.register('title')} />
          </div>
          <SelectField label="Property" error={form.formState.errors.propertyId?.message} {...form.register('propertyId')}>
            <option value="">Select property…</option>
            {(properties.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.unitNumber ? ` #${p.unitNumber}` : ''}
              </option>
            ))}
          </SelectField>
          <SelectField label="Priority" {...form.register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <TextField label="Cost (optional)" type="number" step="0.01" {...form.register('cost')} />
          <TextField label="Reported Date" type="date" {...form.register('reportedAt')} />
          <div className="sm:col-span-2">
            <TextAreaField label="Description" {...form.register('description')} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete request"
        onClose={() => setDeleteTarget(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} loading={remove.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{deleteTarget?.title}</span>?
        </p>
      </Modal>
    </div>
  );
};
