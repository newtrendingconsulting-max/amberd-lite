'use client';

import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ACTION_TYPE_LABELS,
  AgentDefinition,
  CONDITION_OPERATOR_LABELS,
  DETERMINISTIC_VALIDATOR_LABELS,
  OutputSchemaNode,
  PRIORITY_TIER_LABELS,
  findCatalogModel,
} from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import { DemoBadge, StatusBadge } from '@/components/amberd/ui';

const Section = ({ index, title, children, badge }: { index: string; title: string; children: ReactNode; badge?: ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0b1733] text-[11px] font-semibold text-white">
          {index}
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {badge}
    </header>
    <div className="p-5 text-sm">{children}</div>
  </section>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-1.5">
    <dt className="text-slate-500">{label}</dt>
    <dd className="min-w-0 text-slate-900">{children}</dd>
  </div>
);

const describeSchema = (node: OutputSchemaNode): string =>
  node.type === 'array' ? `list of ${node.items ? describeSchema(node.items) : 'values'}` : node.type;

/** Read-only view of every section of an agent definition. */
export const AgentSpec = ({ organizationId, definition }: { organizationId: string; definition: AgentDefinition }) => {
  const { data: connections = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'connections'],
    queryFn: () => amberdApi.connections(organizationId),
  });
  const { data: models = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'models'],
    queryFn: () => amberdApi.models(organizationId),
  });
  const model = models.find((m) => m.model === definition.llm.model);
  const actionLabel = (id: string) => definition.actions.find((a) => a.id === id)?.label ?? id;
  const isExecutableTrigger = definition.trigger.type === 'MANUAL' || definition.trigger.type === 'API';

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section index="A" title="Identity">
        <dl>
          <Row label="Agent name">{definition.identity.name}</Row>
          <Row label="Agent ID"><code className="text-xs">{definition.identity.agentKey}</code></Row>
          <Row label="Department">{definition.identity.department}</Row>
          <Row label="Status"><StatusBadge status={definition.identity.status} /></Row>
          <Row label="Description">{definition.identity.description || '—'}</Row>
        </dl>
      </Section>

      <Section index="B" title="LLM" badge={model ? <StatusBadge status={model.availability} /> : undefined}>
        <dl>
          <Row label="Provider">{model?.providerName ?? definition.llm.provider}</Row>
          <Row label="Model">
            {findCatalogModel(definition.llm.model)?.displayName ?? definition.llm.model}{' '}
            <code className="text-xs text-slate-400">{definition.llm.model}</code>
          </Row>
          <Row label="Reasoning effort">{definition.llm.effort}</Row>
          <Row label="Max output tokens">{definition.llm.maxOutputTokens.toLocaleString()}</Row>
          <Row label="Temperature">{definition.llm.temperature}</Row>
        </dl>
      </Section>

      <Section
        index="C"
        title="Trigger"
        badge={<StatusBadge status={isExecutableTrigger ? 'ACTIVE' : 'CONFIGURATION_ONLY'} />}
      >
        <dl>
          <Row label="Type">{definition.trigger.type.charAt(0) + definition.trigger.type.slice(1).toLowerCase()}</Row>
          {definition.trigger.schedule && (
            <Row label="Schedule">
              {definition.trigger.schedule.frequency.toLowerCase()} {definition.trigger.schedule.time ?? ''}{' '}
              {definition.trigger.schedule.cron ?? ''}
            </Row>
          )}
          <Row label="Execution">
            {isExecutableTrigger ? 'Runs on demand (Run tab or API)' : 'Saved configuration — no scheduler running in this build'}
          </Row>
        </dl>
      </Section>

      <Section index="D" title="Variables">
        <table className="w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Required</th>
              <th className="pb-2 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {definition.variables.map((v) => (
              <tr key={v.name}>
                <td className="py-1.5">
                  <code className="text-xs">{v.name}</code>
                  {v.description && <span className="block text-xs text-slate-500">{v.description}</span>}
                </td>
                <td className="py-1.5">{v.type}</td>
                <td className="py-1.5">{v.required ? 'Required' : 'Optional'}</td>
                <td className="py-1.5">{v.defaultValue === undefined || v.defaultValue === null ? '—' : String(v.defaultValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section index="E" title="Data Inputs">
        {definition.dataInputs.length === 0 && <p className="text-slate-500">No data inputs.</p>}
        {definition.dataInputs.map((input, index) => {
          const connection = connections.find((c) => c.id === input.connectionId);
          return (
            <dl key={index}>
              <Row label="Connection">
                {connection?.name ?? input.connectionId}{' '}
                {connection?.isSimulated && <DemoBadge>Simulated enterprise integration</DemoBadge>}
              </Row>
              <Row label="Authorized resources">
                {input.resources.map((r) => connection?.resourceNames?.[r]?.name ?? `${r}/`).join(', ')}
              </Row>
              <Row label="Permitted operations">{input.operations.join(', ')} (read-only)</Row>
              <Row label="Input mapping">
                {input.bindings.map((b) => (
                  <span key={b.variable} className="block">
                    <code className="text-xs">{b.variable}</code> → document in{' '}
                    <code className="text-xs">{connection?.resourceNames?.[b.collection]?.name ?? `${b.collection}/`}</code>
                  </span>
                ))}
              </Row>
            </dl>
          );
        })}
      </Section>

      <Section index="F" title="Compute">
        <dl>
          <Row label="System instructions"><p className="whitespace-pre-wrap text-slate-700">{definition.compute.systemInstructions}</p></Row>
          <Row label="Task instructions"><p className="whitespace-pre-wrap text-slate-700">{definition.compute.taskInstructions}</p></Row>
          <Row label="Output schema">
            {Object.entries(definition.compute.outputSchema.properties ?? {}).map(([key, node]) => (
              <span key={key} className="mr-2 inline-block">
                <code className="text-xs">{key}</code> <span className="text-xs text-slate-500">({describeSchema(node)})</span>
              </span>
            ))}
          </Row>
          <Row label="Deterministic checks">
            {definition.compute.validators.length
              ? definition.compute.validators.map((v) => <span key={v} className="block text-slate-700">{DETERMINISTIC_VALIDATOR_LABELS[v]}</span>)
              : 'None'}
          </Row>
        </dl>
      </Section>

      <Section index="G" title="Conditions">
        {definition.conditions.length === 0 && <p className="text-slate-500">No conditions.</p>}
        <ul className="space-y-3">
          {definition.conditions.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <p className="mb-1 font-medium text-slate-800">{c.name}</p>
              <p>
                <span className="font-semibold text-blue-700">IF</span> <code className="text-xs">{c.field}</code>{' '}
                {CONDITION_OPERATOR_LABELS[c.operator]}{' '}
                <code className="text-xs">{c.valueFromVariable ? `{{${c.valueFromVariable}}}` : String(c.value)}</code>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-emerald-700">THEN</span> {c.thenActions.map(actionLabel).join(' · ') || '—'}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-slate-500">ELSE</span> {c.elseActions.map(actionLabel).join(' · ') || '—'}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section index="H" title="Actions">
        <ul className="divide-y divide-slate-100">
          {definition.actions.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                {a.label}
                <span className="block text-xs text-slate-500">
                  {ACTION_TYPE_LABELS[a.type]}
                  {a.type === 'SEND_EMAIL' &&
                    ` · ${a.config?.recipients?.length ? a.config.recipients.join(', ') : 'recipients entered at run time'}${a.config?.attachReport === false ? '' : ' · PDF attached'}`}
                </span>
              </span>
              <span className="text-xs text-slate-500">{a.runWhen === 'ALWAYS' ? 'Always' : 'When a condition selects it'}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section index="I" title="Resource Limits">
        <dl>
          <Row label="Max concurrency">{definition.resourceLimits.maxConcurrency} <StatusBadge status="ENFORCED" /></Row>
          <Row label="Execution timeout">{definition.resourceLimits.timeoutSeconds}s <StatusBadge status="ENFORCED" /></Row>
          <Row label="Data resources / run">{definition.resourceLimits.maxDataResources} <StatusBadge status="ENFORCED" /></Row>
          <Row label="Spending cap">
            ${definition.resourceLimits.spendCapUsd} per {definition.resourceLimits.spendWindowDays} days <StatusBadge status="ENFORCED" />
          </Row>
          <Row label="Priority tier">
            {PRIORITY_TIER_LABELS[definition.resourceLimits.priorityTier]} <DemoBadge>Configuration only</DemoBadge>
          </Row>
        </dl>
      </Section>
    </div>
  );
};
