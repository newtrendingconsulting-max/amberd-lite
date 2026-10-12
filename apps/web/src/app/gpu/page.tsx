'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PRIORITY_TIER_LABELS, PriorityTier } from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import {
  DataTable,
  DemoBadge,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
  Td,
  WithOrganization,
} from '@/components/amberd/ui';
import { cn } from '@/lib/utils';

const TIER_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  STANDARD: 'bg-blue-600',
  BEST_EFFORT: 'bg-slate-400',
};

const Gpu = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'gpu'],
    queryFn: () => amberdApi.gpu(organizationId),
  });
  if (isLoading || !data) return <Loading />;

  const total = data.pools.reduce((s, p) => s + p.total, 0);
  const allocated = data.pools.reduce((s, p) => s + p.allocated, 0);
  const utilization = data.pools.reduce((s, p) => s + p.utilization * p.total, 0) / total;

  return (
    <div className="space-y-6">
      <Notice tone="warn">
        <span className="font-medium">Illustrative infrastructure data.</span> No GPU cluster is connected to this
        hackathon build and no GPU orchestration is running. Pool figures are static demo values; the workload list
        shows your real agents and their configured priority tiers.
      </Notice>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="GPU utilization" value={`${Math.round(utilization * 100)}%`} hint={<DemoBadge />} />
        <StatCard label="GPUs available" value={`${total - allocated} / ${total}`} hint={<DemoBadge />} />
        <StatCard label="Capacity allocated" value={`${Math.round((allocated / total) * 100)}%`} hint={<DemoBadge />} />
        <StatCard label="Pools" value={data.pools.length} hint={<DemoBadge />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="GPU pools" className="lg:col-span-2" actions={<DemoBadge>Illustrative</DemoBadge>} bodyClassName="p-0">
          <DataTable headers={['Pool', 'Hardware', 'Allocation', 'Utilization', 'Status']}>
            {data.pools.map((pool) => (
              <tr key={pool.id}>
                <Td className="font-medium">{pool.name}</Td>
                <Td>{pool.gpuModel}</Td>
                <Td className="tabular-nums">
                  {pool.allocated} / {pool.total} GPUs
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-slate-100">
                      <div
                        className={cn('h-1.5 rounded-full', pool.utilization > 0.85 ? 'bg-amber-500' : 'bg-violet-500')}
                        style={{ width: `${pool.utilization * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs">{Math.round(pool.utilization * 100)}%</span>
                  </div>
                </Td>
                <Td><StatusBadge status={pool.status} /></Td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Priority tiers" description="Reserved capacity share by tier" actions={<DemoBadge>Illustrative</DemoBadge>}>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {data.tiers.map((tier) => (
              <div key={tier.tier} className={TIER_COLORS[tier.tier]} style={{ width: `${tier.reservedShare * 100}%` }} />
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {data.tiers.map((tier) => (
              <li key={tier.tier} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-sm', TIER_COLORS[tier.tier])} />
                  {PRIORITY_TIER_LABELS[tier.tier as PriorityTier]}
                </span>
                <span className="text-slate-500">
                  {Math.round(tier.reservedShare * 100)}% · {tier.agents} agent{tier.agents === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="GPU usage by workload"
        description="Agents are real; their GPU share is illustrative. Set an agent's tier in Configuration → Resource Limits."
        bodyClassName="p-0"
      >
        <DataTable headers={['Agent', 'Priority tier', 'Agent status', 'GPU share']} isEmpty={!data.workloads.length}>
          {data.workloads.map((workload) => (
            <tr key={workload.agentId}>
              <Td>
                <Link className="font-medium text-slate-800 hover:text-blue-600" href={`/agents/${workload.agentId}`}>
                  {workload.name}
                </Link>
              </Td>
              <Td>{PRIORITY_TIER_LABELS[workload.priorityTier as PriorityTier] ?? workload.priorityTier}</Td>
              <Td><StatusBadge status={workload.status} /></Td>
              <Td>
                <span className="tabular-nums">{Math.round(workload.illustrativeGpuShare * 100)}%</span> <DemoBadge>Illustrative</DemoBadge>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
};

export default function GpuPage() {
  return (
    <PageShell
      section="Infrastructure"
      crumbs={[{ label: 'GPU & Resources' }]}
      title="GPU & Resources"
      description="Capacity, utilization, and priority tiers for agent workloads."
    >
      <WithOrganization>{(organizationId) => <Gpu organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
