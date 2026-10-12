'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  Plus,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findCatalogModel } from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import {
  BarList,
  DemoBadge,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
  WithOrganization,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUsd,
} from '@/components/amberd/ui';
import { cn } from '@/lib/utils';

const ALERT_STYLES = {
  PROBLEM_DETECTED: { icon: AlertTriangle, className: 'text-amber-600 bg-amber-50', label: 'Problem detected' },
  ACTION_COMPLETED: { icon: CheckCircle2, className: 'text-emerald-600 bg-emerald-50', label: 'Action completed' },
  ACTION_FAILED: { icon: XCircle, className: 'text-red-600 bg-red-50', label: 'Action failed' },
} as const;

/** Illustrative only: no GPU infrastructure is connected in this build. */
const GPU_DEMO = { utilization: 0.67, available: 9, total: 20 };

const Overview = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'overview'],
    queryFn: () => amberdApi.overview(organizationId),
    refetchInterval: 15_000,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'agents'],
    queryFn: () => amberdApi.agents(organizationId),
  });

  if (isLoading || !data) return <Loading />;
  const maxActivity = Math.max(...data.activity.map((d) => d.runs), 1);

  return (
    <div className="space-y-6">
      {!data.llmConfigured && (
        <Notice tone="warn">
          No LLM provider is configured yet, so agent runs will fail with a recorded error. Add an Anthropic API
          key on the server — see <Link className="underline" href="/models">LLM Models</Link>.
        </Notice>
      )}

      <section aria-labelledby="ops-heading">
        <h2 id="ops-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Agent operations
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard href="/agents" label="Total agents" value={data.agents.total} icon={Bot} hint={`${data.agents.draft} draft · view all`} />
          <StatCard href="/agents" label="Active" value={data.agents.active} tone="good" icon={CheckCircle2} />
          <StatCard href="/agents" label="Inactive" value={data.agents.inactive} icon={Clock} />
          <StatCard
            href="/agents"
            label="Failing"
            value={data.agents.failing}
            tone={data.agents.failing ? 'bad' : 'default'}
            icon={XCircle}
            hint="Last run failed"
          />
        </div>
      </section>

      <section aria-labelledby="exec-heading">
        <h2 id="exec-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Execution metrics
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard href="/runs" label="Total runs" value={formatNumber(data.runs.total)} icon={Activity} hint="View execution history" />
          <StatCard href="/runs" label="Successful" value={data.runs.succeeded} tone="good" />
          <StatCard href="/runs" label="Failed" value={data.runs.failed} tone={data.runs.failed ? 'bad' : 'default'} />
          <StatCard
            href="/runs"
            label="Success rate"
            value={data.runs.successRate === null ? '—' : `${Math.round(data.runs.successRate * 100)}%`}
            icon={Gauge}
          />
          <StatCard href="/runs" label="Avg latency" value={formatDuration(data.runs.avgLatencyMs)} icon={Clock} />
        </div>
      </section>

      <Panel
        title="Agents"
        description="Click an agent to open its configuration, JSON definition, and run history"
        actions={
          <Link href="/agents" className="text-sm font-medium text-blue-600 hover:underline">
            View all agents →
          </Link>
        }
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-slate-100">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/agents/${agent.id}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50"
              >
                <span className="flex min-w-[220px] flex-1 items-center gap-3">
                  <span className="rounded-md bg-blue-50 p-1.5 text-blue-600">
                    <Bot className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{agent.name}</span>
                    <span className="block text-xs text-slate-500">
                      {agent.department} · {findCatalogModel(agent.model)?.displayName ?? agent.model}
                    </span>
                  </span>
                </span>
                <StatusBadge status={agent.status} />
                <span className="w-40 text-xs text-slate-500">
                  Last run {formatDateTime(agent.lastRunAt)}
                </span>
                <span className="w-20 text-right text-xs tabular-nums text-slate-600">{agent.runCount} runs</span>
                <span className="w-20 text-right text-xs tabular-nums text-slate-600">{formatUsd(agent.estimatedCostUsd)}</span>
              </Link>
            </li>
          ))}
          {agents.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No agents yet.</li>}
        </ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Agent activity" description="Runs per day, last 14 days" className="lg:col-span-2">
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Runs per day bar chart">
            {data.activity.map((day) => {
              const barHeight = day.runs ? Math.max((day.runs / maxActivity) * 130, 4) : 0;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${day.date}: ${day.runs} runs, ${day.failed} failed`}>
                  <div className="flex w-full flex-col justify-end overflow-hidden rounded-t" style={{ height: barHeight }}>
                    <div className="w-full bg-red-500" style={{ height: day.runs ? (day.failed / day.runs) * barHeight : 0 }} />
                    <div className="w-full flex-1 bg-blue-600/90" />
                  </div>
                  <span className="text-[10px] tabular-nums text-slate-400">{day.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-600" /> Runs</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Failed</span>
          </div>
        </Panel>

        <Panel
          title="Alerts"
          description="Click an alert to open its execution"
          actions={<Link href="/alerts" className="text-xs font-medium text-blue-600 hover:underline">All →</Link>}
          bodyClassName="p-0"
        >
          {data.alerts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No alerts yet. Run an agent to see activity.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {data.alerts.map((alert) => {
                const style = ALERT_STYLES[alert.kind];
                const Icon = style.icon;
                return (
                  <li key={`${alert.kind}-${alert.id}`}>
                    <Link
                      href={alert.runId ? `/runs/${alert.runId}` : '/runs'}
                      className="flex gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <span className={cn('mt-0.5 rounded-md p-1', style.className)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{alert.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {style.label} · {formatDateTime(alert.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="AI spending"
          description="Estimated from real token usage × published list prices"
          actions={<Link href="/costs" className="text-xs font-medium text-blue-600 hover:underline">Costs →</Link>}
        >
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">Total estimated cost</p>
              <p className="text-xl font-semibold tabular-nums">{formatUsd(data.spend.totalCostUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tokens consumed</p>
              <p className="text-xl font-semibold tabular-nums">{formatNumber(data.spend.totalTokens)}</p>
            </div>
          </div>
          <p className="mb-2 text-xs font-medium text-slate-500">By agent</p>
          <BarList
            rows={data.spend.byAgent.map((r) => ({ key: r.key, label: r.label, value: r.costUsd, sub: `${r.runs} runs` }))}
            format={(v) => formatUsd(v)}
          />
        </Panel>
        <Panel
          title="Cost by department"
          actions={<Link href="/costs" className="text-xs font-medium text-blue-600 hover:underline">Costs →</Link>}
        >
          <BarList
            rows={data.spend.byDepartment.map((r) => ({ key: r.key, label: r.label, value: r.costUsd }))}
            format={(v) => formatUsd(v)}
          />
        </Panel>
        <Panel title="Infrastructure" actions={<DemoBadge>Illustrative</DemoBadge>}>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-slate-600">GPU utilization</span>
                <span className="tabular-nums font-medium">{Math.round(GPU_DEMO.utilization * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-violet-500" style={{ width: `${GPU_DEMO.utilization * 100}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">GPUs available</span>
              <span className="tabular-nums font-medium">
                {GPU_DEMO.available} / {GPU_DEMO.total}
              </span>
            </div>
            <div className="text-sm text-slate-600">
              Priority tiers: <span className="font-medium text-slate-800">Critical · Standard · Best Effort</span>
            </div>
            <Link href="/gpu" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <Cpu className="h-3.5 w-3.5" /> View GPU & resources
            </Link>
            <p className="text-xs text-slate-400">No GPU infrastructure is connected in this demo.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  return (
    <PageShell
      section="Overview"
      title="Enterprise AI Agent Control Center"
      description="Every agent, run, dollar, and decision across your organization — in full view."
      actions={
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="mr-1.5 h-4 w-4" /> Create agent
          </Link>
        </Button>
      }
    >
      <WithOrganization>{(organizationId) => <Overview organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}

