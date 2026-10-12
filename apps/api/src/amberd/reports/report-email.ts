const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const usd = (value: unknown): string =>
  typeof value === 'number'
    ? `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

interface Discrepancy {
  item: string;
  field: string;
  expected: string;
  actual: string;
  amount_impact: number | null;
}

/** Subject, HTML, and text bodies for an emailed report. Values are escaped. */
export const buildReportEmail = (
  report: Record<string, unknown>,
  runUrl: string,
): { subject: string; html: string; text: string } => {
  const isAudit = 'auditStatus' in report;
  const isFlagged = report.auditStatus === 'FLAGGED';
  const discrepancies = (report.discrepancies as Discrepancy[] | undefined) ?? [];
  const sources = (report.sourceDocuments as Array<{ label: string; title: string }> | undefined) ?? [];

  const headline = isAudit
    ? isFlagged
      ? `${usd(report.discrepancyAmount)} discrepancy on ${report.invoiceId} vs ${report.purchaseOrderId}`
      : `${report.invoiceId} matches ${report.purchaseOrderId} — audit passed`
    : `${report.agent} finished: ${report.outcome}`;
  const subject = `[Amberd Lite] ${headline}`;

  const rows = discrepancies
    .map(
      (d, i) =>
        `<tr><td style="padding:6px;border-bottom:1px solid #e2e8f0">${i + 1}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0">${escapeHtml(d.item)} — ${escapeHtml(d.field)}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0">${escapeHtml(d.expected)}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0">${escapeHtml(d.actual)}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0">${d.amount_impact === null ? 'terms' : usd(d.amount_impact)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:680px;margin:0 auto">
<div style="background:#0b1733;color:#fff;padding:16px 20px"><strong style="font-size:18px">Amberd Lite</strong><br><span style="color:#93c5fd;font-size:12px">AI Agent Control Platform</span></div>
<div style="padding:20px">
<h2 style="margin:0 0 8px">${escapeHtml(report.title)}</h2>
<p style="margin:0 0 16px;padding:12px;background:${isFlagged ? '#fffbeb' : '#ecfdf5'};color:${isFlagged ? '#92400e' : '#065f46'};font-weight:bold">${escapeHtml(headline)}</p>
${isAudit ? `<p style="margin:0 0 4px">Purchase order total: <strong>${usd(report.purchaseOrderTotal)}</strong> · Invoice total: <strong>${usd(report.invoiceTotal)}</strong></p>
<p style="margin:0 0 12px">Supplier: ${escapeHtml(report.supplier)}</p>` : ''}
${sources.length ? `<p style="margin:0 0 12px;color:#475569;font-size:13px">Source documents: ${sources.map((s) => `${escapeHtml(s.label)} — ${escapeHtml(s.title)}`).join('; ')}</p>` : ''}
${discrepancies.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px">#</th><th style="padding:6px">Item / field</th><th style="padding:6px">Expected (PO)</th><th style="padding:6px">Actual (invoice)</th><th style="padding:6px">Impact</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${report.recommendedAction ? `<p style="margin:16px 0 0"><strong>Recommended action:</strong> ${escapeHtml(report.recommendedAction)}</p>` : ''}
<p style="margin:20px 0 0"><a href="${escapeHtml(runUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px">Open the run in Amberd Lite</a></p>
<p style="margin:20px 0 0;color:#64748b;font-size:12px">The full report is attached as a PDF. Amounts are calculated by Amberd Lite in code from values extracted from the source documents.</p>
</div></body></html>`;

  const text = [
    headline,
    isAudit ? `PO total ${usd(report.purchaseOrderTotal)} · Invoice total ${usd(report.invoiceTotal)} · Supplier ${report.supplier}` : '',
    ...discrepancies.map(
      (d, i) => `${i + 1}. ${d.item} — ${d.field}: expected ${d.expected}, actual ${d.actual}${d.amount_impact === null ? '' : ` (${usd(d.amount_impact)})`}`,
    ),
    report.recommendedAction ? `Recommended action: ${report.recommendedAction}` : '',
    `Open in Amberd Lite: ${runUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};
