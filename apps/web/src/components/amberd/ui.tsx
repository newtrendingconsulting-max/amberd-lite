'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveOrganization } from '@/hooks/use-active-organization';

export const formatUsd = (value: number | null | undefined, digits = 4): string => {
  if (value === null || value === undefined) return 'N/A';
  if (value === 0) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 1 ? Math.min(digits, 4) : 2,
    maximumFractionDigits: value < 1 ? digits : 2,
  })}`;
};

export const formatMoney = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? 'N/A'
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : value.toLocaleString('en-US');

export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const shortId = (id: string): string => id.slice(0, 8);

interface Crumb {
  label: string;
  href?: string;
}

/** Standard page frame: breadcrumbs, title, description, and actions. */
export const PageShell = ({
  section,
  crumbs = [],
  title,
  description,
  actions,
  children,
}: {
  section: string;
  crumbs?: Crumb[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) => {
  const { organization } = useActiveOrganization();
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f5f7fb] dark:bg-background">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600 dark:text-slate-300">{organization?.name ?? 'Organization'}</span>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span>{section}</span>
          {crumbs.map((crumb) => (
            <span key={crumb.label} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" aria-hidden />
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-blue-600">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
};

export const Panel = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section
    className={cn(
      'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
      className,
    )}
  >
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div>
          {title && <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {actions}
      </header>
    )}
    <div className={cn('p-5', bodyClassName)}>{children}</div>
  </section>
);

export const StatCard = ({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  icon?: React.ComponentType<{ className?: string }>;
  /** When set, the whole card navigates there. */
  href?: string;
}) => {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50',
          tone === 'good' && 'text-emerald-600',
          tone === 'bad' && 'text-red-600',
          tone === 'warn' && 'text-amber-600',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const className =
    'group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900';
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        className,
        'transition-colors hover:border-blue-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      )}
    >
      {body}
    </Link>
  );
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  AVAILABLE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CONNECTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  SUCCEEDED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PASSED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  HEALTHY: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  WORKING: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ENFORCED: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  RUNNING: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  PENDING: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  DRAFT: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  NOT_CONFIGURED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  NOT_INTEGRATED: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  NOT_CONNECTED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  NOT_AVAILABLE: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  SENT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CONFIGURATION_ONLY: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  AWAITING_APPROVAL: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  FLAGGED: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  SATURATED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
};

const STATUS_LABELS: Record<string, string> = {
  AWAITING_APPROVAL: 'Awaiting approval',
  NOT_CONFIGURED: 'Not configured',
  NOT_INTEGRATED: 'Not integrated',
  CONFIGURATION_ONLY: 'Configuration only',
  NOT_CONNECTED: 'Not connected',
  NOT_AVAILABLE: 'Not available yet',
};

export const StatusBadge = ({ status, className }: { status: string | null | undefined; className?: string }) => {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const label = STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-600 ring-slate-500/20',
        className,
      )}
    >
      {label}
    </span>
  );
};

/** Marks anything not backed by a working integration. */
export const DemoBadge = ({ children = 'Demo data' }: { children?: ReactNode }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
    {children}
  </span>
);

export const Notice = ({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn' | 'error';
}) => (
  <div
    className={cn(
      'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm',
      tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-900',
      tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900',
      tone === 'error' && 'border-red-200 bg-red-50 text-red-900',
    )}
  >
    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
    <div className="min-w-0">{children}</div>
  </div>
);

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
    {label}
  </div>
);

export const DataTable = ({
  headers,
  children,
  empty,
  isEmpty,
}: {
  headers: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700">
          {headers.map((header, index) => (
            <th key={index} className="whitespace-nowrap px-3 py-2.5 first:pl-5 last:pr-5">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {isEmpty ? (
          <tr>
            <td colSpan={headers.length} className="px-5 py-10 text-center text-sm text-slate-500">
              {empty ?? 'Nothing here yet.'}
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  </div>
);

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn('px-3 py-3 align-middle first:pl-5 last:pr-5', className)}>{children}</td>
);

/** Simple horizontal bar list used for breakdowns. */
export const BarList = ({
  rows,
  format,
  empty = 'No data yet',
}: {
  rows: Array<{ key: string; label: string; value: number; sub?: string }>;
  format: (value: number) => string;
  empty?: string;
}) => {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return <p className="py-4 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700 dark:text-slate-200">{row.label}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-900 dark:text-slate-100">
              {format(row.value)}
              {row.sub && <span className="ml-1.5 text-xs text-slate-500">{row.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-1.5 rounded-full bg-blue-600"
              style={{ width: `${max > 0 ? Math.max((row.value / max) * 100, 2) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Requires an active organization before rendering children. */
export const WithOrganization = ({ children }: { children: (organizationId: string) => ReactNode }) => {
  const { organizationId, isLoading } = useActiveOrganization();
  if (isLoading) return <Loading />;
  if (!organizationId) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center text-sm text-slate-500">
        You are not a member of any organization yet.{' '}
        <Link href="/organizations/create" className="text-blue-600 hover:underline">
          Create one
        </Link>{' '}
        to start using Amberd Lite.
      </div>
    );
  }
  return <>{children(organizationId)}</>;
};
