import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Home, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCreateLease, useCreateTenant, useDeleteTenant, useProperties, useTenants, useUpdateTenant } from '@/api';
import { Button, Card, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Fields';
import { formatMoney } from '@/lib/format';
import type { Tenant } from '@/types';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Full name is too short'),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 \-()]{6,19}$/, 'Enter a valid phone number'),
  idNumber: z.string().trim().min(3, 'ID number is too short').regex(/^[A-Za-z0-9\-\/]+$/, 'Letters, numbers, - and / only'),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  postalAddress: z.string().trim().max(160).optional(),
  emergencyContact: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  assignHouseId: z.string().optional(),
  leaseStartDate: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  fullName: '',
  phone: '',
  idNumber: '',
  email: '',
  postalAddress: '',
  emergencyContact: '',
  notes: '',
  assignHouseId: '',
  leaseStartDate: new Date().toISOString().slice(0, 10),
};

export const Tenants = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | 'HOUSED' | 'NOT_HOUSED'>('ALL');
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [showForm, setShowForm] = useState(params.get('new') === '1');
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);

  const { data, isLoading, isError, error } = useTenants({ pageSize: 100, search: search || undefined, status });
  const availableHouses = useProperties({ pageSize: 100, status: 'AVAILABLE' });
  const create = useCreateTenant();
  const update = useUpdateTenant();
  const remove = useDeleteTenant();
  const createLease = useCreateLease();

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowForm(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });
  const selectedHouseId = form.watch('assignHouseId');
  const selectedHouse = (availableHouses.data?.data ?? []).find((p) => p.id === selectedHouseId);

  const openCreate = () => {
    setEditing(null);
    form.reset({ ...emptyValues, leaseStartDate: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };
  const openEdit = (t: Tenant) => {
    setEditing(t);
    form.reset({
      fullName: t.fullName,
      phone: t.phone,
      idNumber: t.idNumber,
      email: t.email ?? '',
      postalAddress: t.postalAddress ?? '',
      emergencyContact: t.emergencyContact ?? '',
      notes: t.notes ?? '',
      assignHouseId: '',
      leaseStartDate: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  };

  const submit = form.handleSubmit(async (values) => {
    const { assignHouseId, leaseStartDate, ...tenantFields } = values;
    const payload = {
      ...tenantFields,
      email: values.email || null,
      postalAddress: values.postalAddress || null,
      emergencyContact: values.emergencyContact || null,
      notes: values.notes || null,
    };

    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
    } else {
      const { tenant } = await create.mutateAsync(payload);
      if (assignHouseId && selectedHouse) {
        await createLease.mutateAsync({
          propertyId: assignHouseId,
          tenantId: tenant.id,
          startDate: leaseStartDate || new Date().toISOString().slice(0, 10),
          rentAmount: selectedHouse.monthlyRent,
          deposit: selectedHouse.deposit,
          dueDay: 5,
          autoGenerateSchedule: true,
          scheduleMonths: 12,
        });
      }
    }
    setShowForm(false);
  });

  const doDelete = async () => {
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const mutationError = (create.error ?? update.error ?? remove.error ?? createLease.error) as Error | null;
  const saving = create.isPending || update.isPending || createLease.isPending;
  const houses = availableHouses.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Tenants</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Tenant
        </Button>
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, phone, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ALL">All tenants</option>
            <option value="HOUSED">Housed</option>
            <option value="NOT_HOUSED">Not housed</option>
          </select>
        </div>
        {isLoading && <Spinner />}
        {isError && <ErrorState message={(error as Error).message} />}
        {!isLoading && !isError && (
          <Table<Tenant>
            columns={[
              { header: 'Name', cell: (t) => <span className="font-medium text-slate-800">{t.fullName}</span> },
              { header: 'Phone', cell: (t) => t.phone },
              { header: 'ID', cell: (t) => t.idNumber },
              { header: 'House', cell: (t) => (t.assignedHouse ? `${t.assignedHouse.name}${t.assignedHouse.unitNumber ? ` #${t.assignedHouse.unitNumber}` : ''}` : '—') },
              {
                header: 'Outstanding',
                cell: (t) => (t.outstanding > 0 ? <span className="font-medium text-red-600">{formatMoney(t.outstanding)}</span> : <span className="text-slate-400">—</span>),
              },
              {
                header: '',
                className: 'text-right',
                cell: (t) => (
                  <div className="flex justify-end gap-1">
                    <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded p-1.5 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(t)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={data?.data ?? []}
          />
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && <EmptyState message="No tenants yet." />}
      </Card>

      <Modal
        open={showForm}
        title={editing ? 'Edit Tenant' : 'Add Tenant'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Save changes' : selectedHouseId ? 'Add & assign house' : 'Create'}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div className="sm:col-span-2">
            <TextField label="Full Name" error={form.formState.errors.fullName?.message} {...form.register('fullName')} />
          </div>
          <TextField label="Phone" error={form.formState.errors.phone?.message} {...form.register('phone')} />
          <TextField label="ID Number" error={form.formState.errors.idNumber?.message} {...form.register('idNumber')} />
          <TextField label="Email" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
          <TextField label="Postal Address" {...form.register('postalAddress')} />
          <div className="sm:col-span-2">
            <TextField label="Emergency Contact" {...form.register('emergencyContact')} />
          </div>
          <div className="sm:col-span-2">
            <TextAreaField label="Notes" {...form.register('notes')} />
          </div>

          {!editing && (
            <div className="sm:col-span-2 mt-1 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Home className="h-4 w-4 text-brand-600" /> Assign an available house (optional)
              </div>
              <SelectField label="Available house" {...form.register('assignHouseId')}>
                <option value="">Don't assign yet</option>
                {houses.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.unitNumber ? ` #${p.unitNumber}` : ''} — {formatMoney(p.monthlyRent)}/mo
                  </option>
                ))}
              </SelectField>
              {selectedHouseId && (
                <div className="mt-4 max-w-[220px]">
                  <TextField label="Lease start date" type="date" {...form.register('leaseStartDate')} />
                </div>
              )}
              {houses.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">No available houses right now. Add a property first, or assign later via Leases.</p>
              )}
              {selectedHouse && (
                <p className="mt-2 text-xs text-slate-500">
                  A lease will be created for <span className="font-medium">{selectedHouse.name}</span> at{' '}
                  <span className="font-medium">{formatMoney(selectedHouse.monthlyRent)}/month</span> (rent auto-filled from the property).
                </p>
              )}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete tenant"
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
          Remove <span className="font-semibold">{deleteTarget?.fullName}</span>? Tenants with an active lease cannot be
          deleted.
        </p>
      </Modal>
    </div>
  );
};
