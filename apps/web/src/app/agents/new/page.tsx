'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createBlankAgentDefinition } from '@app-starter/shared';
import { amberdApi } from '@/lib/amberd-api';
import { AgentBuilder } from '@/components/amberd/AgentBuilder';
import { Loading, PageShell, WithOrganization } from '@/components/amberd/ui';

const NewAgent = ({ organizationId }: { organizationId: string }) => {
  const templateId = useSearchParams()?.get('template');
  const { data: connections, isLoading: isLoadingConnections } = useQuery({
    queryKey: ['amberd', organizationId, 'connections'],
    queryFn: () => amberdApi.connections(organizationId),
  });
  const { data: templates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['amberd', organizationId, 'templates'],
    queryFn: () => amberdApi.templates(organizationId),
    enabled: Boolean(templateId),
  });

  if (isLoadingConnections || (templateId && isLoadingTemplates)) return <Loading />;

  const template = templates?.find((t) => t.id === templateId);
  const repository = connections?.find((c) => c.status === 'CONNECTED');
  const initial = template
    ? {
        ...template.definition,
        identity: {
          ...template.definition.identity,
          // A fresh agent from a template starts as a draft with its own key.
          agentKey: `${template.definition.identity.agentKey}-${Date.now().toString(36).slice(-4)}`,
          status: 'DRAFT' as const,
        },
      }
    : createBlankAgentDefinition(repository?.id ?? '');

  return <AgentBuilder key={templateId ?? 'blank'} organizationId={organizationId} initial={initial} />;
};

export default function NewAgentPage() {
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Create agent' }]}
      title="Create agent"
      description="Configure a new agent with the no-code builder, or switch to JSON. Both edit the same validated definition."
    >
      <WithOrganization>
        {(organizationId) => (
          <Suspense fallback={<Loading />}>
            <NewAgent organizationId={organizationId} />
          </Suspense>
        )}
      </WithOrganization>
    </PageShell>
  );
}
