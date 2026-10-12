'use client';

import { useQuery } from '@tanstack/react-query';
import { amberdApi } from '@/lib/amberd-api';
import {
  BarList,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatCard,
  WithOrganization,
  formatNumber,
  formatUsd,
} from '@/components/amberd/ui';

const Costs = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'costs'],
    queryFn: () => amberdApi.costs(organizationId),
  });
  if (isLoading || !data) return <Loading />;

  const maxDaily = Math.max(...data.daily.map((d) => d.costUsd), 0);
  const capShare = data.spendCapUsd > 0 ? Math.min(data.windowSpendUsd / data.spendCapUsd, 1) : 0;

  return (
    <div className="space-y-6">
      <Notice>
        Costs are estimated from the token counts each model call actually reported, multiplied by the provider&apos;s
        published list price. Models without a published price show N/A.
      </Notice>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total AI spend" value={formatUsd(data.totalCostUsd)} />
        <StatCard label="Input tokens" value={formatNumber(data.totalInputTokens)} />
        <StatCard label="Output tokens" value={formatNumber(data.totalOutputTokens)} />
        <StatCard
          label="Unpriced runs"
          value={data.unpricedRuns}
          hint={data.unpricedRuns ? 'Cost shown as N/A' : 'All runs priced'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Spending trend" description="Estimated cost per day, last 30 days" className="lg:col-span-2">
          <div className="flex h-36 items-end gap-1" role="img" aria-label="Daily spend chart">
            {data.daily.map((day) => (
              <div key={day.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-blue-600/90"
                  style={{ height: `${maxDaily > 0 ? Math.max((day.costUsd / maxDaily) * 136, day.costUsd > 0 ? 3 : 0) : 0}px` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {day.date}: {formatUsd(day.costUsd)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{data.daily[0]?.date}</span>
            <span>{data.daily[data.daily.length - 1]?.date}</span>
          </div>
        </Panel>
        <Panel title="Spending limit" description={`Organization rolling cap · ${data.spendWindowDays} days`}>
          <p className="text-2xl font-semibold tabular-nums">
            {formatUsd(data.windowSpendUsd)} <span className="text-sm font-normal text-slate-500">of {formatUsd(data.spendCapUsd)}</span>
          </p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${capShare > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${capShare * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Enforced: runs are blocked when the cap is reached. Each agent also has its own cap.</p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Cost by agent">
          <BarList rows={data.byAgent.map((r) => ({ key: r.key, label: r.label, value: r.costUsd, sub: `${r.runs} runs` }))} format={(v) => formatUsd(v)} />
        </Panel>
        <Panel title="Cost by department">
          <BarList rows={data.byDepartment.map((r) => ({ key: r.key, label: r.label, value: r.costUsd }))} format={(v) => formatUsd(v)} />
        </Panel>
        <Panel title="Cost by model">
          <BarList
            rows={data.byModel.map((r) => ({
              key: r.key,
              label: r.label,
              value: r.costUsd,
              sub: `${formatNumber(r.inputTokens + r.outputTokens)} tok`,
            }))}
            format={(v) => formatUsd(v)}
          />
        </Panel>
      </div>
    </div>
  );
};

export default function CostsPage() {
  return (
    <PageShell section="Governance" crumbs={[{ label: 'Costs' }]} title="AI Costs" description="Where AI spend goes — by agent, department, and model.">
      <WithOrganization>{(organizationId) => <Costs organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
