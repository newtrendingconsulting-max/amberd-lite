'use client';

import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AgentDefinition } from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import {
  DataTable,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatusBadge,
  Td,
  WithOrganization,
  formatDateTime,
} from '@/components/amberd/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const describeSchedule = (definition: AgentDefinition): string => {
  const { trigger } = definition;
  if (trigger.type === 'MANUAL') return 'Manual — run on demand';
  if (trigger.type === 'API') return 'API — on authenticated request';
  if (trigger.type === 'CONTINUOUS') return 'Continuous';
  const s = trigger.schedule;
  if (!s) return 'Scheduled (no schedule set)';
  const at = s.time ? ` at ${s.time} ${s.timezone ?? 'UTC'}` : '';
  switch (s.frequency) {
    case 'DAILY':
      return `Daily${at}`;
    case 'WEEKLY':
      return `Weekly on ${DAYS[s.dayOfWeek ?? 1]}${at}`;
    case 'MONTHLY':
      return `Monthly on day ${s.dayOfMonth ?? 1}${at}`;
    case 'CUSTOM':
      return `Custom recurrence (cron: ${s.cron ?? '—'})`;
  }
};

/** What the next run would be if a scheduler were running. Shown as "planned". */
const plannedNextRun = (definition: AgentDefinition): string | null => {
  const s = definition.trigger.schedule;
  if (definition.trigger.type !== 'SCHEDULED' || !s || s.frequency === 'CUSTOM') return null;
  const [hours, minutes] = (s.time ?? '08:00').split(':').map(Number);
  const next = new Date();
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
  if (s.frequency === 'WEEKLY') {
    while (next.getUTCDay() !== (s.dayOfWeek ?? 1)) next.setUTCDate(next.getUTCDate() + 1);
  }
  if (s.frequency === 'MONTHLY') {
    while (next.getUTCDate() !== (s.dayOfMonth ?? 1)) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
};

const Schedules = ({ organizationId }: { organizationId: string }) => {
  const { data: agents, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'agents'],
    queryFn: () => amberdApi.agents(organizationId),
  });
  const details = useQueries({
    queries: (agents ?? []).map((agent) => ({
      queryKey: ['amberd', organizationId, 'agent', agent.id],
      queryFn: () => amberdApi.agent(organizationId, agent.id),
    })),
  });
  if (isLoading || !agents) return <Loading />;

  return (
    <div className="space-y-5">
      <Notice tone="warn">
        Manual and API triggers execute today. Scheduled and continuous triggers are saved configuration only — no
        scheduler is running in this hackathon build, so nothing runs automatically.
      </Notice>
      <Panel bodyClassName="p-0" title="Agent schedules" description="Supported: Manual · Continuous · Daily · Weekly · Monthly · Custom recurrence">
        <DataTable headers={['Agent', 'Schedule', 'Trigger status', 'Last run', 'Next run']} isEmpty={!agents.length}>
          {agents.map((agent, index) => {
            const definition = details[index]?.data?.definition;
            const isExecutable = agent.triggerType === 'MANUAL' || agent.triggerType === 'API';
            const next = definition ? plannedNextRun(definition) : null;
            return (
              <tr key={agent.id}>
                <Td>
                  <Link href={`/agents/${agent.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                    {agent.name}
                  </Link>
                </Td>
                <Td>{definition ? describeSchedule(definition) : '…'}</Td>
                <Td>
                  <StatusBadge status={isExecutable ? (agent.status === 'ACTIVE' ? 'ACTIVE' : agent.status) : 'CONFIGURATION_ONLY'} />
                </Td>
                <Td>{formatDateTime(agent.lastRunAt)}</Td>
                <Td>
                  {next ? (
                    <span className="text-slate-500">
                      {formatDateTime(next)} <span className="text-xs">(planned — scheduler not running)</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">{isExecutable ? 'On demand' : '—'}</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
      <p className="text-xs text-slate-500">To change a schedule, open the agent → Configuration → Trigger.</p>
    </div>
  );
};

export default function SchedulingPage() {
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Scheduling' }]}
      title="Scheduling"
      description="When each agent runs."
    >
      <WithOrganization>{(organizationId) => <Schedules organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
