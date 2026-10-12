'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { findCatalogModel } from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import {
  DataTable,
  Loading,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
  Td,
  WithOrganization,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUsd,
  shortId,
} from '@/components/amberd/ui';

const RunsView = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'runs'],
    queryFn: () => amberdApi.runs(organizationId),
    refetchInterval: 10_000,
  });
  if (isLoading || !data) return <Loading />;

  const finished = data.filter((r) => r.status !== 'RUNNING');
  const succeeded = data.filter((r) => r.status === 'SUCCEEDED').length;
  const durations = finished.map((r) => r.durationMs ?? 0);
  const tokens = data.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
  const cost = data.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total runs" value={data.length} />
        <StatCard label="Success rate" value={finished.length ? `${Math.round((succeeded / finished.length) * 100)}%` : '—'} tone="good" />
        <StatCard
          label="Avg latency"
          value={formatDuration(durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null)}
        />
        <StatCard label="Token usage" value={formatNumber(tokens)} />
        <StatCard label="Estimated cost" value={formatUsd(cost)} />
      </div>
      <Panel bodyClassName="p-0" title="Execution records" description="Every row is a real persisted run.">
        <DataTable
          headers={['Run ID', 'Agent', 'Department', 'Model', 'Status', 'Outcome', 'Started', 'Duration', 'Tokens', 'Est. cost']}
          isEmpty={!data.length}
          empty="No runs yet. Open an agent and run it."
        >
          {data.map((run) => (
            <tr key={run.id} className="hover:bg-slate-50/80">
              <Td>
                <Link href={`/runs/${run.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                  {shortId(run.id)}
                </Link>
              </Td>
              <Td>
                <Link href={`/agents/${run.agentId}`} className="font-medium text-slate-800 hover:text-blue-600">
                  {run.agentName}
                </Link>
              </Td>
              <Td>{run.department}</Td>
              <Td className="whitespace-nowrap">{findCatalogModel(run.model ?? '')?.displayName ?? run.model ?? '—'}</Td>
              <Td><StatusBadge status={run.status} /></Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={run.outcome} />
                  {run.pendingApprovals > 0 && <StatusBadge status="AWAITING_APPROVAL" />}
                </div>
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(run.startedAt)}</Td>
              <Td>{formatDuration(run.durationMs)}</Td>
              <Td className="tabular-nums">{formatNumber(run.inputTokens + run.outputTokens)}</Td>
              <Td className="tabular-nums">{formatUsd(run.costUsd)}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
};

export default function RunsPage() {
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Runs' }]}
      title="Runs"
      description="Observability for every agent execution: status, latency, tokens, and cost."
    >
      <WithOrganization>{(organizationId) => <RunsView organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
