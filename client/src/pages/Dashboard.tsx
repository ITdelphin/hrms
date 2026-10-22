import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CreditCard,
  FileText,
  Plus,
  Users,
  Wrench,
} from 'lucide-react';
import { useDashboard, useNotifications, useProperties, useUpcomingPayments } from '@/api';
import { Card, CardHeader, EmptyState, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { Table } from '@/components/ui/Table';
import { formatDate, formatMoney, formatPeriod } from '@/lib/format';
import type { Property } from '@/types';

const OCCUPANCY_COLORS: Record<string, string> = {
  Occupied: '#16a34a',
  Available: '#3b82f6',
  Maintenance: '#f59e0b',
  Offline: '#94a3b8',
};

export const Dashboard = () => {
  const dash = useDashboard(7);
  const properties = useProperties({ pageSize: 8 });
  const upcoming = useUpcomingPayments();
  const activity = useNotifications({ pageSize: 6 });

  if (dash.isLoading) return <Spinner label="Loading dashboard…" />;
  if (dash.isError) return <ErrorState message={(dash.error as Error).message} />;
  if (!dash.data) return <Spinner label="Loading dashboard…" />;

  const d = dash.data;
  const money = (n: number) => formatMoney(n, d.currency);

  const chartData = d.monthly.map((m) => ({ name: formatPeriod(m.period), received: m.received }));

  const occupancy = [
    { name: 'Occupied', value: d.occupancy.occupied },
    { name: 'Available', value: d.occupancy.available },
    ...(d.occupancy.maintenance ? [{ name: 'Maintenance', value: d.occupancy.maintenance }] : []),
    ...(d.occupancy.offline ? [{ name: 'Offline', value: d.occupancy.offline }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome back!</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Properties"
          value={d.occupancy.properties}
          sub={`${d.occupancy.occupied} occupied | ${d.occupancy.available} available`}
          icon={Building2}
          tone="blue"
        />
        <StatCard
          label="Total Tenants"
          value={d.occupancy.tenants}
          sub={`${d.rent.unpaidThisMonth} unpaid this month`}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Monthly Rental Income"
          value={money(d.income.collectedThisMonth)}
          sub={`${d.income.collectionRate}% collected`}
          icon={CreditCard}
          tone="purple"
        />
        <StatCard
          label="Outstanding Rent"
          value={money(d.income.totalOutstanding)}
          sub={`${d.rent.overduePeriods} overdue periods`}
          icon={AlertTriangle}
          tone="red"
        />
        <StatCard
          label="Maintenance Requests"
          value={d.maintenance.open}
          sub="Open / in progress"
          icon={Wrench}
          tone="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Rental Income" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="received" name="Income" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Property Occupancy" />
          <div className="flex flex-col items-center p-5">
            <div className="relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={occupancy} dataKey="value" nameKey="name" innerRadius={70} outerRadius={95} paddingAngle={2}>
                    {occupancy.map((entry) => (
                      <Cell key={entry.name} fill={OCCUPANCY_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-800">{d.occupancy.rate}%</span>
                <span className="text-xs text-slate-400">Occupied</span>
              </div>
            </div>
            <div className="mt-4 w-full space-y-1 text-sm">
              {occupancy.map((o) => (
                <div key={o.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: OCCUPANCY_COLORS[o.name] }} />
                    {o.name}
                  </span>
                  <span className="font-medium text-slate-700">{o.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Tables + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Properties" action={<Link to="/properties" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} />
          <Table<Property>
            columns={[
              { header: 'Name', cell: (p) => <span className="font-medium text-slate-800">{p.name}{p.unitNumber ? ` #${p.unitNumber}` : ''}</span> },
              { header: 'Type', cell: (p) => p.type },
              { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
              { header: 'Monthly Rent', cell: (p) => money(p.monthlyRent) },
              { header: 'Tenant', cell: (p) => p.currentTenant?.fullName ?? '—' },
            ]}
            rows={properties.data?.data ?? []}
          />
        </Card>

        <Card>
          <CardHeader title="Recent Activity" action={<Link to="/notifications" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} />
          <div className="divide-y divide-slate-100">
            {(activity.data?.data ?? []).length === 0 && <EmptyState message="No recent activity." />}
            {(activity.data?.data ?? []).map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{n.subject}</p>
                  <p className="text-xs text-slate-400">{formatDate(n.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent Payments" action={<Link to="/payments" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} />
          <Table
            columns={[
              { header: 'Tenant', cell: (p: { tenantName: string }) => p.tenantName },
              { header: 'Property', cell: (p: { property: string }) => p.property },
              { header: 'Amount', cell: (p: { amount: number }) => money(p.amount) },
              { header: 'Date', cell: (p: { paidAt: string }) => formatDate(p.paidAt) },
            ]}
            rows={d.recentPayments}
          />
        </Card>

        <Card>
          <CardHeader title="Upcoming Payments" action={<Link to="/payments" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} />
          <Table
            columns={[
              { header: 'Tenant', cell: (u: { tenantName: string }) => u.tenantName },
              { header: 'Due Date', cell: (u: { dueDate: string }) => formatDate(u.dueDate) },
              { header: 'Balance', cell: (u: { balance: number }) => money(u.balance) },
            ]}
            rows={upcoming.data?.data ?? []}
          />
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction to="/properties?new=1" icon={Building2} tone="green" title="Add Property" desc="Register a new house or property" />
        <QuickAction to="/tenants?new=1" icon={Users} tone="blue" title="Add Tenant" desc="Register a new tenant" />
        <QuickAction to="/payments?new=1" icon={CreditCard} tone="purple" title="Record Payment" desc="Add a rent payment" />
        <QuickAction to="/reports" icon={FileText} tone="amber" title="Generate Report" desc="Download Excel or Word report" />
      </div>
    </div>
  );
};

const QuickAction = ({
  to,
  icon: Icon,
  title,
  desc,
  tone,
}: {
  to: string;
  icon: typeof Plus;
  title: string;
  desc: string;
  tone: 'green' | 'blue' | 'purple' | 'amber';
}) => {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-brand-100 text-brand-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
    </Link>
  );
};
