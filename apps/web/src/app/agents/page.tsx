'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot, Plus } from 'lucide-react';
import { findCatalogModel } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi } from '@/lib/amberd-api';
import {
  DataTable,
  Loading,
  PageShell,
  Panel,
  StatusBadge,
  Td,
  WithOrganization,
  formatDateTime,
  formatUsd,
} from '@/components/amberd/ui';

const AgentsTable = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'agents'],
    queryFn: () => amberdApi.agents(organizationId),
  });
  if (isLoading || !data) return <Loading />;

  return (
    <Panel bodyClassName="p-0" title={`${data.length} agent${data.length === 1 ? '' : 's'}`}>
      <DataTable
        headers={['Name', 'Department', 'LLM', 'Trigger', 'Status', 'Last run', 'Runs', 'Est. cost']}
        isEmpty={data.length === 0}
        empty={
          <span>
            No agents yet. <Link className="text-blue-600 hover:underline" href="/agents/new">Create your first agent</Link>.
          </span>
        }
      >
        {data.map((agent) => (
          <tr key={agent.id} className="hover:bg-slate-50/80">
            <Td>
              <Link href={`/agents/${agent.id}`} className="group flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-blue-50 p-1.5 text-blue-600">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900 group-hover:text-blue-600">{agent.name}</span>
                  <span className="line-clamp-1 max-w-xs text-xs text-slate-500">{agent.description}</span>
                </span>
              </Link>
            </Td>
            <Td>{agent.department}</Td>
            <Td>
              <span className="whitespace-nowrap">{findCatalogModel(agent.model)?.displayName ?? agent.model}</span>
            </Td>
            <Td>
              <span className="text-xs text-slate-600">{agent.triggerType.toLowerCase()}</span>
            </Td>
            <Td>
              <StatusBadge status={agent.status} />
            </Td>
            <Td>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-slate-600">{formatDateTime(agent.lastRunAt)}</span>
                {agent.lastRunStatus && <StatusBadge status={agent.lastRunStatus} />}
              </div>
            </Td>
            <Td className="tabular-nums">{agent.runCount}</Td>
            <Td className="tabular-nums">{formatUsd(agent.estimatedCostUsd)}</Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
};

export default function AgentsPage() {
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Agents' }]}
      title="Agents"
      description="Create, configure, execute, and govern every AI agent in your organization."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/templates">Start from a template</Link>
          </Button>
          <Button asChild>
            <Link href="/agents/new">
              <Plus className="mr-1.5 h-4 w-4" /> Create agent
            </Link>
          </Button>
        </>
      }
    >
      <WithOrganization>{(organizationId) => <AgentsTable organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
