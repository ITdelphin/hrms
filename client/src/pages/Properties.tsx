import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCreateProperty, useDeleteProperty, useProperties, useUpdateProperty } from '@/api';
import { Button, Card, EmptyState, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { SelectField, TextField, TextAreaField } from '@/components/ui/Fields';
import { formatMoney } from '@/lib/format';
import type { Property } from '@/types';

const TYPES = ['HOUSE', 'APARTMENT', 'BEDSITTER', 'STUDIO', 'SHOP', 'OFFICE'];
const EDITABLE_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'OFFLINE'];

const schema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  address: z.string().trim().min(3, 'Address is required'),
  unitNumber: z.string().trim().max(30).optional(),
  type: z.enum(TYPES as [string, ...string[]]),
  bedrooms: z.coerce.number().int().min(0).max(30).optional(),
  bathrooms: z.coerce.number().int().min(0).max(30).optional(),
  monthlyRent: z.coerce.number().positive('Rent must be greater than 0'),
  deposit: z.coerce.number().min(0).default(0),
  status: z.enum(EDITABLE_STATUSES as [string, ...string[]]),
  notes: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  address: '',
  unitNumber: '',
  type: 'HOUSE',
  bedrooms: undefined,
  bathrooms: undefined,
  monthlyRent: 0,
  deposit: 0,
  status: 'AVAILABLE',
  notes: '',
};

export const Properties = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Property | null>(null);
  const [showForm, setShowForm] = useState(params.get('new') === '1');
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);

  const { data, isLoading, isError, error } = useProperties({ pageSize: 100, search: search || undefined });
  const create = useCreateProperty();
  const update = useUpdateProperty();
  const remove = useDeleteProperty();

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowForm(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  const openCreate = () => {
    setEditing(null);
    form.reset(emptyValues);
    setShowForm(true);
  };
  const openEdit = (p: Property) => {
    setEditing(p);
    form.reset({
      name: p.name,
      address: p.address,
      unitNumber: p.unitNumber ?? '',
      type: p.type,
      bedrooms: p.bedrooms ?? undefined,
      bathrooms: p.bathrooms ?? undefined,
      monthlyRent: p.monthlyRent,
      deposit: p.deposit,
      status: p.status === 'OCCUPIED' ? 'AVAILABLE' : (p.status as (typeof EDITABLE_STATUSES)[number]),
      notes: p.notes ?? '',
    });
    setShowForm(true);
  };

  const submit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      unitNumber: values.unitNumber || null,
      notes: values.notes || null,
      bedrooms: values.bedrooms ?? null,
      bathrooms: values.bathrooms ?? null,
    };
    if (editing) await update.mutateAsync({ id: editing.id, ...payload });
    else await create.mutateAsync(payload);
    setShowForm(false);
  });

  const doDelete = async () => {
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const mutationError = (create.error ?? update.error ?? remove.error) as Error | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Properties</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Property
        </Button>
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <Card>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {isLoading && <Spinner />}
        {isError && <ErrorState message={(error as Error).message} />}
        {!isLoading && !isError && (
          <Table<Property>
            columns={[
              {
                header: 'Name',
                cell: (p) => (
                  <span className="font-medium text-slate-800">
                    {p.name}
                    {p.unitNumber ? ` #${p.unitNumber}` : ''}
                  </span>
                ),
              },
              { header: 'Type', cell: (p) => p.type },
              { header: 'Beds/Baths', cell: (p) => `${p.bedrooms ?? '—'} / ${p.bathrooms ?? '—'}` },
              { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
              { header: 'Monthly Rent', cell: (p) => formatMoney(p.monthlyRent) },
              { header: 'Tenant', cell: (p) => p.currentTenant?.fullName ?? '—' },
              {
                header: '',
                className: 'text-right',
                cell: (p) => (
                  <div className="flex justify-end gap-1">
                    <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded p-1.5 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={data?.data ?? []}
          />
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && <EmptyState message="No properties yet." />}
      </Card>

      <Modal
        open={showForm}
        title={editing ? 'Edit Property' : 'Add Property'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <TextField label="Unit Number" {...form.register('unitNumber')} />
          <div className="sm:col-span-2">
            <TextField label="Address" error={form.formState.errors.address?.message} {...form.register('address')} />
          </div>
          <SelectField label="Type" {...form.register('type')}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" {...form.register('status')}>
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <TextField label="Bedrooms" type="number" {...form.register('bedrooms')} />
          <TextField label="Bathrooms" type="number" {...form.register('bathrooms')} />
          <TextField label="Monthly Rent" type="number" step="0.01" error={form.formState.errors.monthlyRent?.message} {...form.register('monthlyRent')} />
          <TextField label="Deposit" type="number" step="0.01" {...form.register('deposit')} />
          <div className="sm:col-span-2">
            <TextAreaField label="Notes" {...form.register('notes')} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete property"
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
          Remove <span className="font-semibold">{deleteTarget?.name}</span>? Properties with an active lease cannot be
          deleted.
        </p>
      </Modal>
    </div>
  );
};
