import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Undo2 } from 'lucide-react';
import { usePayments, useRecordPayment, useReversePayment, useUpcomingPayments } from '@/api';
import { Button, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { SelectField, TextField } from '@/components/ui/Fields';
import { formatDate, formatMoney } from '@/lib/format';
import type { Payment } from '@/types';

const METHODS = ['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_APP', 'OTHER'];

const schema = z.object({
  rentScheduleId: z.string().min(1, 'Select an unpaid month'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.enum(METHODS as [string, ...string[]]),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  paidAt: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  rentScheduleId: '',
  amount: 0,
  method: 'CASH',
  reference: '',
  note: '',
  paidAt: new Date().toISOString().slice(0, 10),
};

export const Payments = () => {
  const [params, setParams] = useSearchParams();
  const [showForm, setShowForm] = useState(params.get('new') === '1');
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');

  const upcoming = useUpcomingPayments();
  const { data, isLoading } = usePayments({ pageSize: 50 });
  const record = useRecordPayment();
  const reverse = useReversePayment();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowForm(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const items = upcoming.data?.data ?? [];

  const openForm = () => {
    form.reset(defaults);
    setShowForm(true);
  };

  const onScheduleChange = (id: string) => {
    const item = items.find((x) => x.rentScheduleId === id);
    if (item) form.setValue('amount', item.balance, { shouldValidate: true });
  };

  const submit = form.handleSubmit(async (values) => {
    await record.mutateAsync({
      ...values,
      reference: values.reference || null,
      note: values.note || null,
    });
    setShowForm(false);
  });

  const doReverse = async () => {
    if (!reverseTarget) return;
    await reverse.mutateAsync({ id: reverseTarget.id, reason });
    setReverseTarget(null);
    setReason('');
  };

  const mutationError = (record.error ?? reverse.error) as Error | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
        <Button onClick={openForm}>Record Payment</Button>
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <Card>
        <CardHeader title="Recent Payments" />
        {isLoading && <Spinner />}
        {!isLoading && (
          <Table<Payment>
            columns={[
              { header: 'Tenant', cell: (p) => <span className="font-medium text-slate-800">{p.tenant.fullName}</span> },
              { header: 'Property', cell: (p) => p.propertyName ?? '—' },
              { header: 'Period', cell: (p) => `${p.rentSchedule.periodYear}-${String(p.rentSchedule.periodMonth).padStart(2, '0')}` },
              { header: 'Amount', cell: (p) => formatMoney(p.amount) },
              { header: 'Method', cell: (p) => p.method.replace(/_/g, ' ') },
              { header: 'Date', cell: (p) => formatDate(p.paidAt) },
              {
                header: '',
                className: 'text-right',
                cell: (p) => (
                  <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Reverse" onClick={() => setReverseTarget(p)}>
                    <Undo2 className="h-4 w-4" />
                  </button>
                ),
              },
            ]}
            rows={data?.data ?? []}
          />
        )}
        {!isLoading && (data?.data.length ?? 0) === 0 && <EmptyState message="No payments recorded yet." />}
      </Card>

      <Modal
        open={showForm}
        title="Record Payment"
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={record.isPending}>
              Record
            </Button>
          </>
        }
      >
        {items.length === 0 ? (
          <ErrorState message="There are no unpaid rent periods right now." />
        ) : (
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <div className="sm:col-span-2">
              <SelectField label="Unpaid month" error={form.formState.errors.rentScheduleId?.message} {...form.register('rentScheduleId', { onChange: (e) => onScheduleChange(e.target.value) })}>
                <option value="">Select…</option>
                {items.map((u) => (
                  <option key={u.rentScheduleId} value={u.rentScheduleId}>
                    {u.tenantName} — {u.period} (due {formatDate(u.dueDate)}, balance {formatMoney(u.balance)})
                  </option>
                ))}
              </SelectField>
            </div>
            <TextField label="Amount" type="number" step="0.01" error={form.formState.errors.amount?.message} {...form.register('amount')} />
            <SelectField label="Method" {...form.register('method')}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ')}
                </option>
              ))}
            </SelectField>
            <TextField label="Reference" {...form.register('reference')} />
            <TextField label="Paid Date" type="date" {...form.register('paidAt')} />
            <div className="sm:col-span-2">
              <TextField label="Note" {...form.register('note')} />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!reverseTarget}
        title="Reverse payment"
        onClose={() => setReverseTarget(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReverseTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReverse} loading={reverse.isPending} disabled={reason.trim().length < 3}>
              Reverse
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Reverse {formatMoney(reverseTarget?.amount ?? 0)} for {reverseTarget?.tenant.fullName}? A reason is required.
        </p>
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
};
