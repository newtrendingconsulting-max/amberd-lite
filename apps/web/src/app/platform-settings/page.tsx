'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { amberdApi } from '@/lib/amberd-api';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { DemoBadge, PageShell, Panel, StatusBadge, WithOrganization } from '@/components/amberd/ui';

const CAPABILITIES: Array<[string, 'ACTIVE' | 'CONFIGURATION_ONLY' | 'DEMO', string]> = [
  ['Agent builder, JSON definitions, import/export', 'ACTIVE', 'Validated by one shared schema on client and server'],
  ['Execution engine (manual & API triggers)', 'ACTIVE', 'Real model calls, deterministic checks, persisted runs'],
  ['Local Enterprise Document Connector', 'ACTIVE', 'Simulated enterprise repository with server-side permissions'],
  ['Conditions, actions, human approval', 'ACTIVE', 'Evaluated in backend code; approvals recorded in Amberd Lite'],
  ['Governance: concurrency, timeout, spend caps', 'ACTIVE', 'Enforced on every run'],
  ['Notifications', 'ACTIVE', 'In-app via the platform notification engine'],
  ['Scheduled & continuous triggers', 'CONFIGURATION_ONLY', 'Saved; no scheduler running in this build'],
  ['Google Drive, databases, APIs, object storage', 'CONFIGURATION_ONLY', 'Connector interface ready; not configured'],
  ['GPU infrastructure & priority scheduling', 'DEMO', 'Illustrative data only'],
];

const Settings = ({ organizationId }: { organizationId: string }) => {
  const { organization } = useActiveOrganization();
  const { data: models } = useQuery({
    queryKey: ['amberd', organizationId, 'models'],
    queryFn: () => amberdApi.models(organizationId),
  });
  const isLlmReady = models?.some((m) => m.provider === 'anthropic' && m.isConfigured);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Workspace" className="lg:col-span-1">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Organization</dt>
            <dd className="font-medium">{organization?.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">LLM provider</dt>
            <dd><StatusBadge status={isLlmReady ? 'AVAILABLE' : 'NOT_CONFIGURED'} /> Anthropic</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Secrets</dt>
            <dd className="text-slate-600">Server environment variables only — never stored in agent definitions or sent to the browser.</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <Link className="text-blue-600 hover:underline" href={`/organizations/${organizationId}/settings`}>Organization settings & members</Link>
          <Link className="text-blue-600 hover:underline" href="/settings">Your account settings</Link>
          <Link className="text-blue-600 hover:underline" href="/policies">Resource policies</Link>
        </div>
      </Panel>
      <Panel title="Platform capabilities in this build" description="What is real and what is illustrative in the Hackathon Demo" className="lg:col-span-2">
        <ul className="divide-y divide-slate-100">
          {CAPABILITIES.map(([name, status, note]) => (
            <li key={name} className="flex items-start justify-between gap-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{name}</p>
                <p className="text-xs text-slate-500">{note}</p>
              </div>
              {status === 'DEMO' ? <DemoBadge>Illustrative</DemoBadge> : <StatusBadge status={status} />}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Amberd Lite Hackathon Demo. Not a production deployment; no security certification is claimed.
        </p>
      </Panel>
    </div>
  );
};

export default function PlatformSettingsPage() {
  return (
    <PageShell section="Admin" crumbs={[{ label: 'Settings' }]} title="Settings" description="Workspace configuration and platform status.">
      <WithOrganization>{(organizationId) => <Settings organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
