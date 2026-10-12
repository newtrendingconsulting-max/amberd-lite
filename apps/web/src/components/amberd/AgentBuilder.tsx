'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileJson, LayoutList, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import {
  ACTION_RUN_WHEN,
  ACTION_TYPE_LABELS,
  ACTION_TYPES,
  AgentAction,
  AgentDefinition,
  CONDITION_OPERATOR_LABELS,
  CONDITION_OPERATORS,
  ConditionRule,
  DATA_OPERATIONS,
  DEPARTMENTS,
  DETERMINISTIC_VALIDATOR_LABELS,
  DETERMINISTIC_VALIDATORS,
  JsonSchemaType,
  LLM_EFFORTS,
  MODEL_CATALOG,
  OutputSchemaNode,
  PRIORITY_TIER_LABELS,
  PRIORITY_TIERS,
  SCHEDULE_FREQUENCIES,
  TRIGGER_TYPES,
  VARIABLE_TYPES,
  validateAgentDefinition,
} from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
import { downloadJson } from '@/components/amberd/download';
import { DemoBadge, Notice, StatusBadge } from '@/components/amberd/ui';
import {
  CheckboxChip,
  NumberInput,
  SectionCard,
  SelectInput,
  TextArea,
  TextInput,
  inputClass,
} from '@/components/amberd/builder-fields';
import { cn } from '@/lib/utils';

const SECTIONS = [
  ['identity', 'Identity'],
  ['llm', 'LLM'],
  ['trigger', 'Trigger'],
  ['variables', 'Variables'],
  ['dataInputs', 'Data Inputs'],
  ['compute', 'Compute'],
  ['conditions', 'Conditions'],
  ['actions', 'Actions'],
  ['resourceLimits', 'Resource Limits'],
] as const;

/** Fields the invoice_reconciliation validator adds, offered as condition targets. */
const VALIDATOR_FIELDS: Record<string, string[]> = {
  invoice_reconciliation: [
    'discrepancy_amount',
    'discrepancy_direction',
    'invoice_total',
    'purchase_order_total',
    'supplier_match',
    'po_reference_match',
    'currency_match',
  ],
};

