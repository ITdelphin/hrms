import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const tones: Record<string, string> = {
  blue: 'bg-brand-100 text-brand-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  red: 'bg-red-100 text-red-600',
  amber: 'bg-amber-100 text-amber-600',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof tones;
}

export const StatCard = ({ label, value, sub, icon: Icon, tone = 'blue' }: StatCardProps) => (
  <div className="card p-5">
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
    <div className="mt-3 text-3xl font-bold text-slate-800">{value}</div>
    {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
  </div>
);
