'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Download, FileText, Loader2, Play, Power } from 'lucide-react';
import { AgentDetail, findCatalogModel } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
import { AgentBuilder } from '@/components/amberd/AgentBuilder';
import { AgentSpec } from '@/components/amberd/AgentSpec';
import { downloadJson } from '@/components/amberd/download';
import { inputClass } from '@/components/amberd/builder-fields';
import {
  DataTable,
  DemoBadge,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatusBadge,
  Td,
  WithOrganization,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUsd,
  shortId,
} from '@/components/amberd/ui';
import { cn } from '@/lib/utils';

const TABS = ['Overview & run', 'Edit configuration', 'JSON definition', 'Run history'] as const;
type Tab = (typeof TABS)[number];

/** Lets the user pick a document from the connected repository for a bound variable. */
const DocumentPicker = ({
  organizationId,
  connectionId,
  collection,
  value,
  onChange,
  label,
  collectionName,
}: {
  organizationId: string;
  connectionId: string;
  collection: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  collectionName: string;
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['amberd', organizationId, 'resources', connectionId, collection],
    queryFn: () => amberdApi.resources(organizationId, connectionId, collection),
  });
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-700" htmlFor={`doc-${label}`}>
        {label} <span className="font-normal text-slate-400">· from {collectionName}</span>
      </label>
      <select id={`doc-${label}`} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{isLoading ? 'Loading documents…' : 'Select a document…'}</option>
        {data?.map((resource) => (
          <option key={resource.id} value={resource.documentId}>
            {resource.title}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{errorMessage(error)}</p>}
    </div>
  );
};

