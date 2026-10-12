'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { organizationsApi } from '@/lib/organizations-api';
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

const ROLE_RIGHTS: Record<string, string> = {
  OWNER: 'Everything, including approvals, policies, and agent activation',
  ADMIN: 'Approvals, policies, agent activation, members',
  MEMBER: 'Create, edit, and run agents; view runs and costs',
};

const Members = ({ organizationId }: { organizationId: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['organization-users', organizationId],
    queryFn: () => organizationsApi.getOrganizationUsers(organizationId),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="space-y-5">
      <Notice>
        Users, roles, and invites use the platform&apos;s organization management. Every Amberd Lite API call checks the
        caller&apos;s role in this organization on the server.
      </Notice>
      <Panel
        bodyClassName="p-0"
        title={`${data.total} user${data.total === 1 ? '' : 's'}`}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href={`/organizations/${organizationId}/settings`}>Manage members & invites</Link>
          </Button>
        }
      >
        <DataTable headers={['Name', 'Email', 'Role', 'Permissions', 'Last login']}>
          {data.users.map((member) => (
            <tr key={member.id}>
              <Td className="font-medium text-slate-900">{member.user.name ?? '—'}</Td>
              <Td>{member.user.email}</Td>
              <Td><StatusBadge status={member.role} /></Td>
              <Td className="text-xs text-slate-500">{ROLE_RIGHTS[member.role]}</Td>
              <Td>{formatDateTime(member.user.lastLoginAt)}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
};

export default function MembersPage() {
  return (
    <PageShell section="Admin" crumbs={[{ label: 'Users' }]} title="Users" description="Who can build, run, and approve agents in this organization.">
      <WithOrganization>{(organizationId) => <Members organizationId={organizationId} />}</WithOrganization>
    </PageShell>
  );
}
