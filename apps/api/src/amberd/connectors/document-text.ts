import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';

export const SUPPORTED_MIME_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  text: 'text/plain',
} as const;

/** Largest file Amberd Lite will download and parse for an agent run. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export class UnsupportedDocumentError extends Error {}

/**
 * Turn a downloaded document into plain text for the model and for the
 * deterministic grounding checks. Spreadsheet cells are emitted as their
 * stored values, one row per line, cells separated by " | ".
 */
export const extractDocumentText = async (data: Buffer, mimeType: string): Promise<string> => {
  if (data.length > MAX_DOCUMENT_BYTES) {
    throw new UnsupportedDocumentError(`Document is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`);
  }
  if (mimeType === SUPPORTED_MIME_TYPES.pdf) {
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      const text = result.text.replace(/\n-- \d+ of \d+ --\n?/g, '\n').trim();
      if (!text) throw new UnsupportedDocumentError('The PDF has no extractable text (scanned images are not supported yet)');
      return text;
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === SUPPORTED_MIME_TYPES.xlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data as unknown as ArrayBuffer);
    const sheets: string[] = [];
    workbook.eachSheet((sheet) => {
      const rows: string[] = [`Sheet: ${sheet.name}`];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell) => {
          const value = cell.text?.trim();
          if (value) cells.push(value);
        });
        if (cells.length) rows.push(cells.join(' | '));
      });
      sheets.push(rows.join('\n'));
    });
    return sheets.join('\n\n');
  }
  if (mimeType === SUPPORTED_MIME_TYPES.csv || mimeType.startsWith('text/')) {
    return data.toString('utf8');
  }
  throw new UnsupportedDocumentError(`Unsupported file type: ${mimeType}`);
};
