/**
 * Generates the Google Drive demo files for the Invoice Audit Agent:
 *   - PO-2026-2001.pdf            purchase order (PDF)
 *   - INV-88412.xlsx              supplier invoice (Excel)
 *   - INV-88413-matching.xlsx     a correct invoice for the same order
 *
 * Run: pnpm --filter @app-starter/api exec ts-node scripts/amberd-generate-demo-files.ts
 * Output: <repo>/demo-files/
 */
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const OUT = path.resolve(__dirname, '../../../demo-files');

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
}

const PO_LINES: Line[] = [
  { description: 'Ergonomic Office Chair', quantity: 20, unitPrice: 310 },
  { description: 'Height-Adjustable Standing Desk', quantity: 10, unitPrice: 640 },
  { description: '27-inch 4K Monitor', quantity: 25, unitPrice: 289 },
  { description: 'USB-C Docking Station', quantity: 25, unitPrice: 145 },
];

// Intentional discrepancies: desk quantity, monitor price, an extra freight
// line, and shorter payment terms.
const INVOICE_LINES: Line[] = [
  { description: 'Ergonomic Office Chair', quantity: 20, unitPrice: 310 },
  { description: 'Height-Adjustable Standing Desk', quantity: 12, unitPrice: 640 },
  { description: '27-inch 4K Monitor', quantity: 25, unitPrice: 305 },
  { description: 'USB-C Docking Station', quantity: 25, unitPrice: 145 },
  { description: 'Expedited Freight', quantity: 1, unitPrice: 450 },
];

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const total = (lines: Line[]) => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

const writePurchaseOrder = async (file: string): Promise<void> => {
  const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(16).text('NORTHWIND ENTERPRISES INC.');
  doc.font('Helvetica').fontSize(9).fillColor('#444').text('Procurement Department · 500 Harbor Boulevard, Suite 1200, San Francisco, CA 94105');
  doc.moveDown(1.5).fillColor('#000').font('Helvetica-Bold').fontSize(20).text('PURCHASE ORDER');
  doc.moveDown(0.8).font('Helvetica').fontSize(10);
  [
    ['Purchase Order Number', 'PO-2026-2001'],
    ['Order Date', '2026-09-08'],
    ['Supplier', 'Contoso Workplace Solutions'],
    ['Supplier Address', '1200 Market Street, Denver, CO 80202'],
    ['Currency', 'USD'],
    ['Payment Terms', 'Net 30'],
    ['Buyer', 'Dana Whitfield, Facilities Procurement'],
  ].forEach(([k, v]) => doc.text(`${k}: ${v}`));

  doc.moveDown(1.2).font('Helvetica-Bold');
  const cols = [56, 90, 330, 400, 480];
  const y0 = doc.y;
  ['Line', 'Item', 'Quantity', 'Unit Price', 'Line Total'].forEach((h, i) => doc.text(h, cols[i], y0));
  doc.moveTo(56, doc.y + 4).lineTo(556, doc.y + 4).stroke();
  doc.font('Helvetica');
  PO_LINES.forEach((line, index) => {
    const y = doc.y + 10;
    doc.text(String(index + 1), cols[0], y);
    doc.text(line.description, cols[1], y);
    doc.text(String(line.quantity), cols[2], y);
    doc.text(money(line.unitPrice), cols[3], y);
    doc.text(money(line.quantity * line.unitPrice), cols[4], y);
  });
  doc.moveTo(56, doc.y + 8).lineTo(556, doc.y + 8).stroke();
  doc.moveDown(1.5).font('Helvetica-Bold').text(`TOTAL: ${money(total(PO_LINES))} USD`, 56, doc.y + 6, { align: 'right', width: 500 });
  doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#444').text(
    'Approved by: Marcus Lee, Director of Facilities. Prices and quantities are fixed for this order; any change requires a written amendment before invoicing.',
    56,
  );
  doc.end();
  await new Promise<void>((resolve) => stream.on('finish', () => resolve()));
};

const writeInvoice = async (file: string, invoiceNumber: string, lines: Line[], terms: string): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invoice');
  ws.columns = [{ width: 8 }, { width: 38 }, { width: 12 }, { width: 14 }, { width: 16 }];
  const header: Array<[string, string]> = [
    ['Supplier', 'Contoso Workplace Solutions'],
    ['Invoice Number', invoiceNumber],
    ['Invoice Date', '2026-09-29'],
    ['Purchase Order Reference', 'PO-2026-2001'],
    ['Bill To', 'Northwind Enterprises Inc.'],
    ['Currency', 'USD'],
    ['Payment Terms', terms],
  ];
  ws.addRow(['INVOICE']).font = { bold: true, size: 16 };
  header.forEach(([k, v]) => ws.addRow([k, v]));
  ws.addRow([]);
  const head = ws.addRow(['Line', 'Description', 'Quantity', 'Unit Price', 'Amount']);
  head.font = { bold: true };
  lines.forEach((line, index) => {
    const row = ws.addRow([index + 1, line.description, line.quantity, line.unitPrice, line.quantity * line.unitPrice]);
    row.getCell(4).numFmt = '"$"#,##0.00';
    row.getCell(5).numFmt = '"$"#,##0.00';
  });
  ws.addRow([]);
  const totalRow = ws.addRow(['', '', '', 'TOTAL DUE', total(lines)]);
  totalRow.font = { bold: true };
  totalRow.getCell(5).numFmt = '"$"#,##0.00';
  await wb.xlsx.writeFile(file);
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await writePurchaseOrder(path.join(OUT, 'PO-2026-2001.pdf'));
  await writeInvoice(path.join(OUT, 'INV-88412.xlsx'), 'INV-88412', INVOICE_LINES, 'Net 15');
  await writeInvoice(path.join(OUT, 'INV-88413-matching.xlsx'), 'INV-88413', PO_LINES, 'Net 30');
  console.log(`PO total ${money(total(PO_LINES))}; invoice INV-88412 total ${money(total(INVOICE_LINES))}`);
  console.log(`Files written to ${OUT}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
