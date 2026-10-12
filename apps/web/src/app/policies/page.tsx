'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { PRIORITY_TIER_LABELS, PRIORITY_TIERS, ResourcePolicyView } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
import { NumberInput, SelectInput } from '@/components/amberd/builder-fields';
import {
  DemoBadge,
  Loading,
  Notice,
  PageShell,
  Panel,
  StatusBadge,
  WithOrganization,
  formatDateTime,
} from '@/components/amberd/ui';

const ENFORCEMENT = [
  ['Maximum concurrent agent runs', 'ENFORCED', 'Checked before every run; excess runs are rejected (HTTP 429).'],
  ['Maximum agents per data source', 'ENFORCED', 'Checked when an agent is created or saved.'],
  ['Rolling AI spend cap', 'ENFORCED', 'Runs are blocked once estimated spend in the window reaches the cap.'],
  ['Execution timeout', 'ENFORCED', 'Model calls are aborted after the lower of the agent and policy timeout.'],
  ['Priority tier', 'CONFIGURATION_ONLY', 'Recorded for scheduling; no GPU scheduler is connected in this build.'],
] as const;

const PolicyForm = ({ organizationId, policy }: { organizationId: string; policy: ResourcePolicyView }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(policy);
  useEffect(() => setDraft(policy), [policy]);

  const save = useMutation({
    mutationFn: () =>
      amberdApi.updatePolicy(organizationId, {
        maxConcurrentRuns: draft.maxConcurrentRuns,
        maxConnectionsPerSource: draft.maxConnectionsPerSource,
        spendCapUsd: draft.spendCapUsd,
        spendWindowDays: draft.spendWindowDays,
        timeoutSeconds: draft.timeoutSeconds,
        defaultPriorityTier: draft.defaultPriorityTier,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      toast.success('Resource policy saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = <K extends keyof ResourcePolicyView>(key: K, value: ResourcePolicyView[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title="Organization resource policy"
        description={`Applies to every agent in addition to its own limits · updated ${formatDateTime(policy.updatedAt)}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="Maximum concurrent agent runs" value={draft.maxConcurrentRuns} min={1} onChange={(v) => set('maxConcurrentRuns', v)} hint={<StatusBadge status="ENFORCED" />} />
          <NumberInput label="Maximum agents per data source" value={draft.maxConnectionsPerSource} min={1} onChange={(v) => set('maxConnectionsPerSource', v)} hint={<StatusBadge status="ENFORCED" />} />
          <NumberInput label="Rolling AI spend cap (USD)" value={draft.spendCapUsd} min={0} step={1} onChange={(v) => set('spendCapUsd', v)} hint={<StatusBadge status="ENFORCED" />} />
          <NumberInput label="Spend window (days)" value={draft.spendWindowDays} min={1} onChange={(v) => set('spendWindowDays', v)} />
          <NumberInput label="Execution timeout (seconds)" value={draft.timeoutSeconds} min={10} onChange={(v) => set('timeoutSeconds', v)} hint={<StatusBadge status="ENFORCED" />} />
          <SelectInput
            label="Default priority tier"
            value={draft.defaultPriorityTier}
            options={PRIORITY_TIERS.map((t) => ({ value: t, label: PRIORITY_TIER_LABELS[t] }))}
            onChange={(v) => set('defaultPriorityTier', v)}
            hint={<DemoBadge>Configuration only</DemoBadge>}
          />
        </div>
        <div className="mt-6">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save policy
          </Button>
          <span className="ml-3 text-xs text-slate-500">Owners and admins only.</span>
        </div>
      </Panel>
      <Panel title="What is enforced">
        <ul className="space-y-3">
          {ENFORCEMENT.map(([name, status, note]) => (
            <li key={name}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{name}</span>
                <StatusBadge status={status} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{note}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
};

const Policies = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'policy'],
    queryFn: () => amberdApi.policy(organizationId),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="space-y-5">
      <Notice>
        &quot;Enforced&quot; means the execution engine checks the limit in backend code on every run. Settings marked
        &quot;Configuration only&quot; are saved but not yet acted on.
      </Notice>
      <PolicyForm organizationId={organizationId} policy={data} />
    </div>
  );
};

export default function PoliciesPage() {
  return (
    <PageShell
      section="Governance"
      crumbs={[{ label: 'Resource Policies' }]}
      title="Resource Policies"
      description="Guardrails on concurrency, data access, spend, and execution time."
    >
      <WithOrganization>{(organizationId) => <Policies organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
