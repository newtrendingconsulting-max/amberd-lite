import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { extractDocumentText, SUPPORTED_MIME_TYPES, UnsupportedDocumentError } from './document-text';

const DEMO = path.resolve(__dirname, '../../../../../demo-files');

describe('extractDocumentText', () => {
  // pdf.js loads its worker with a dynamic import that Jest's VM cannot run,
  // so the PDF path is exercised in a plain Node process, as in production.
  it('reads line items and totals from the purchase order PDF', () => {
    const script = `require('./src/amberd/connectors/document-text').extractDocumentText(require('fs').readFileSync(${JSON.stringify(
      path.join(DEMO, 'PO-2026-2001.pdf'),
    )}), 'application/pdf').then((t) => process.stdout.write(t))`;
    const actual = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 60_000 },
    );

    expect(actual).toContain('PO-2026-2001');
    expect(actual).toContain('Height-Adjustable Standing Desk 10 $640.00 $6,400.00');
    expect(actual).toContain('$23,450.00');
  });

  it('reads cell values from the invoice spreadsheet', async () => {
    const actual = await extractDocumentText(fs.readFileSync(path.join(DEMO, 'INV-88412.xlsx')), SUPPORTED_MIME_TYPES.xlsx);

    expect(actual).toContain('Invoice Number | INV-88412');
    expect(actual).toContain('27-inch 4K Monitor | 25 | 305 | 7625');
    expect(actual).toContain('TOTAL DUE | 25580');
  });

  it('rejects unsupported file types', async () => {
    await expect(extractDocumentText(Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(UnsupportedDocumentError);
  });
});
