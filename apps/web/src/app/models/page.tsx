'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MODEL_CATEGORY_LABELS, ModelCategory } from '@app-starter/shared';
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
} from '@/components/amberd/ui';

const CATEGORY_ORDER: ModelCategory[] = ['FOUNDATION', 'OPEN_SOURCE', 'OPEN_WEIGHT', 'CUSTOM'];

const Models = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'models'],
    queryFn: () => amberdApi.models(organizationId),
  });
  if (isLoading || !data) return <Loading />;
  const isAnthropicReady = data.some((m) => m.provider === 'anthropic' && m.isConfigured);

  return (
    <div className="space-y-5">
      {isAnthropicReady ? (
        <Notice>
          Anthropic is connected. The API key lives only in the server environment and is never sent to the browser
          or to agents.
        </Notice>
      ) : (
        <Notice tone="warn">
          <p className="font-medium">No LLM provider is configured.</p>
          <p className="mt-1">
            Add <code>ANTHROPIC_API_KEY</code> to <code>apps/api/.env</code> on the server (never in the browser) and
            restart the API. Until then, runs fail with a recorded error — no results are simulated.
          </p>
        </Notice>
      )}
      {CATEGORY_ORDER.map((category) => {
        const rows = data.filter((m) => m.category === category);
        if (!rows.length) return null;
        return (
          <Panel key={category} title={MODEL_CATEGORY_LABELS[category]} bodyClassName="p-0">
            <DataTable headers={['Model', 'Provider', 'Availability', 'Configuration', 'Price (in / out per 1M tokens)', 'Connected agents']}>
              {rows.map((model) => (
                <tr key={model.model}>
                  <Td>
                    <span className="font-medium text-slate-900">{model.displayName}</span>
                    <span className="block font-mono text-xs text-slate-400">{model.model}</span>
                  </Td>
                  <Td>{model.providerName}</Td>
                  <Td><StatusBadge status={model.availability} /></Td>
                  <Td className="text-xs text-slate-600">
                    {model.availability === 'AVAILABLE'
                      ? 'API key configured (server-side)'
                      : model.availability === 'NOT_CONFIGURED'
                        ? 'Integrated — API key missing'
                        : 'No client in this hackathon build'}
                  </Td>
                  <Td className="tabular-nums">
                    {model.inputPricePerMTok === null ? 'N/A' : `$${model.inputPricePerMTok} / $${model.outputPricePerMTok}`}
                  </Td>
                  <Td>
                    {model.connectedAgents.length
                      ? model.connectedAgents.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && ', '}
                            <Link href={`/agents/${a.id}`} className="text-blue-600 hover:underline">
                              {a.name}
                            </Link>
                          </span>
                        ))
                      : '—'}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        );
      })}
      <p className="text-xs text-slate-500">
        Prices are Anthropic&apos;s published list prices and are used to estimate run cost. Providers without a client
        show N/A rather than an invented price.
      </p>
    </div>
  );
};

export default function ModelsPage() {
  return (
    <PageShell
      section="Infrastructure"
      crumbs={[{ label: 'LLM Models' }]}
      title="LLM Models"
      description="Foundation, open-source, open-weight, and your own models. Each agent selects its own."
    >
      <WithOrganization>{(organizationId) => <Models organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