const TRIGGER_INFO: Record<string, { label: string; status: string; note: string }> = {
  MANUAL: { label: 'Manual', status: 'ACTIVE', note: 'Run on demand from Amberd Lite. Fully working.' },
  API: { label: 'API', status: 'ACTIVE', note: 'Authenticated POST /amberd/agents/:id/execute. Working.' },
  SCHEDULED: {
    label: 'Scheduled',
    status: 'CONFIGURATION_ONLY',
    note: 'Schedule is saved, but no scheduler runs in this hackathon build.',
  },
  CONTINUOUS: {
    label: 'Continuous',
    status: 'CONFIGURATION_ONLY',
    note: 'Saved configuration only. Continuous execution is not running in this build.',
  },
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'agent';

const prettyJson = (definition: AgentDefinition): string => JSON.stringify(definition, null, 2);

interface AgentBuilderProps {
  organizationId: string;
  initial: AgentDefinition;
  agentId?: string;
}

export const AgentBuilder = ({ organizationId, initial, agentId }: AgentBuilderProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [definition, setDefinition] = useState<AgentDefinition>(initial);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState(() => prettyJson(initial));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string | null>(null);
  const [isKeyEdited, setIsKeyEdited] = useState(Boolean(agentId));
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: connections = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'connections'],
    queryFn: () => amberdApi.connections(organizationId),
  });
  const { data: models = [] } = useQuery({
    queryKey: ['amberd', organizationId, 'models'],
    queryFn: () => amberdApi.models(organizationId),
  });

  const validation = useMemo(() => validateAgentDefinition(definition), [definition]);
  const errorsFor = (prefix: string) => validation.errors.filter((e) => e.path.startsWith(prefix));
  const errorAt = (path: string) => validation.errors.find((e) => e.path === path)?.message;

  // Keep the JSON view in sync with visual edits.
  useEffect(() => {
    if (mode === 'visual') {
      setJsonText(prettyJson(definition));
      setJsonError(null);
    }
  }, [definition, mode]);

  const update = (mutate: (draft: AgentDefinition) => void) => {
    setDefinition((current) => {
      const draft = structuredClone(current);
      mutate(draft);
      return draft;
    });
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text) as AgentDefinition;
      setJsonError(null);
      setDefinition(parsed);
    } catch (error) {
      setJsonError(`Invalid JSON: ${(error as Error).message}`);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AgentDefinition;
      setDefinition(parsed);
      setJsonText(prettyJson(parsed));
      setIsKeyEdited(true);
      const result = validateAgentDefinition(parsed);
      toast[result.isValid ? 'success' : 'warning'](
        result.isValid ? `Imported ${file.name}` : `Imported ${file.name} with ${result.errors.length} issue(s) to fix`,
      );
    } catch {
      toast.error('That file is not valid JSON');
    }
  };

  const validateMutation = useMutation({
    mutationFn: () => amberdApi.validateAgent(organizationId, definition, agentId),
    onSuccess: (result) => {
      if (result.isValid) {
        setServerErrors(null);
        toast.success('Definition is valid (checked by the server)');
      } else {
        setServerErrors(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
      }
    },
    onError: (error) => setServerErrors(errorMessage(error)),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      agentId
        ? amberdApi.updateAgent(organizationId, agentId, definition)
        : amberdApi.createAgent(organizationId, definition),
    onSuccess: (agent) => {
      setServerErrors(null);
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      toast.success(agentId ? 'Agent saved' : 'Agent created');
      if (!agentId) router.push(`/agents/${agent.id}`);
    },
    onError: (error) => setServerErrors(errorMessage(error)),
  });

  const providerModels = MODEL_CATALOG.filter((m) => m.provider === definition.llm.provider);
  const selectedModel = models.find((m) => m.model === definition.llm.model);
  const outputFields = Object.keys(definition.compute.outputSchema?.properties ?? {});
  const conditionFields = Array.from(
    new Set([
      ...outputFields,
      ...definition.compute.validators.flatMap((v) => VALIDATOR_FIELDS[v] ?? []),
    ]),
  );
  const variableNames = definition.variables.map((v) => v.name);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* Section navigation */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="tablist">
            {(['visual', 'json'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  mode === value ? 'bg-[#0b1733] text-white' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {value === 'visual' ? <LayoutList className="h-3.5 w-3.5" /> : <FileJson className="h-3.5 w-3.5" />}
                {value === 'visual' ? 'Visual' : 'JSON'}
              </button>
            ))}
          </div>
          {mode === 'visual' && (
            <nav aria-label="Builder sections" className="space-y-0.5">
              {SECTIONS.map(([id, label], index) => {
                const count = errorsFor(id).length;
                return (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900"
                  >
                    <span>
                      <span className="mr-2 text-xs text-slate-400">{String.fromCharCode(65 + index)}</span>
                      {label}
                    </span>
                    {count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label={`${count} issues`} />}
                  </a>
                );
              })}
            </nav>
          )}
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs',
              validation.isValid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800',
            )}
          >
            {validation.isValid ? 'Schema valid' : `${validation.errors.length} schema issue(s)`}
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {/* Toolbar */}
        <div className="sticky top-16 z-30 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 lg:hidden">
            <Button size="sm" variant={mode === 'visual' ? 'default' : 'outline'} onClick={() => setMode('visual')}>
              Visual
            </Button>
            <Button size="sm" variant={mode === 'json' ? 'default' : 'outline'} onClick={() => setMode('json')}>
              JSON
            </Button>
          </div>
          <p className="hidden text-xs text-slate-500 lg:block">
            Visual configuration and JSON are the same definition — edits in either are kept in sync.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadJson(`${definition.identity.agentKey || 'agent'}.amberd.json`, definition)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              {validateMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Validate
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!validation.isValid || saveMutation.isPending || Boolean(jsonError)}
            >
              {saveMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {agentId ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </div>

        {serverErrors && (
          <Notice tone="error">
            <p className="font-medium">The server rejected this definition</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs">{serverErrors}</pre>
          </Notice>
        )}

        {mode === 'json' ? (
          <div className="space-y-3">
            <Notice>
              This JSON is generated from the visual builder and validated against the same schema the server enforces.
              It is declarative only — executable code is not accepted.
            </Notice>
            {jsonError && <Notice tone="error">{jsonError}</Notice>}
            {!validation.isValid && !jsonError && (
              <Notice tone="warn">
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {validation.errors.slice(0, 12).map((e) => (
                    <li key={`${e.path}-${e.message}`}>
                      <code>{e.path || '(root)'}</code>: {e.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            <textarea
              aria-label="Agent JSON definition"
              spellCheck={false}
              className="h-[70vh] w-full rounded-xl border border-slate-300 bg-[#0b1733] p-4 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={jsonText}
              onChange={(event) => handleJsonChange(event.target.value)}
            />
          </div>
        ) : (
          <>
            {/* A. Identity */}
            <SectionCard id="identity" index="A" title="Identity" description="Who this agent is and who owns it" errorCount={errorsFor('identity').length}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label="Agent name"
                  value={definition.identity.name}
                  error={errorAt('identity.name')}
                  onChange={(value) =>
                    update((d) => {
                      d.identity.name = value;
                      if (!isKeyEdited) d.identity.agentKey = slugify(value);
                    })
                  }
                />
                <TextInput
                  label="Agent ID"
                  value={definition.identity.agentKey}
                  error={errorAt('identity.agentKey')}
                  hint="Stable identifier used in exports and the API"
                  onChange={(value) => {
                    setIsKeyEdited(true);
                    update((d) => {
                      d.identity.agentKey = value;
                    });
                  }}
                />
                <SelectInput
                  label="Department"
                  value={definition.identity.department}
                  options={Array.from(new Set([...DEPARTMENTS, definition.identity.department])).map((d) => ({ value: d, label: d }))}
                  onChange={(value) => update((d) => void (d.identity.department = value))}
                />
                <SelectInput
                  label="Status"
                  value={definition.identity.status}
                  options={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'INACTIVE', label: 'Inactive' },
                  ]}
                  onChange={(value) => update((d) => void (d.identity.status = value))}
                />
              </div>
              <TextArea
                label="Description"
                rows={2}
                value={definition.identity.description}
                error={errorAt('identity.description')}
                onChange={(value) => update((d) => void (d.identity.description = value))}
              />
            </SectionCard>

            {/* B. LLM */}
            <SectionCard
              id="llm"
              index="B"
              title="LLM"
              description="Each agent selects its own model"
              errorCount={errorsFor('llm').length}
              badge={selectedModel ? <StatusBadge status={selectedModel.availability} /> : undefined}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectInput
                  label="Provider"
                  value={definition.llm.provider}
                  options={Array.from(new Map(MODEL_CATALOG.map((m) => [m.provider, m])).values()).map((m) => ({
                    value: m.provider,
                    label: `${m.providerName}${m.provider === 'open-source' ? ' (open-source)' : m.provider === 'open-weight' ? ' (open-weight)' : ''}${m.isIntegrated ? '' : ' — not integrated'}`,
                  }))}
                  onChange={(value) =>
                    update((d) => {
                      d.llm.provider = value;
                      d.llm.model = MODEL_CATALOG.find((m) => m.provider === value)?.model ?? '';
                    })
                  }
                />
                <SelectInput
                  label="Model"
                  value={definition.llm.model}
                  error={errorAt('llm.model')}
                  options={providerModels.map((m) => ({ value: m.model, label: m.displayName }))}
                  onChange={(value) => update((d) => void (d.llm.model = value))}
                />
                <NumberInput
                  label="Maximum output tokens"
                  value={definition.llm.maxOutputTokens}
                  min={256}
                  max={64000}
                  step={256}
                  error={errorAt('llm.maxOutputTokens')}
                  onChange={(value) => update((d) => void (d.llm.maxOutputTokens = value))}
                />
                <SelectInput
                  label="Reasoning effort"
                  value={definition.llm.effort}
                  options={LLM_EFFORTS.map((e) => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
                  hint="Sent to the model. Low is fastest and cheapest."
                  onChange={(value) => update((d) => void (d.llm.effort = value))}
                />
                <NumberInput
                  label="Temperature"
                  value={definition.llm.temperature}
                  min={0}
                  max={1}
                  step={0.1}
                  error={errorAt('llm.temperature')}
                  hint="Saved with the agent. Claude 5.x models fix sampling server-side, so it is not sent for them."
                  onChange={(value) => update((d) => void (d.llm.temperature = value))}
                />
              </div>
              {selectedModel && selectedModel.availability !== 'AVAILABLE' && (
                <Notice tone="warn">
                  {selectedModel.availability === 'NOT_INTEGRATED'
                    ? 'This provider has no client in the hackathon build — runs will fail with a recorded error.'
                    : 'This provider has no API key configured on the server — runs will fail until one is added.'}
                </Notice>
              )}
            </SectionCard>

            {/* C. Trigger */}
            <SectionCard id="trigger" index="C" title="Trigger" description="How runs start" errorCount={errorsFor('trigger').length}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Trigger type">
                {TRIGGER_TYPES.map((type) => {
                  const info = TRIGGER_INFO[type];
                  const isSelected = definition.trigger.type === type;
                  return (
                    <button
                      key={type}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        update((d) => {
                          d.trigger.type = type;
                          if (type === 'SCHEDULED' && !d.trigger.schedule) {
                            d.trigger.schedule = { frequency: 'DAILY', time: '08:00', timezone: 'UTC' };
                          }
                          if (type !== 'SCHEDULED') delete d.trigger.schedule;
                        })
                      }
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        isSelected ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{info.label}</span>
                        <StatusBadge status={info.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{info.note}</p>
                    </button>
                  );
                })}
              </div>
              {definition.trigger.type === 'SCHEDULED' && definition.trigger.schedule && (
                <div className="grid gap-4 sm:grid-cols-4">
                  <SelectInput
                    label="Frequency"
                    value={definition.trigger.schedule.frequency}
                    options={SCHEDULE_FREQUENCIES.map((f) => ({ value: f, label: f.charAt(0) + f.slice(1).toLowerCase() }))}
                    onChange={(value) => update((d) => void (d.trigger.schedule!.frequency = value))}
                  />
                  <TextInput
                    label="Time (24h)"
                    value={definition.trigger.schedule.time ?? ''}
                    error={errorAt('trigger.schedule.time')}
                    onChange={(value) => update((d) => void (d.trigger.schedule!.time = value))}
                  />
                  {definition.trigger.schedule.frequency === 'WEEKLY' && (
                    <SelectInput
                      label="Day of week"
                      value={String(definition.trigger.schedule.dayOfWeek ?? 1)}
                      options={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => ({ value: String(i), label: day }))}
                      onChange={(value) => update((d) => void (d.trigger.schedule!.dayOfWeek = Number(value)))}
                    />
                  )}
                  {definition.trigger.schedule.frequency === 'MONTHLY' && (
                    <NumberInput
                      label="Day of month"
                      value={definition.trigger.schedule.dayOfMonth ?? 1}
                      min={1}
                      max={28}
                      onChange={(value) => update((d) => void (d.trigger.schedule!.dayOfMonth = value))}
                    />
                  )}
                  {definition.trigger.schedule.frequency === 'CUSTOM' && (
                    <TextInput
                      label="Cron expression"
                      value={definition.trigger.schedule.cron ?? ''}
                      placeholder="0 8 * * 1-5"
                      error={errorAt('trigger.schedule.cron')}
                      onChange={(value) => update((d) => void (d.trigger.schedule!.cron = value))}
                    />
                  )}
                </div>
              )}
            </SectionCard>

            {/* D. Variables */}
            <SectionCard id="variables" index="D" title="Variables" description="Typed inputs supplied when the agent runs" errorCount={errorsFor('variables').length}>
              <div className="space-y-3">
                {definition.variables.map((variable, index) => (
                  <div key={index} className="grid items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_auto]">
                    <TextInput
                      label="Name"
                      value={variable.name}
                      error={errorAt(`variables[${index}].name`)}
                      onChange={(value) => update((d) => void (d.variables[index].name = value))}
                    />
                    <SelectInput
                      label="Type"
                      value={variable.type}
                      options={VARIABLE_TYPES.map((t) => ({ value: t, label: t === 'json' ? 'JSON' : t }))}
                      onChange={(value) => update((d) => void (d.variables[index].type = value))}
                    />
                    <SelectInput
                      label="Required"
                      value={variable.required ? 'yes' : 'no'}
                      options={[
                        { value: 'yes', label: 'Required' },
                        { value: 'no', label: 'Optional' },
                      ]}
                      onChange={(value) => update((d) => void (d.variables[index].required = value === 'yes'))}
                    />
                    <TextInput
                      label="Default value"
                      value={variable.defaultValue === undefined || variable.defaultValue === null ? '' : String(variable.defaultValue)}
                      onChange={(value) =>
                        update((d) => {
                          const v = d.variables[index];
                          if (value === '') delete v.defaultValue;
                          else v.defaultValue = v.type === 'number' ? Number(value) : v.type === 'boolean' ? value === 'true' : value;
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove variable ${variable.name}`}
                      onClick={() => update((d) => void d.variables.splice(index, 1))}
                    >
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </Button>
                    <TextInput
                      className="sm:col-span-5"
                      label="Description"
                      value={variable.description ?? ''}
                      onChange={(value) => update((d) => void (d.variables[index].description = value))}
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) =>
                    void d.variables.push({ name: `variable_${d.variables.length + 1}`, type: 'string', required: false, description: '' }),
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add variable
              </Button>
            </SectionCard>

            {/* E. Data inputs */}
            <SectionCard
              id="dataInputs"
              index="E"
              title="Data Inputs"
              description="Enterprise connections, authorized resources, and permitted operations"
              errorCount={errorsFor('dataInputs').length}
            >
              {definition.dataInputs.map((input, index) => {
                const connection = connections.find((c) => c.id === input.connectionId);
                return (
                  <div key={index} className="space-y-4 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex items-end gap-3">
                      <SelectInput
                        className="flex-1"
                        label="Enterprise connection"
                        value={input.connectionId}
                        error={errorAt(`dataInputs[${index}].connectionId`)}
                        options={[
                          { value: '', label: 'Select a connection…' },
                          ...connections.map((c) => ({
                            value: c.id,
                            label: `${c.name}${c.status === 'CONNECTED' ? '' : ' (not configured)'}`,
                            disabled: c.status !== 'CONNECTED',
                          })),
                        ]}
                        onChange={(value) =>
                          update((d) => {
                            d.dataInputs[index].connectionId = value;
                            d.dataInputs[index].resources = [];
                            d.dataInputs[index].bindings = [];
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove data input"
                        onClick={() => update((d) => void d.dataInputs.splice(index, 1))}
                      >
                        <Trash2 className="h-4 w-4 text-slate-500" />
                      </Button>
                    </div>
                    {connection?.isSimulated && (
                      <p className="text-xs text-slate-500">
                        <DemoBadge>Simulated integration</DemoBadge> Local Enterprise Document Connector — real files, not a live
                        Google Drive.
                      </p>
                    )}
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-700">Authorized resources</p>
                      <div className="flex flex-wrap gap-2">
                        {(connection?.authorizedResources ?? []).map((resource) => (
                          <CheckboxChip
                            key={resource}
                            checked={input.resources.includes(resource)}
                            onChange={(checked) =>
                              update((d) => {
                                const di = d.dataInputs[index];
                                di.resources = checked ? [...di.resources, resource] : di.resources.filter((r) => r !== resource);
                                if (!checked) di.bindings = di.bindings.filter((b) => b.collection !== resource);
                              })
                            }
                          >
                            {connection?.resourceNames?.[resource]?.name ?? resource}
                          </CheckboxChip>
                        ))}
                        {!connection && <span className="text-xs text-slate-500">Select a connection first.</span>}
                      </div>
                      {errorAt(`dataInputs[${index}].resources`) && (
                        <p className="mt-1 text-xs text-red-600">{errorAt(`dataInputs[${index}].resources`)}</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-700">Permitted operations</p>
                      <div className="flex gap-2">
                        {DATA_OPERATIONS.map((op) => (
                          <CheckboxChip
                            key={op}
                            checked={input.operations.includes(op)}
                            onChange={(checked) =>
                              update((d) => {
                                const di = d.dataInputs[index];
                                di.operations = checked ? [...di.operations, op] : di.operations.filter((o) => o !== op);
                              })
                            }
                          >
                            {op}
                          </CheckboxChip>
                        ))}
                        <span className="text-xs text-slate-400">Write operations are not offered by this connector.</span>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-700">Input mapping — which variable selects a document</p>
                      <div className="space-y-2">
                        {input.bindings.map((binding, bIndex) => (
                          <div key={bIndex} className="flex items-end gap-2">
                            <SelectInput
                              className="flex-1"
                              label="Variable"
                              value={binding.variable}
                              error={errorAt(`dataInputs[${index}].bindings[${bIndex}].variable`)}
                              options={[{ value: '', label: 'Select…' }, ...variableNames.map((n) => ({ value: n, label: n }))]}
                              onChange={(value) => update((d) => void (d.dataInputs[index].bindings[bIndex].variable = value))}
                            />
                            <SelectInput
                              className="flex-1"
                              label="Collection"
                              value={binding.collection}
                              error={errorAt(`dataInputs[${index}].bindings[${bIndex}].collection`)}
                              options={[
                                { value: '', label: 'Select…' },
                                ...input.resources.map((r) => ({ value: r, label: connection?.resourceNames?.[r]?.name ?? r })),
                              ]}
                              onChange={(value) => update((d) => void (d.dataInputs[index].bindings[bIndex].collection = value))}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove mapping"
                              onClick={() => update((d) => void d.dataInputs[index].bindings.splice(bIndex, 1))}
                            >
                              <Trash2 className="h-4 w-4 text-slate-500" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            update((d) =>
                              void d.dataInputs[index].bindings.push({
                                variable: variableNames[0] ?? '',
                                collection: d.dataInputs[index].resources[0] ?? '',
                              }),
                            )
                          }
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Map a variable to a document
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) =>
                    void d.dataInputs.push({
                      connectionId: connections.find((c) => c.status === 'CONNECTED')?.id ?? '',
                      resources: [],
                      operations: ['list', 'read'],
                      bindings: [],
                    }),
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add data input
              </Button>
            </SectionCard>

            {/* F. Compute */}
            <SectionCard id="compute" index="F" title="Compute" description="Instructions, input mapping, output schema, deterministic checks" errorCount={errorsFor('compute').length}>
              <TextArea
                label="System instructions"
                rows={4}
                value={definition.compute.systemInstructions}
                error={errorAt('compute.systemInstructions')}
                onChange={(value) => update((d) => void (d.compute.systemInstructions = value))}
              />
              <TextArea
                label="Task instructions"
                rows={4}
                value={definition.compute.taskInstructions}
                error={errorAt('compute.taskInstructions')}
                onChange={(value) => update((d) => void (d.compute.taskInstructions = value))}
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-700">Document labels shown to the model</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {definition.dataInputs.flatMap((input) => input.bindings).map((binding) => (
                    <TextInput
                      key={binding.variable}
                      label={binding.variable}
                      value={definition.compute.inputMapping[binding.variable] ?? ''}
                      error={errorAt(`compute.inputMapping.${binding.variable}`)}
                      onChange={(value) =>
                        update((d) => {
                          if (value) d.compute.inputMapping[binding.variable] = value;
                          else delete d.compute.inputMapping[binding.variable];
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <OutputSchemaEditor
                schema={definition.compute.outputSchema}
                error={errorsFor('compute.outputSchema')[0]?.message}
                onChange={(schema) => update((d) => void (d.compute.outputSchema = schema))}
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-700">Deterministic validators (run in backend code)</p>
                <div className="space-y-2">
                  {DETERMINISTIC_VALIDATORS.map((validator) => (
                    <label key={validator} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={definition.compute.validators.includes(validator)}
                        onChange={(event) =>
                          update((d) => {
                            d.compute.validators = event.target.checked
                              ? [...d.compute.validators, validator]
                              : d.compute.validators.filter((v) => v !== validator);
                          })
                        }
                      />
                      <span className="text-slate-700">{DETERMINISTIC_VALIDATOR_LABELS[validator]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* G. Conditions */}
            <SectionCard
              id="conditions"
              index="G"
              title="Conditions"
              description="IF / THEN rules evaluated in application code after the model runs"
              errorCount={errorsFor('conditions').length}
            >
              {definition.conditions.map((condition, index) => (
                <ConditionEditor
                  key={index}
                  condition={condition}
                  fields={conditionFields}
                  variables={variableNames}
                  actions={definition.actions}
                  errorAt={(suffix) => errorAt(`conditions[${index}].${suffix}`)}
                  onChange={(next) => update((d) => void (d.conditions[index] = next))}
                  onRemove={() => update((d) => void d.conditions.splice(index, 1))}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) =>
                    void d.conditions.push({
                      id: `condition-${d.conditions.length + 1}`,
                      name: 'New condition',
                      field: conditionFields[0] ?? 'field',
                      operator: 'gt',
                      value: 0,
                      thenActions: [],
                      elseActions: [],
                    }),
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add condition
              </Button>
            </SectionCard>

            {/* H. Actions */}
            <SectionCard id="actions" index="H" title="Actions" description="What the platform does after evaluation" errorCount={errorsFor('actions').length}>
              {definition.actions.map((action, index) => (
                <div key={index} className="grid items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[0.8fr_1.1fr_1.4fr_0.9fr_auto]">
                  <TextInput
                    label="Action ID"
                    value={action.id}
                    error={errorAt(`actions[${index}].id`)}
                    onChange={(value) => update((d) => void (d.actions[index].id = value))}
                  />
                  <SelectInput
                    label="Type"
                    value={action.type}
                    options={ACTION_TYPES.map((t) => ({ value: t, label: ACTION_TYPE_LABELS[t] }))}
                    onChange={(value) => update((d) => void (d.actions[index].type = value))}
                  />
                  <TextInput
                    label="Label"
                    value={action.label}
                    error={errorAt(`actions[${index}].label`)}
                    onChange={(value) => update((d) => void (d.actions[index].label = value))}
                  />
                  <SelectInput
                    label="Runs"
                    value={action.runWhen}
                    options={ACTION_RUN_WHEN.map((r) => ({ value: r, label: r === 'ALWAYS' ? 'Always' : 'When a condition selects it' }))}
                    onChange={(value) => update((d) => void (d.actions[index].runWhen = value))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove action ${action.id}`}
                    onClick={() =>
                      update((d) => {
                        const removed = d.actions[index].id;
                        d.actions.splice(index, 1);
                        d.conditions.forEach((c) => {
                          c.thenActions = c.thenActions.filter((a) => a !== removed);
                          c.elseActions = c.elseActions.filter((a) => a !== removed);
                        });
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-slate-500" />
                  </Button>
                  {action.type === 'SEND_EMAIL' && (
                    <div className="grid gap-3 sm:col-span-5 sm:grid-cols-[1fr_auto]">
                      <TextInput
                        label="Default recipients (comma-separated, optional)"
                        value={(action.config?.recipients ?? []).join(', ')}
                        error={errorsFor(`actions[${index}].config.recipients`)[0]?.message}
                        hint="People running the agent can add more addresses on the Run screen."
                        onChange={(value) =>
                          update((d) =>
                            void (d.actions[index].config = {
                              ...d.actions[index].config,
                              recipients: value
                                .split(/[\s,;]+/)
                                .map((r) => r.trim())
                                .filter(Boolean),
                            }),
                          )
                        }
                      />
                      <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={action.config?.attachReport !== false}
                          onChange={(event) =>
                            update((d) => void (d.actions[index].config = { ...d.actions[index].config, attachReport: event.target.checked }))
                          }
                        />
                        Attach PDF report
                      </label>
                    </div>
                  )}
                  {(action.type === 'CREATE_NOTIFICATION' || action.type === 'GENERATE_REPORT' || action.type === 'SEND_EMAIL') && (
                    <TextInput
                      className="sm:col-span-5"
                      label={action.type === 'CREATE_NOTIFICATION' ? 'Notification title' : 'Report title'}
                      value={action.config?.title ?? ''}
                      onChange={(value) => update((d) => void (d.actions[index].config = { ...d.actions[index].config, title: value }))}
                    />
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) =>
                    void d.actions.push({
                      id: `action-${d.actions.length + 1}`,
                      type: 'CREATE_NOTIFICATION',
                      label: 'New action',
                      runWhen: 'ON_CONDITION',
                    }),
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add action
              </Button>
              <p className="text-xs text-slate-500">
                Approvals are recorded in Amberd Lite only. No payment or financial system is touched.
              </p>
            </SectionCard>

            {/* I. Resource limits */}
            <SectionCard id="resourceLimits" index="I" title="Resource Limits" description="Per-agent governance enforced by the execution engine" errorCount={errorsFor('resourceLimits').length}>
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberInput
                  label="Maximum concurrency"
                  value={definition.resourceLimits.maxConcurrency}
                  min={1}
                  error={errorAt('resourceLimits.maxConcurrency')}
                  hint={<StatusBadge status="ENFORCED" />}
                  onChange={(value) => update((d) => void (d.resourceLimits.maxConcurrency = value))}
                />
                <NumberInput
                  label="Execution timeout (seconds)"
                  value={definition.resourceLimits.timeoutSeconds}
                  min={10}
                  error={errorAt('resourceLimits.timeoutSeconds')}
                  hint={<StatusBadge status="ENFORCED" />}
                  onChange={(value) => update((d) => void (d.resourceLimits.timeoutSeconds = value))}
                />
                <NumberInput
                  label="Data resource limit per run"
                  value={definition.resourceLimits.maxDataResources}
                  min={1}
                  error={errorAt('resourceLimits.maxDataResources')}
                  hint={<StatusBadge status="ENFORCED" />}
                  onChange={(value) => update((d) => void (d.resourceLimits.maxDataResources = value))}
                />
                <NumberInput
                  label="Rolling AI spending cap (USD)"
                  value={definition.resourceLimits.spendCapUsd}
                  min={0}
                  step={1}
                  error={errorAt('resourceLimits.spendCapUsd')}
                  hint={<StatusBadge status="ENFORCED" />}
                  onChange={(value) => update((d) => void (d.resourceLimits.spendCapUsd = value))}
                />
                <NumberInput
                  label="Spending window (days)"
                  value={definition.resourceLimits.spendWindowDays}
                  min={1}
                  error={errorAt('resourceLimits.spendWindowDays')}
                  onChange={(value) => update((d) => void (d.resourceLimits.spendWindowDays = value))}
                />
                <SelectInput
                  label="Priority tier"
                  value={definition.resourceLimits.priorityTier}
                  options={PRIORITY_TIERS.map((t) => ({ value: t, label: PRIORITY_TIER_LABELS[t] }))}
                  hint={<DemoBadge>Configuration only — no GPU scheduler connected</DemoBadge>}
                  onChange={(value) => update((d) => void (d.resourceLimits.priorityTier = value))}
                />
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
};

const ConditionEditor = ({
  condition,
  fields,
  variables,
  actions,
  errorAt,
  onChange,
  onRemove,
}: {
  condition: ConditionRule;
  fields: string[];
  variables: string[];
  actions: AgentAction[];
  errorAt: (suffix: string) => string | undefined;
  onChange: (next: ConditionRule) => void;
  onRemove: () => void;
}) => {
  const usesVariable = condition.valueFromVariable !== undefined;
  const set = (patch: Partial<ConditionRule>) => onChange({ ...condition, ...patch });
  const toggle = (branch: 'thenActions' | 'elseActions', id: string, checked: boolean) =>
    set({ [branch]: checked ? [...condition[branch], id] : condition[branch].filter((a) => a !== id) });

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-end gap-3">
        <TextInput className="flex-1" label="Condition name" value={condition.name} error={errorAt('name')} onChange={(name) => set({ name })} />
        <Button variant="ghost" size="icon" aria-label="Remove condition" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-slate-500" />
        </Button>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[auto_1.3fr_1fr_1.3fr]">
        <span className="pb-2 text-sm font-semibold text-blue-700">IF</span>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor={`${condition.id}-field`}>
            Output field
          </label>
          <input
            id={`${condition.id}-field`}
            list={`${condition.id}-fields`}
            className={inputClass}
            value={condition.field}
            onChange={(event) => set({ field: event.target.value })}
          />
          <datalist id={`${condition.id}-fields`}>
            {fields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          {errorAt('field') && <p className="text-xs text-red-600">{errorAt('field')}</p>}
        </div>
        <SelectInput
          label="Operator"
          value={condition.operator}
          options={CONDITION_OPERATORS.map((op) => ({ value: op, label: CONDITION_OPERATOR_LABELS[op] }))}
          onChange={(operator) => set({ operator })}
        />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Threshold</span>
            <button
              type="button"
              className="text-[11px] text-blue-600 hover:underline"
              onClick={() =>
                usesVariable
                  ? onChange({ ...condition, valueFromVariable: undefined, value: 0 })
                  : onChange({ ...condition, valueFromVariable: variables[0] ?? '', value: undefined })
              }
            >
              {usesVariable ? 'Use a fixed value' : 'Use a variable'}
            </button>
          </div>
          {usesVariable ? (
            <select
              aria-label="Threshold variable"
              className={inputClass}
              value={condition.valueFromVariable}
              onChange={(event) => set({ valueFromVariable: event.target.value })}
            >
              {variables.map((v) => (
                <option key={v} value={v}>
                  {`{{${v}}}`}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Threshold value"
              className={inputClass}
              value={condition.value === undefined || condition.value === null ? '' : String(condition.value)}
              onChange={(event) => {
                const raw = event.target.value;
                const numeric = Number(raw);
                set({
                  value: raw === 'true' || raw === 'false' ? raw === 'true' : raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw,
                });
              }}
            />
          )}
          {(errorAt('value') || errorAt('valueFromVariable')) && (
            <p className="text-xs text-red-600">{errorAt('value') ?? errorAt('valueFromVariable')}</p>
          )}
        </div>
      </div>
      {(['thenActions', 'elseActions'] as const).map((branch) => (
        <div key={branch} className="flex flex-wrap items-center gap-2">
          <span className={cn('w-14 text-sm font-semibold', branch === 'thenActions' ? 'text-emerald-700' : 'text-slate-500')}>
            {branch === 'thenActions' ? 'THEN' : 'ELSE'}
          </span>
          {actions
            .filter((a) => a.runWhen === 'ON_CONDITION')
            .map((action) => (
              <CheckboxChip
                key={action.id}
                checked={condition[branch].includes(action.id)}
                onChange={(checked) => toggle(branch, action.id, checked)}
              >
                {action.label}
              </CheckboxChip>
            ))}
        </div>
      ))}
    </div>
  );
};

const SCHEMA_TYPES: JsonSchemaType[] = ['string', 'number', 'integer', 'boolean', 'array', 'object'];

/** Edits top-level output fields; nested object shapes are edited in the JSON view. */
const OutputSchemaEditor = ({
  schema,
  error,
  onChange,
}: {
  schema: OutputSchemaNode;
  error?: string;
  onChange: (schema: OutputSchemaNode) => void;
}) => {
  const properties = schema?.properties ?? {};
  const entries = Object.entries(properties);

  const rebuild = (nextEntries: Array<[string, OutputSchemaNode]>) =>
    onChange({
      type: 'object',
      properties: Object.fromEntries(nextEntries),
      required: nextEntries.map(([key]) => key),
    });

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-700">Output schema — structured JSON the model must return</p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(([key, node], index) => {
              const isNested = node.type === 'object' || (node.type === 'array' && node.items?.type === 'object');
              return (
                <tr key={index}>
                  <td className="px-3 py-1.5">
                    <input
                      aria-label="Field name"
                      className={cn(inputClass, 'py-1.5')}
                      value={key}
                      onChange={(event) => {
                        const next = [...entries];
                        next[index] = [event.target.value, node];
                        rebuild(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {isNested ? (
                      <span className="text-xs text-slate-500">
                        {node.type === 'object' ? 'object' : 'list of objects'} · edit in JSON
                      </span>
                    ) : (
                      <select
                        aria-label="Field type"
                        className={cn(inputClass, 'py-1.5')}
                        value={node.type === 'array' ? `array:${node.items?.type ?? 'string'}` : node.type}
                        onChange={(event) => {
                          const value = event.target.value;
                          const nextNode: OutputSchemaNode = value.startsWith('array:')
                            ? { type: 'array', description: node.description, items: { type: value.split(':')[1] as JsonSchemaType } }
                            : { type: value as JsonSchemaType, description: node.description };
                          const next = [...entries];
                          next[index] = [key, nextNode];
                          rebuild(next);
                        }}
                      >
                        {SCHEMA_TYPES.filter((t) => t !== 'array' && t !== 'object').map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                        <option value="array:string">list of text</option>
                        <option value="array:number">list of numbers</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      aria-label="Field description"
                      className={cn(inputClass, 'py-1.5')}
                      value={node.description ?? ''}
                      onChange={(event) => {
                        const next = [...entries];
                        next[index] = [key, { ...node, description: event.target.value }];
                        rebuild(next);
                      }}
                    />
                  </td>
                  <td className="px-2">
                    <Button variant="ghost" size="icon" aria-label={`Remove field ${key}`} onClick={() => rebuild(entries.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <Button
        className="mt-2"
        variant="outline"
        size="sm"
        onClick={() => rebuild([...entries, [`field_${entries.length + 1}`, { type: 'string', description: '' }]])}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add output field
      </Button>
    </div>
  );
};
