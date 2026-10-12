'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cloud, FilePlus2, FileText, Loader2, LogOut, ShieldCheck, Unplug, X } from 'lucide-react';
import { ConnectionView } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
import { openGooglePicker } from '@/lib/google-picker';
import { Notice, Panel, StatusBadge, formatDateTime } from '@/components/amberd/ui';

const SELECTED_FILES = 'selected-files';

/**
 * Google Drive connection, file-scoped: Google sign-in with the `drive.file`
 * permission, then Google Picker to choose the exact files Amberd Lite may read.
 */
export const GoogleDriveCard = ({ organizationId, connection }: { organizationId: string; connection: ConnectionView }) => {
  const queryClient = useQueryClient();
  const isConnected = connection.status === 'CONNECTED';
  const files = connection.authorizedResources
    .filter((id) => id !== SELECTED_FILES)
    .map((id) => ({ id, name: connection.resourceNames[id]?.name ?? id }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });

  const connect = useMutation({
    mutationFn: () => amberdApi.driveAuthorizeUrl(organizationId, connection.id),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const saveFiles = useMutation({
    mutationFn: (next: Array<{ id: string; name: string }>) =>
      amberdApi.driveSetResources(
        organizationId,
        connection.id,
        next.map((f) => ({ ...f, type: 'file' as const })),
      ),
    onSuccess: () => {
      refresh();
      toast.success('Selected files saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pick = useMutation({
    mutationFn: async () => {
      const session = await amberdApi.drivePickerSession(organizationId, connection.id);
      return openGooglePicker(session);
    },
    onSuccess: (picked) => {
      if (!picked?.length) return;
      const merged = new Map(files.map((f) => [f.id, f]));
      picked.forEach((f) => merged.set(f.id, { id: f.id, name: f.name }));
      saveFiles.mutate(Array.from(merged.values()));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const disconnect = useMutation({
    mutationFn: () => amberdApi.driveDisconnect(organizationId, connection.id),
    onSuccess: () => {
      refresh();
      toast.success('Google Drive disconnected and Amberd Lite’s access revoked');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Panel bodyClassName="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <Cloud className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Google Drive</h2>
              <StatusBadge status={connection.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {isConnected
                ? `Signed in as ${connection.accountEmail}`
                : 'Read the specific PDF, Excel, CSV, Google Sheets or Docs files you choose.'}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Selected files only (drive.file) — Amberd Lite cannot see anything else in your Drive.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button size="sm" onClick={() => pick.mutate()} disabled={pick.isPending || saveFiles.isPending}>
                {pick.isPending || saveFiles.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus2 className="mr-1.5 h-4 w-4" />
                )}
                Select files from Google Drive
              </Button>
              <Button size="sm" variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>
                <LogOut className="mr-1.5 h-4 w-4" /> Reconnect
              </Button>
              <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                <Unplug className="mr-1.5 h-4 w-4" /> Disconnect & revoke
              </Button>
            </>
          ) : (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending || !connection.isOAuthConfigured}>
              {connect.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Cloud className="mr-1.5 h-4 w-4" />}
              Connect Google Drive
            </Button>
          )}
        </div>
      </div>

      {!connection.isOAuthConfigured && (
        <div className="mt-4">
          <Notice tone="warn">
            Google Drive is not configured on this server yet. An administrator must add a Google OAuth client and a
            Google Picker API key to the API environment.
          </Notice>
        </div>
      )}

      {isConnected && (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr]">
          <div>
            <p className="text-xs text-slate-500">Files Amberd Lite may read ({files.length})</p>
            {files.length ? (
              <ul className="mt-1.5 space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-slate-400" aria-hidden />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      aria-label={`Remove ${f.name} from Amberd Lite's access`}
                      onClick={() => saveFiles.mutate(files.filter((x) => x.id !== f.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-amber-700">
                No files selected yet. Click “Select files from Google Drive” — you can also upload the demo files from
                your computer in the Picker’s Upload tab.
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500">Connected agents</p>
            <p className="mt-1.5 text-sm">
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
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Last activity</p>
            <p className="mt-1.5 text-sm">{formatDateTime(connection.lastActivityAt)}</p>
          </div>
        </div>
      )}
    </Panel>
  );
};
