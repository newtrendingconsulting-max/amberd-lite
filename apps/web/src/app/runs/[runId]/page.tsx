'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, CircleDot, Download, ExternalLink, Loader2, Mail, ShieldCheck, XCircle } from 'lucide-react';
import { CONDITION_OPERATOR_LABELS, RunDetail, findCatalogModel } from '@app-starter/shared';
import { Button } from '@/components/ui/button';
import { amberdApi, errorMessage } from '@/lib/amberd-api';
import { inputClass } from '@/components/amberd/builder-fields';
import {
  Loading,
  Notice,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
  WithOrganization,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatUsd,
  shortId,
} from '@/components/amberd/ui';
import { cn } from '@/lib/utils';

const ReportRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-slate-900">{children}</dd>
  </div>
);

const AuditReport = ({ report }: { report: Record<string, unknown> }) => {
  const isFlagged = report.auditStatus === 'FLAGGED';
  const amount = Number(report.discrepancyAmount ?? 0);
  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex items-center gap-4 rounded-xl border p-4',
          isFlagged ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50',
        )}
      >
        {isFlagged ? (
          <AlertTriangle className="h-8 w-8 flex-shrink-0 text-amber-600" aria-hidden />
        ) : (
          <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-emerald-600" aria-hidden />
        )}
        <div className="flex-1">
          <p className={cn('text-lg font-semibold', isFlagged ? 'text-amber-900' : 'text-emerald-900')}>
            {isFlagged
              ? `${formatMoney(amount)} ${report.discrepancyDirection === 'UNDERBILLED' ? 'underbilling' : 'overbilling'} detected`
              : 'Invoice matches purchase order'}
          </p>
          <p className={cn('text-sm', isFlagged ? 'text-amber-800' : 'text-emerald-800')}>
            {String(report.discrepancyExplanation ?? '')}
          </p>
        </div>
        <StatusBadge status={String(report.auditStatus)} className="text-sm" />
      </div>
      <dl>
        <ReportRow label="Purchase order">{String(report.purchaseOrderId)}</ReportRow>
        <ReportRow label="Invoice">{String(report.invoiceId)}</ReportRow>
        <ReportRow label="Supplier">{String(report.supplier)}</ReportRow>
        <ReportRow label="Matched items">{(report.matchedItems as string[] | undefined)?.join(', ') || 'None'}</ReportRow>
        <ReportRow label="Quantity comparison">{String(report.quantityComparison)}</ReportRow>
        <ReportRow label="Unit price comparison">{String(report.unitPriceComparison)}</ReportRow>
        <ReportRow label="Purchase order total">
          <span className="tabular-nums">{formatMoney(Number(report.purchaseOrderTotal))}</span>
        </ReportRow>
        <ReportRow label="Invoice total">
          <span className="tabular-nums">{formatMoney(Number(report.invoiceTotal))}</span>
        </ReportRow>
        <ReportRow label="Discrepancy amount">
          <span className={cn('font-semibold tabular-nums', amount > 0 ? 'text-amber-700' : 'text-emerald-700')}>
            {formatMoney(amount)}
          </span>
        </ReportRow>
        <ReportRow label="Audit status"><StatusBadge status={String(report.auditStatus)} /></ReportRow>
        <ReportRow label="Recommended action">{String(report.recommendedAction)}</ReportRow>
        {Boolean(report.approvalRequired) && <ReportRow label="Approval required">Yes</ReportRow>}
      </dl>
      {Array.isArray(report.sourceDocuments) && report.sourceDocuments.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Source documents</p>
          <ul className="space-y-1 text-sm">
            {(report.sourceDocuments as Array<{ label: string; title: string; resourceId: string; sourceUrl: string | null }>).map((d) => (
              <li key={d.resourceId}>
                <span className="text-slate-500">{d.label}:</span>{' '}
                {d.sourceUrl ? (
                  <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                    {d.title} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium">{d.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(report.discrepancies) && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">
            Discrepancies ({(report.discrepancies as unknown[]).length}) — expected from the purchase order, actual from the invoice
          </p>
          {(report.discrepancies as unknown[]).length === 0 ? (
            <p className="text-sm text-emerald-700">None — every compared field matches.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Item / field</th>
                    <th className="px-3 py-2 font-medium">Expected</th>
                    <th className="px-3 py-2 font-medium">Actual</th>
                    <th className="px-3 py-2 font-medium">Impact</th>
                    <th className="px-3 py-2 font-medium">Sources</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(
                    report.discrepancies as Array<{
                      type: string;
                      item: string;
                      field: string;
                      expected: string;
                      actual: string;
                      amount_impact: number | null;
                      expected_source_name?: string;
                      actual_source_name?: string;
                    }>
                  ).map((d, i) => (
                    <tr key={`${d.type}-${d.item}-${i}`}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{d.item}</span>
                        <span className="block text-xs text-slate-500">{d.field}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{d.expected}</td>
                      <td className="px-3 py-2 font-medium tabular-nums text-amber-800">{d.actual}</td>
                      <td className="px-3 py-2 tabular-nums">{d.amount_impact === null ? 'terms' : formatMoney(d.amount_impact)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {d.expected_source_name ?? 'PO'} → {d.actual_source_name ?? 'invoice'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {Array.isArray(report.integrityWarnings) && report.integrityWarnings.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">Integrity checks</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {(report.integrityWarnings as string[]).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      {Array.isArray(report.modelObservations) && report.modelObservations.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Model observations</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {(report.modelObservations as string[]).map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Totals, differences, and the discrepancy are computed in backend code from the values the model extracted; the
        model is never given an expected answer.
      </p>
    </div>
  );
};

const DownloadReportButton = ({ organizationId, runId }: { organizationId: string; runId: string }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await amberdApi.downloadReport(organizationId, runId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setIsDownloading(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={handleDownload} disabled={isDownloading}>
      {isDownloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
      Download PDF
    </Button>
  );
};

/** Per-recipient delivery result for an email action, exactly as the mail server answered. */
const EmailDelivery = ({ detail }: { detail: Record<string, unknown> }) => {
  const deliveries = (detail.deliveries as Array<{ recipient: string; status: string; error?: string }> | undefined) ?? [];
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-slate-700">
        <Mail className="h-3.5 w-3.5" aria-hidden /> {String(detail.subject ?? 'Email')}
      </p>
      {detail.deliveredVia ? <p className="mt-0.5 text-slate-500">Via {String(detail.deliveredVia)}{detail.attachment ? ` · attached ${String(detail.attachment)}` : ''}</p> : null}
      {deliveries.length === 0 && detail.error ? <p className="mt-1 text-red-700">{String(detail.error)}</p> : null}
      <ul className="mt-1.5 space-y-1">
        {deliveries.map((d) => (
          <li key={d.recipient} className="flex items-center justify-between gap-2">
            <span>{d.recipient}</span>
            <span className="flex items-center gap-2">
              {d.error && <span className="text-red-700">{d.error}</span>}
              <StatusBadge status={d.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ApprovalControls = ({
  organizationId,
  run,
  actionId,
}: {
  organizationId: string;
  run: RunDetail;
  actionId: string;
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => amberdApi.decide(organizationId, run.id, actionId, decision, note || undefined),
    onSuccess: (_, decision) => {
      queryClient.invalidateQueries({ queryKey: ['amberd', organizationId] });
      toast.success(decision === 'APPROVE' ? 'Approved' : 'Rejected');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <label htmlFor="decision-note" className="block text-xs font-medium text-amber-900">
        Decision note (optional)
      </label>
      <input
        id="decision-note"
        className={inputClass}
        value={note}
        placeholder="e.g. Hold payment; supplier to reissue at PO price"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide.mutate('APPROVE')} disabled={decide.isPending}>
          {decide.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide.mutate('REJECT')} disabled={decide.isPending}>
          Reject
        </Button>
      </div>
      <p className="text-[11px] text-amber-800">Recorded in Amberd Lite only — no payment or financial system is changed.</p>
    </div>
  );
};

const RunView = ({ organizationId, runId }: { organizationId: string; runId: string }) => {
  const { data: run, isLoading, error } = useQuery({
    queryKey: ['amberd', organizationId, 'run', runId],
    queryFn: () => amberdApi.run(organizationId, runId),
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? 2000 : false),
  });
  if (isLoading) return <Loading />;
  if (error || !run) return <Notice tone="error">{errorMessage(error) || 'Run not found'}</Notice>;

  const isAudit = run.report && 'auditStatus' in run.report;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Status" value={<StatusBadge status={run.status} className="text-sm" />} />
        <StatCard label="Outcome" value={<StatusBadge status={run.outcome} className="text-sm" />} />
        <StatCard label="Duration" value={formatDuration(run.durationMs)} />
        <StatCard label="Model" value={<span className="text-base">{findCatalogModel(run.model ?? '')?.displayName ?? run.model}</span>} />
        <StatCard label="Tokens" value={formatNumber(run.inputTokens + run.outputTokens)} hint={`${run.inputTokens} in · ${run.outputTokens} out`} />
        <StatCard label="Est. cost" value={formatUsd(run.costUsd, 5)} />
      </div>

      {run.error && (
        <Notice tone="error">
          <p className="font-medium">Run failed — no result was produced</p>
          <p className="mt-0.5">{run.error}</p>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {run.report && (
            <Panel
              title={String(run.report.title ?? 'Report')}
              description={`Generated ${formatDateTime(String(run.report.generatedAt))}`}
              actions={<DownloadReportButton organizationId={organizationId} runId={run.id} />}
            >
              {isAudit ? (
                <AuditReport report={run.report} />
              ) : (
                <pre className="overflow-auto rounded-lg bg-slate-50 p-4 text-xs">{JSON.stringify(run.report, null, 2)}</pre>
              )}
            </Panel>
          )}

          <Panel title="Conditions evaluated" description="Evaluated in application code against validated results">
            {run.conditions.length === 0 ? (
              <p className="text-sm text-slate-500">{run.status === 'FAILED' ? 'Not reached.' : 'No conditions configured.'}</p>
            ) : (
              <ul className="space-y-3">
                {run.conditions.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', c.result ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                        {c.result ? 'TRUE' : 'FALSE'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-600">
                      {c.field} = {JSON.stringify(c.left)} {CONDITION_OPERATOR_LABELS[c.operator as keyof typeof CONDITION_OPERATOR_LABELS] ?? c.operator}{' '}
                      {JSON.stringify(c.right)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      → {c.result ? 'THEN' : 'ELSE'}: {c.actionsTriggered.join(', ') || 'no actions'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Actions generated">
            {run.actions.length === 0 ? (
              <p className="text-sm text-slate-500">No actions were generated.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {run.actions.map((action) => (
                  <li key={action.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{action.label}</p>
                        <p className="text-xs text-slate-500">{action.type.replace(/_/g, ' ').toLowerCase()}</p>
                      </div>
                      <StatusBadge status={action.status} />
                    </div>
                    {action.status === 'AWAITING_APPROVAL' && (
                      <ApprovalControls organizationId={organizationId} run={run} actionId={action.id} />
                    )}
                    {action.type === 'SEND_EMAIL' && <EmailDelivery detail={action.detail} />}
                    {action.decidedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Decided {formatDateTime(action.decidedAt)}
                        {action.decisionNote ? ` — “${action.decisionNote}”` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {run.extracted && (
            <Panel title="Extracted results (model output, schema-validated)">
              <pre className="max-h-96 overflow-auto rounded-lg bg-[#0b1733] p-4 font-mono text-xs leading-relaxed text-slate-100">
                {JSON.stringify(run.extracted, null, 2)}
              </pre>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Execution timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {run.timeline.map((step, index) => (
                <li key={`${step.step}-${index}`} className="relative">
                  <span className="absolute -left-[27px] top-0.5 rounded-full bg-white">
                    {step.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : step.status === 'failed' ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <CircleDot className="h-4 w-4 text-slate-400" />
                    )}
                  </span>
                  <p className="text-sm font-medium text-slate-800">{step.step}</p>
                  {step.detail && <p className="break-words text-xs text-slate-500">{step.detail}</p>}
                  <p className="text-[10px] text-slate-400">{new Date(step.at).toLocaleTimeString()}</p>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Inputs & data">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Connection</dt>
                <dd>{run.connection ? run.connection.name : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Documents retrieved</dt>
                <dd>
                  {run.documents.length ? (
                    <ul className="space-y-0.5">
                      {run.documents.map((d) => (
                        <li key={d.resourceId} className="font-mono text-xs">
                          {d.resourceId} <span className="text-slate-400">({d.characters} chars)</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'None'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Variables</dt>
                <dd>
                  <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{JSON.stringify(run.inputs, null, 2)}</pre>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Trigger</dt>
                <dd>{run.triggerType.toLowerCase()} · started {formatDateTime(run.startedAt)}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  return (
    <WithOrganization>
      {(organizationId) => <RunPageInner organizationId={organizationId} runId={runId} />}
    </WithOrganization>
  );
}

const RunPageInner = ({ organizationId, runId }: { organizationId: string; runId: string }) => {
  const { data: run } = useQuery({
    queryKey: ['amberd', organizationId, 'run', runId],
    queryFn: () => amberdApi.run(organizationId, runId),
  });
  return (
    <PageShell
      section="Operations"
      crumbs={[{ label: 'Runs', href: '/runs' }, { label: shortId(runId) }]}
      title={run ? `${run.agentName} · run ${shortId(runId)}` : 'Run'}
      description={
        run ? (
          <>
            {run.department} ·{' '}
            <Link className="text-blue-600 hover:underline" href={`/agents/${run.agentId}`}>
              view agent
            </Link>
          </>
        ) : undefined
      }
    >
      <RunView organizationId={organizationId} runId={runId} />
    </PageShell>
  );
};
