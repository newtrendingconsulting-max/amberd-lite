'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LayoutTemplate } from 'lucide-react';
import { findCatalogModel } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi } from '@/lib/amberd-api';
import { Loading, PageShell, StatusBadge, WithOrganization, DemoBadge } from '@/components/amberd/ui';

const Templates = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['amberd', organizationId, 'templates'],
    queryFn: () => amberdApi.templates(organizationId),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {data.map((template) => (
        <article key={template.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <LayoutTemplate className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">{template.name}</h2>
                <p className="text-xs text-slate-500">{template.department}</p>
              </div>
            </div>
            {template.maturity === 'WORKING' ? (
              <StatusBadge status="WORKING" />
            ) : (
              <DemoBadge>Configuration example</DemoBadge>
            )}
          </div>
          <p className="mt-3 flex-1 text-sm text-slate-600">{template.summary}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-slate-500">Model</dt>
              <dd className="font-medium">{findCatalogModel(template.definition.llm.model)?.displayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Conditions</dt>
              <dd className="font-medium">{template.definition.conditions.length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Actions</dt>
              <dd className="font-medium">{template.definition.actions.length}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">
              {template.maturity === 'WORKING'
                ? 'Creates a fully working agent'
                : 'Valid, runnable configuration — illustrative use case'}
            </span>
            <Button size="sm" asChild>
              <Link href={`/agents/new?template=${template.id}`}>
                Use template <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
};

export default function TemplatesPage() {
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Templates' }]}
      title="Agent Templates"
      description="Start from a pre-built configuration. Every template opens in the Agent Builder so you can adjust it before saving."
    >
      <WithOrganization>{(organizationId) => <Templates organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
