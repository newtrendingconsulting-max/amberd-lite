import PDFDocument from 'pdfkit';

interface ReportDiscrepancy {
  type: string;
  item: string;
  field: string;
  expected: string;
  actual: string;
  amount_impact: number | null;
  expected_source_name?: string;
  actual_source_name?: string;
}

interface SourceDocument {
  label: string;
  title: string;
  resourceId: string;
  sourceUrl?: string | null;
}

export interface ReportPdfInput {
  report: Record<string, unknown>;
  runId: string;
  model: string | null;
  completedAt: Date | null;
}

const NAVY = '#0b1733';
const MUTED = '#64748b';

const usd = (value: unknown): string =>
  typeof value === 'number'
    ? `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

/**
 * Render a run's stored report as a PDF. Pure function of the persisted
 * report, so the downloaded file and the emailed attachment are identical.
 */
export const renderReportPdf = ({ report, runId, model, completedAt }: ReportPdfInput): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: String(report.title ?? 'Amberd Lite report') } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 100;

    // Header band
    doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Amberd Lite', 50, 24);
    doc.font('Helvetica').fontSize(9).fillColor('#93c5fd').text('AI Agent Control Platform', 50, 46);
    doc.fillColor('#000000').moveDown(3);

    doc.y = 90;
    doc.font('Helvetica-Bold').fontSize(16).text(String(report.title ?? 'Agent report'), 50);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
      `${report.agent ?? ''} · run ${runId.slice(0, 8)} · ${model ?? ''} · generated ${(completedAt ?? new Date()).toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    );
    doc.fillColor('#000000').moveDown(1);

    const isAudit = 'auditStatus' in report;
    if (isAudit) {
      const isFlagged = report.auditStatus === 'FLAGGED';
      const boxY = doc.y;
      doc.rect(50, boxY, width, 54).fill(isFlagged ? '#fffbeb' : '#ecfdf5');
      doc.fillColor(isFlagged ? '#92400e' : '#065f46').font('Helvetica-Bold').fontSize(13).text(
        isFlagged
          ? `${usd(report.discrepancyAmount)} ${report.discrepancyDirection === 'UNDERBILLED' ? 'underbilled' : 'overbilled'} — ${(report.discrepancies as unknown[] | undefined)?.length ?? 0} discrepancies found`
          : 'Invoice matches purchase order — audit passed',
        62,
        boxY + 10,
        { width: width - 24 },
      );
      doc.font('Helvetica').fontSize(9).text(`Audit status: ${report.auditStatus}`, 62, boxY + 32);
      doc.fillColor('#000000');
      doc.y = boxY + 68;

      const kv: Array<[string, string]> = [
        ['Purchase order', String(report.purchaseOrderId ?? '—')],
        ['Invoice', String(report.invoiceId ?? '—')],
        ['Supplier', String(report.supplier ?? '—')],
        ['Purchase order total', usd(report.purchaseOrderTotal)],
        ['Invoice total', usd(report.invoiceTotal)],
        ['Difference', usd(report.discrepancyAmount)],
      ];
      kv.forEach(([k, v]) => {
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(k, 50, y, { width: 150 });
        doc.fillColor('#000000').text(v, 200, y, { width: width - 150 });
        doc.moveDown(0.25);
      });

      const sources = (report.sourceDocuments as SourceDocument[] | undefined) ?? [];
      if (sources.length) {
        doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Source documents', 50);
        doc.font('Helvetica').fontSize(9);
        sources.forEach((s) => doc.text(`• ${s.label}: ${s.title}${s.sourceUrl ? `  (${s.sourceUrl})` : ''}`, { width }));
      }

      const discrepancies = (report.discrepancies as ReportDiscrepancy[] | undefined) ?? [];
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Discrepancies', 50);
      if (!discrepancies.length) {
        doc.font('Helvetica').fontSize(10).text('None — every field matches.');
      } else {
        const cols = [50, 72, 210, 315, 420, 492];
        const headerY = doc.y + 4;
        doc.rect(50, headerY - 3, width, 18).fill('#f1f5f9');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5);
        ['#', 'Item / field', 'Expected (PO)', 'Actual (invoice)', 'Impact', ''].forEach((h, i) => doc.text(h, cols[i], headerY, { width: (cols[i + 1] ?? 562) - cols[i] - 4 }));
        doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
        let y = headerY + 18;
        discrepancies.forEach((d, index) => {
          if (y > doc.page.height - 90) {
            doc.addPage();
            y = 60;
          }
          const rowHeight = Math.max(
            doc.heightOfString(`${d.item} — ${d.field}`, { width: 134 }),
            doc.heightOfString(d.actual, { width: 101 }),
            doc.heightOfString(d.expected, { width: 101 }),
          ) + 8;
          doc.text(String(index + 1), cols[0], y);
          doc.text(`${d.item} — ${d.field}`, cols[1], y, { width: 134 });
          doc.text(d.expected, cols[2], y, { width: 101 });
          doc.text(d.actual, cols[3], y, { width: 101 });
          doc.text(d.amount_impact === null ? 'terms' : usd(d.amount_impact), cols[4], y, { width: 70 });
          y += rowHeight;
          doc.moveTo(50, y - 4).lineTo(50 + width, y - 4).strokeColor('#e2e8f0').stroke();
        });
        doc.y = y + 4;
        doc.fillColor(MUTED).fontSize(8).text('Expected values come from the purchase order; actual values from the supplier invoice.', 50, doc.y, { width });
        doc.fillColor('#000000');
      }

      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Recommended action', 50);
      doc.font('Helvetica').fontSize(10).text(String(report.recommendedAction ?? '—'), { width });

      const warnings = (report.integrityWarnings as string[] | undefined) ?? [];
      if (warnings.length) {
        doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Integrity checks', 50);
        doc.font('Helvetica').fontSize(9);
        warnings.forEach((w) => doc.text(`• ${w}`, { width }));
      }
      const observations = (report.modelObservations as string[] | undefined) ?? [];
      if (observations.length) {
        doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Model observations', 50);
        doc.font('Helvetica').fontSize(9);
        observations.forEach((o) => doc.text(`• ${o}`, { width }));
      }
    } else {
      doc.font('Helvetica').fontSize(9).text(JSON.stringify(report.results ?? report, null, 2), { width });
    }

    doc.moveDown(1.5).fontSize(7.5).fillColor(MUTED).text(
      'Totals and discrepancies are calculated by Amberd Lite in code from values the model extracted from the source documents. Generated by Amberd Lite (Hackathon Demo).',
      50,
      doc.y,
      { width },
    );
    doc.end();
  });
