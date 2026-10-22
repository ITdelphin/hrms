import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

// --- Button ---------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = ({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) => {
  const classes =
    variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-secondary';
  return (
    <button className={`${classes} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
};

// --- Card -----------------------------------------------------------------
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`card ${className}`}>{children}</div>
);

export const CardHeader = ({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
    <h3 className="text-base font-semibold text-slate-800">{title}</h3>
    {action}
  </div>
);

// --- Badge ----------------------------------------------------------------
type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'purple';

const toneClasses: Record<Tone, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-brand-100 text-brand-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-600',
  purple: 'bg-purple-100 text-purple-700',
};

export const Badge = ({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
  >
    {children}
  </span>
);

const statusTones: Record<string, Tone> = {
  OCCUPIED: 'green',
  AVAILABLE: 'blue',
  MAINTENANCE: 'amber',
  OFFLINE: 'slate',
  ACTIVE: 'green',
  ENDED: 'slate',
  TERMINATED: 'red',
  PAID: 'green',
  PARTIAL: 'amber',
  UNPAID: 'red',
  OPEN: 'red',
  IN_PROGRESS: 'amber',
  RESOLVED: 'green',
  CLOSED: 'slate',
  SENT: 'green',
  PENDING: 'amber',
  FAILED: 'red',
  SKIPPED: 'slate',
  LOW: 'slate',
  MEDIUM: 'blue',
  HIGH: 'amber',
  URGENT: 'red',
  HOUSED: 'green',
  NOT_HOUSED: 'slate',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={statusTones[status] ?? 'slate'}>{status.replace(/_/g, ' ')}</Badge>
);

// --- Spinner / states -----------------------------------------------------
export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
    <Loader2 className="h-5 w-5 animate-spin" />
    <span className="text-sm">{label}</span>
  </div>
);

export const ErrorState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {message}
  </div>
);

export const EmptyState = ({ message }: { message: string }) => (
  <div className="px-4 py-12 text-center text-sm text-slate-400">{message}</div>
);