const RunPanel = ({ organizationId, agent }: { organizationId: string; agent: AgentDetail }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const definition = agent.definition;
  const bindings = definition.dataInputs.flatMap((input) =>
    input.bindings.map((binding) => ({ ...binding, connectionId: input.connectionId })),
  );
  const boundNames = new Set(bindings.map((b) => b.variable));
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      definition.variables.map((v) => [v.name, v.defaultValue === undefined || v.defaultValue === null ? '' : String(v.defaultValue)]),
    ),
  );

  const emailAction = definition.actions.find((a) => a.type === 'SEND_EMAIL');
  const [recipientsText, setRecipientsText] = useState('');
  const recipients = recipientsText
    .split(/[\s,;]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const { data: connections = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'connections'],
    queryFn: () => amberdApi.connections(organizationId),
  });
  const { data: integrations } = useQuery({
    queryKey: ['amberd', organizationId, 'integrations-status'],
    queryFn: () => amberdApi.integrationsStatus(organizationId),
  });
  const collectionName = (connectionId: string, collection: string) => {
    const connection = connections.find((c) => c.id === connectionId);
    const named = connection?.resourceNames?.[collection]?.name;
    return named ? `${connection?.name}: ${named}` : `${connection?.name ?? 'connection'}: ${collection}/`;
  };

  const execute = useMutation({
    mutationFn: () => amberdApi.executeAgent(organizationId, agent.id, inputs, recipients),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      if (result.status === 'FAILED') toast.error('Run failed — the error is recorded on the run');
      else toast.success('Run completed');
      router.push(`/runs/${result.runId}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const model = findCatalogModel(definition.llm.model);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title="Execute agent"
        description="Manual trigger. Documents are retrieved through the connector with server-side permission checks."
      >
        {agent.status === 'INACTIVE' && <Notice tone="warn">This agent is inactive. Activate it to run.</Notice>}
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {bindings.map((binding) => {
            const fixedDocument = definition.variables.find((v) => v.name === binding.variable)?.defaultValue;
            const label = definition.compute.inputMapping[binding.variable] ?? binding.label ?? binding.variable;
            // A document set on the agent is used as-is: no choice to make at run time.
            if (fixedDocument) {
              return (
                <div key={binding.variable} className="space-y-1">
                  <p className="text-xs font-medium text-slate-700">{label}</p>
                  <p className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                    <FileText className="h-4 w-4 text-blue-600" aria-hidden />
                    {String(fixedDocument)}
                  </p>
                </div>
              );
            }
            return (
            <DocumentPicker
              key={binding.variable}
              organizationId={organizationId}
              connectionId={binding.connectionId}
              collection={binding.collection}
              label={definition.compute.inputMapping[binding.variable] ?? binding.label ?? binding.variable}
              collectionName={collectionName(binding.connectionId, binding.collection)}
              value={inputs[binding.variable] ?? ''}
              onChange={(value) => setInputs((current) => ({ ...current, [binding.variable]: value }))}
            />
            );
          })}
          {definition.variables
            .filter((variable) => !boundNames.has(variable.name))
            .map((variable) => (
              <div key={variable.name} className="space-y-1">
                <label className="block text-xs font-medium text-slate-700" htmlFor={`var-${variable.name}`}>
                  {variable.name} <span className="font-normal text-slate-400">· {variable.type}{variable.required ? ', required' : ''}</span>
                </label>
                <input
                  id={`var-${variable.name}`}
                  className={inputClass}
                  value={inputs[variable.name] ?? ''}
                  type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
                  onChange={(e) => setInputs((current) => ({ ...current, [variable.name]: e.target.value }))}
                />
                {variable.description && <p className="text-xs text-slate-500">{variable.description}</p>}
              </div>
            ))}
        </div>
        {emailAction && (
          <div className="mt-4 space-y-1">
            <label htmlFor="email-recipients" className="block text-xs font-medium text-slate-700">
              Email the report to <span className="font-normal text-slate-400">· separate addresses with commas</span>
            </label>
            <input
              id="email-recipients"
              type="text"
              inputMode="email"
              autoComplete="off"
              className={inputClass}
              placeholder="finance@company.com, cfo@company.com"
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              {emailAction.runWhen === 'ALWAYS' ? 'Sent automatically after every run' : 'Sent automatically when a discrepancy is found'}
              {emailAction.config?.recipients?.length ? `, also to ${emailAction.config.recipients.join(', ')}` : ''}. PDF
              report attached.{' '}
              {integrations?.email.isLocalTestInbox && (
                <span className="font-medium text-amber-700">
                  Email is currently routed to the local test inbox (Mailpit), not real mailboxes.
                </span>
              )}
            </p>
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => execute.mutate()} disabled={execute.isPending || agent.status === 'INACTIVE'}>
            {execute.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            {execute.isPending ? 'Running…' : 'Run agent'}
          </Button>
          {execute.isPending && (
            <span className="text-sm text-slate-500">
              Retrieving documents and calling {model?.displayName ?? definition.llm.model}…
            </span>
          )}
        </div>
      </Panel>
      <Panel title="Execution pipeline">
        <ol className="space-y-2.5 text-sm">
          {[
            'Load & validate definition',
            'Validate inputs',
            'Enforce governance limits',
            'Resolve connection & authorize resources',
            'Retrieve enterprise data',
            `Execute ${model?.displayName ?? definition.llm.model}`,
            'Validate structured output',
            ...(definition.compute.validators.length ? ['Deterministic backend checks'] : []),
            'Evaluate conditions',
            'Generate actions',
            'Record run, cost & monitoring',
          ].map((stepLabel, index) => (
            <li key={stepLabel} className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-700">
                {index + 1}
              </span>
              <span className="text-slate-700">{stepLabel}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
};

const History = ({ organizationId, agentId }: { organizationId: string; agentId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'runs', agentId],
    queryFn: () => amberdApi.runs(organizationId, agentId),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <Panel bodyClassName="p-0" title="Execution history">
      <DataTable headers={['Run', 'Status', 'Outcome', 'Started', 'Duration', 'Tokens', 'Cost']} isEmpty={!data.length} empty="No runs yet.">
        {data.map((run) => (
          <tr key={run.id} className="hover:bg-slate-50/80">
            <Td>
              <Link className="font-mono text-xs text-blue-600 hover:underline" href={`/runs/${run.id}`}>
                {shortId(run.id)}
              </Link>
            </Td>
            <Td><StatusBadge status={run.status} /></Td>
            <Td><StatusBadge status={run.outcome} /></Td>
            <Td>{formatDateTime(run.startedAt)}</Td>
            <Td>{formatDuration(run.durationMs)}</Td>
            <Td className="tabular-nums">{formatNumber(run.inputTokens + run.outputTokens)}</Td>
            <Td className="tabular-nums">{formatUsd(run.costUsd)}</Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
};

const AgentView = ({ organizationId, agentId }: { organizationId: string; agentId: string }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('Overview & run');
  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['amberd', organizationId, 'agent', agentId],
    queryFn: () => amberdApi.agent(organizationId, agentId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE') => amberdApi.setAgentStatus(organizationId, agentId, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      toast.success(`Agent ${updated.status.toLowerCase()}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const duplicateMutation = useMutation({
    mutationFn: () => amberdApi.duplicateAgent(organizationId, agentId),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      toast.success('Agent duplicated as a draft');
      router.push(`/agents/${copy.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Loading />;
  if (error || !agent) return <Notice tone="error">{errorMessage(error) || 'Agent not found'}</Notice>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <StatusBadge status={agent.status} />
          <span className="text-slate-500">
            {agent.department} · {findCatalogModel(agent.model)?.displayName ?? agent.model}
          </span>
          <span className="text-slate-500">{agent.runCount} runs · {formatUsd(agent.estimatedCostUsd)}</span>
          <span className="font-mono text-xs text-slate-400">{agent.definition.identity.agentKey}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate(agent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
          >
            <Power className="mr-1.5 h-3.5 w-3.5" /> {agent.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadJson(`${agent.definition.identity.agentKey}.amberd.json`, agent.definition)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export JSON
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Agent sections" className="flex gap-1 border-b border-slate-200">
        {TABS.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === value ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === 'Overview & run' && (
        <>
          <RunPanel organizationId={organizationId} agent={agent} />
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Agent configuration</h2>
            <button className="text-sm font-medium text-blue-600 hover:underline" onClick={() => setTab('Edit configuration')}>
              Edit configuration →
            </button>
          </div>
          <AgentSpec organizationId={organizationId} definition={agent.definition} />
        </>
      )}
      {tab === 'Edit configuration' && (
        <AgentBuilder key={agent.updatedAt} organizationId={organizationId} initial={agent.definition} agentId={agent.id} />
      )}
      {tab === 'JSON definition' && (
        <Panel
          title="JSON definition"
          description="Generated from the visual configuration. Edit it in Configuration → JSON."
          actions={<DemoBadge>schema {agent.definition.schemaVersion}</DemoBadge>}
        >
          <pre className="max-h-[70vh] overflow-auto rounded-lg bg-[#0b1733] p-4 font-mono text-xs leading-relaxed text-slate-100">
            {JSON.stringify(agent.definition, null, 2)}
          </pre>
        </Panel>
      )}
      {tab === 'Run history' && <History organizationId={organizationId} agentId={agent.id} />}
    </div>
  );
};

export default function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  return (
    <WithOrganization>
      {(organizationId) => <AgentPageInner organizationId={organizationId} agentId={agentId} />}
    </WithOrganization>
  );
}

const AgentPageInner = ({ organizationId, agentId }: { organizationId: string; agentId: string }) => {
  const { data: agent } = useQuery({
    queryKey: ['amberd', organizationId, 'agent', agentId],
    queryFn: () => amberdApi.agent(organizationId, agentId),
  });
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Agents', href: '/agents' }, { label: agent?.name ?? 'Agent' }]}
      title={agent?.name ?? 'Agent'}
      description={agent?.description ?? undefined}
    >
      <AgentView organizationId={organizationId} agentId={agentId} />
    </PageShell>
  );
};
