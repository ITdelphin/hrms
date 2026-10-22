import { useState } from 'react';
import { Play, Send } from 'lucide-react';
import { useNotificationConfig, useNotifications, useRunReminders, useSendTestNotification } from '@/api';
import { Button, Card, CardHeader, EmptyState, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { Table } from '@/components/ui/Table';
import { TextField } from '@/components/ui/Fields';
import { formatDateTime } from '@/lib/format';
import type { AppNotification } from '@/types';

export const Notifications = () => {
  const [event, setEvent] = useState('');
  const [testTo, setTestTo] = useState('');
  const config = useNotificationConfig();
  const list = useNotifications({ pageSize: 50, event: event || undefined });
  const run = useRunReminders();
  const test = useSendTestNotification();

  const [runMsg, setRunMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Configuration" />
          <div className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
            {config.isLoading && <Spinner />}
            {config.data && (
              <>
                <Stat label="Provider" value={String(config.data.provider?.type ?? '—')} />
                <Stat label="Total" value={config.data.stats.total} />
                <Stat label="Sent" value={config.data.stats.sent} />
                <Stat label="Failed" value={config.data.stats.failed} />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-5">
            <Button
              variant="secondary"
              loading={run.isPending}
              onClick={async () => {
                setRunMsg(null);
                const res = await run.mutateAsync();
                const result = res.result as { processed?: number; sent?: number } | undefined;
                setRunMsg(result ? `Ran reminders — processed ${result.processed ?? 0}, sent ${result.sent ?? 0}.` : 'Reminder run complete.');
              }}
            >
              <Play className="h-4 w-4" /> Run reminders now
            </Button>
            <div className="w-64">
              <TextField label="Send test email to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
            <Button loading={test.isPending} disabled={!testTo} onClick={() => test.mutate(testTo)}>
              <Send className="h-4 w-4" /> Send test
            </Button>
          </div>
          {runMsg && <p className="px-5 pb-4 text-sm text-green-600">{runMsg}</p>}
          {(run.error ?? test.error) && <div className="px-5 pb-4"><ErrorState message={((run.error ?? test.error) as Error).message} /></div>}
        </Card>

        <Card>
          <CardHeader title="Filter" />
          <div className="p-5">
            <select className="input" value={event} onChange={(e) => setEvent(e.target.value)}>
              <option value="">All events</option>
              <option value="RENT_REMINDER">Rent reminder</option>
              <option value="RENT_OVERDUE">Rent overdue</option>
              <option value="PAYMENT_RECEIVED">Payment received</option>
              <option value="LEASE_CREATED">Lease created</option>
              <option value="LEASE_EXPIRING">Lease expiring</option>
            </select>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Notification Log" />
        {list.isLoading && <Spinner />}
        {!list.isLoading && (
          <Table<AppNotification>
            columns={[
              { header: 'Subject', cell: (n) => <span className="font-medium text-slate-800">{n.subject}</span> },
              { header: 'Event', cell: (n) => n.event.replace(/_/g, ' ') },
              { header: 'Recipient', cell: (n) => n.recipientName ?? n.recipient },
              { header: 'Status', cell: (n) => <StatusBadge status={n.status} /> },
              { header: 'Created', cell: (n) => formatDateTime(n.createdAt) },
            ]}
            rows={list.data?.data ?? []}
          />
        )}
        {!list.isLoading && (list.data?.data.length ?? 0) === 0 && <EmptyState message="No notifications." />}
      </Card>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-semibold text-slate-800">{value}</div>
  </div>
);
