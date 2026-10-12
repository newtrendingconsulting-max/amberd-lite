'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Cloud, Database, FileText, FolderLock, Globe, HardDrive, Lock } from 'lucide-react';
import { ConnectionView } from '@app-starter/shared';
import { GoogleDriveCard } from '@/components/amberd/GoogleDriveCard';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
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

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Databases: Database,
  APIs: Globe,
  Storage: HardDrive,
  'Google Drive': Cloud,
};

const ResourceBrowser = ({ organizationId, connection }: { organizationId: string; connection: ConnectionView }) => {
  const [collection, setCollection] = useState(connection.authorizedResources[0] ?? '');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [probe, setProbe] = useState<string | null>(null);

  const { data: resources, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'resources', connection.id, collection],
    queryFn: () => amberdApi.resources(organizationId, connection.id, collection),
    enabled: Boolean(collection),
  });
  const { data: preview } = useQuery({
    queryKey: ['amberd', organizationId, 'preview', connection.id, previewId],
    queryFn: () => amberdApi.previewResource(organizationId, connection.id, previewId!),
    enabled: Boolean(previewId),
  });

  const handleProbe = async () => {
    try {
      await amberdApi.resources(organizationId, connection.id, 'hr-confidential');
      setProbe('Unexpected: access was allowed');
    } catch (error) {
      setProbe(errorMessage(error));
    }
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {connection.authorizedResources.map((resource) => (
            <button
              key={resource}
              onClick={() => {
                setCollection(resource);
                setPreviewId(null);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                collection === resource ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {resource}/
            </button>
          ))}
        </div>
        {isLoading ? (
          <Loading />
        ) : (
          <ul className="space-y-1">
            {resources?.map((resource) => (
              <li key={resource.id}>
                <button
                  onClick={() => setPreviewId(resource.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                    previewId === resource.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <FileText className="h-4 w-4 flex-shrink-0" aria-hidden />
                  <span className="truncate">{resource.documentId}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{resource.sizeBytes} B</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <FolderLock className="h-3.5 w-3.5" /> Permission check
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <code>hr-confidential/</code> exists in the repository but is not authorized for this connection.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={handleProbe}>
            Try to list hr-confidential/
          </Button>
          {probe && <p className="mt-2 text-xs text-red-700">🔒 {probe}</p>}
        </div>
      </div>
      <div className="min-h-[200px] rounded-lg border border-slate-200 bg-slate-50">
        {preview ? (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-slate-800">
            {preview.content}
          </pre>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">Select a document to preview its contents.</p>
        )}
      </div>
    </div>
  );
};

/** Shows the result of the Google sign-in redirect once, then cleans the URL. */
const OAuthResult = () => {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const connected = params?.get('drive');
    const failure = params?.get('drive_error');
    if (connected === 'connected') toast.success('Google Drive connected. Now choose the folders agents may read.');
    if (failure) toast.error(`Google Drive connection failed: ${failure}`, { duration: 10_000 });
    if (connected || failure) router.replace('/connections');
  }, [params, router]);
  return null;
};

const PLANNED_CONNECTORS = [
  ['Snowflake', 'Databases', 'Key-pair or OAuth authentication to a Snowflake warehouse.'],
  ['Databricks', 'Databases', 'OAuth / personal access token to Databricks SQL warehouses.'],
  ['Salesforce', 'APIs', 'OAuth 2.0 connected app for Salesforce objects.'],
] as const;

const Connections = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'connections'],
    queryFn: () => amberdApi.connections(organizationId),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-5">
      <Notice>
        Agents reach enterprise data only through connectors. Google Drive uses real Google sign-in; the Finance
        Document Repository is a local sample folder kept for offline testing. Permissions are checked server-side
        before any data is read. OAuth client secrets stay in server environment variables, Drive tokens are
        encrypted at rest, and the model only ever sees the content of authorized documents.
      </Notice>
      {data.map((connection) => {
        if (connection.type === 'GOOGLE_DRIVE') {
          return <GoogleDriveCard key={connection.id} organizationId={organizationId} connection={connection} />;
        }
        const Icon = CATEGORY_ICONS[connection.category] ?? HardDrive;
        const isOpen = openId === connection.id;
        const semanticLayer = connection.type === 'DATABASE';
        return (
          <Panel key={connection.id} bodyClassName="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{connection.name}</h2>
                    <StatusBadge status={connection.status} />
                    {connection.isSimulated && <DemoBadge>Simulated enterprise integration</DemoBadge>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{connection.description}</p>
                </div>
              </div>
              {connection.status === 'CONNECTED' && (
                <Button size="sm" variant="outline" onClick={() => setOpenId(isOpen ? null : connection.id)}>
                  {isOpen ? 'Hide resources' : 'Browse resources'}
                </Button>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
              <div>
                <dt className="text-xs text-slate-500">Type</dt>
                <dd>{connection.category} · {connection.type.toLowerCase().replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Authorized resources</dt>
                <dd>{connection.authorizedResources.length ? connection.authorizedResources.map((r) => `${r}/`).join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Permissions</dt>
                <dd className="flex items-center gap-1">
                  <Lock className="h-3 w-3 text-slate-400" />
                  {connection.permissions.length ? connection.permissions.join(', ') + ' (read-only)' : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Connected agents</dt>
                <dd>
                  {connection.connectedAgents.length
                    ? connection.connectedAgents.map((a, i) => (
                        <span key={a.id}>
                          {i > 0 && ', '}
                          <Link className="text-blue-600 hover:underline" href={`/agents/${a.id}`}>
                            {a.name}
                          </Link>
                        </span>
                      ))
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last activity</dt>
                <dd>{formatDateTime(connection.lastActivityAt)}</dd>
              </div>
            </dl>
            {semanticLayer && (
              <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Optional YAML semantic layer (example) <DemoBadge>Not active</DemoBadge>
                </summary>
                <p className="mt-2 text-xs text-slate-500">
                  Database connectors can be governed by a semantic layer describing datasets, allowed and restricted
                  fields, and business rules. It is optional — agents are created in the UI or JSON without it.
                </p>
                <pre className="mt-2 overflow-auto rounded bg-[#0b1733] p-3 font-mono text-xs text-slate-100">
                  {`# accounts_payable.semantic.yaml\ndataset: accounts_payable\nbusiness_name: Accounts Payable Ledger\nfields:\n  - name: invoice_number\n    type: string\n    allowed: true\n  - name: amount_usd\n    type: decimal\n    allowed: true\n  - name: supplier_bank_account\n    type: string\n    allowed: false   # restricted — never sent to models\noperations: [select, aggregate]\nrules:\n  - Only rows for the caller's organization are visible`}
                </pre>
              </details>
            )}
            {isOpen && <ResourceBrowser organizationId={organizationId} connection={connection} />}
          </Panel>
        );
      })}
      <Panel title="More connectors" description="Not available in this build — listed so you can see what is planned. None of these is functional yet.">
        <ul className="divide-y divide-slate-100">
          {PLANNED_CONNECTORS.map(([name, category, note]) => (
            <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <span className="font-medium text-slate-800">{name}</span>{' '}
                <span className="text-xs text-slate-500">· {category}</span>
                <span className="block text-xs text-slate-500">{note}</span>
              </span>
              <StatusBadge status="NOT_AVAILABLE" />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
};

export default function ConnectionsPage() {
  return (
    <PageShell
      section="Infrastructure"
      crumbs={[{ label: 'Data Connections' }]}
      title="Data Connections"
      description="Databases, APIs, storage, and Google Drive — governed access to enterprise data for every agent."
    >
      <Suspense fallback={null}>
        <OAuthResult />
      </Suspense>
      <WithOrganization>{(organizationId) => <Connections organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
