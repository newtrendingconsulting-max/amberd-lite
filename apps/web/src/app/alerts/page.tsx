'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { amberdApi } from '@/lib/amberd-api';
import { Loading, Notice, PageShell, Panel, StatusBadge, WithOrganization, formatDateTime } from '@/components/amberd/ui';
import { cn } from '@/lib/utils';

const KINDS = {
  PROBLEM_DETECTED: { label: 'Problem detected', icon: AlertTriangle, className: 'bg-amber-50 text-amber-600' },
  ACTION_COMPLETED: { label: 'Action completed', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  ACTION_FAILED: { label: 'Action failed', icon: XCircle, className: 'bg-red-50 text-red-600' },
} as const;

const Alerts = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'overview'],
    queryFn: () => amberdApi.overview(organizationId),
  });
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-6">
      <Notice>
        Agents raise in-app notifications through the platform notification engine (bell icon, top right). Owners,
        admins, and the person who ran the agent are notified. Email delivery uses the same engine and is routed to
        the local Mailpit inbox in development.
      </Notice>
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(KINDS) as Array<keyof typeof KINDS>).map((kind) => {
          const info = KINDS[kind];
          const Icon = info.icon;
          const count = data.alerts.filter((a) => a.kind === kind).length;
          return (
            <div key={kind} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className={cn('rounded-lg p-2', info.className)}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-800">{info.label}</p>
                <p className="text-xs text-slate-500">{count} recent</p>
              </div>
            </div>
          );
        })}
      </div>
      <Panel title="Recent alerts" bodyClassName="p-0">
        {data.alerts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No alerts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.alerts.map((alert) => {
              const info = KINDS[alert.kind];
              const Icon = info.icon;
              return (
                <li key={`${alert.kind}-${alert.id}`} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-0.5 rounded-md p-1.5', info.className)}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                    <p className="truncate text-xs text-slate-500">{alert.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{formatDateTime(alert.createdAt)}</p>
                    {alert.runId && (
                      <Link className="text-xs text-blue-600 hover:underline" href={`/runs/${alert.runId}`}>
                        View run
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Notification rules" description="Configured per agent through Create notification actions">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between"><span>Problem detected (e.g. invoice discrepancy)</span><StatusBadge status="ACTIVE" /></li>
          <li className="flex justify-between"><span>Action completed (passed audits, reports generated)</span><StatusBadge status="ACTIVE" /></li>
          <li className="flex justify-between"><span>Action failed (failed runs or actions)</span><StatusBadge status="ACTIVE" /></li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Personal delivery preferences: <Link href="/settings/notifications" className="text-blue-600 hover:underline">notification settings</Link>.
        </p>
      </Panel>
    </div>
  );
};

export default function AlertsPage() {
  return (
    <PageShell section="Governance" crumbs={[{ label: 'Notifications' }]} title="Notifications" description="Problems detected, actions completed, and actions failed across all agents.">
      <WithOrganization>{(organizationId) => <Alerts organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
