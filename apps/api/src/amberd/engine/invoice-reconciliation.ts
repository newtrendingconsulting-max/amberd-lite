/**
 * Deterministic invoice-to-purchase-order reconciliation.
 *
 * The model only extracts what the documents say. Every comparison and every
 * amount reported by the audit is computed here, and extracted numbers are
 * checked against the raw document text so a misread value is surfaced rather
 * than silently trusted.
 */

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ExtractedDocument {
  document_id: string;
  supplier: string;
  currency: string;
  line_items: ExtractedLineItem[];
  stated_total: number;
  purchase_order_reference?: string;
  payment_terms?: string;
}

export type DiscrepancyType =
  | 'QUANTITY'
  | 'UNIT_PRICE'
  | 'LINE_NOT_ON_PURCHASE_ORDER'
  | 'LINE_NOT_INVOICED'
  | 'PAYMENT_TERMS'
  | 'CURRENCY'
  | 'SUPPLIER'
  | 'PO_REFERENCE'
  | 'TOTAL';

/** One difference between the purchase order (expected) and the invoice (actual). */
export interface Discrepancy {
  type: DiscrepancyType;
  item: string;
  field: string;
  expected: string;
  actual: string;
  /** Monetary effect on the invoice total, when there is one. */
  amount_impact: number | null;
  expected_source: 'purchase_order';
  actual_source: 'invoice';
}

export interface LineComparison {
  description: string;
  matched: boolean;
  po_quantity: number | null;
  invoice_quantity: number | null;
  quantity_difference: number | null;
  po_unit_price: number | null;
  invoice_unit_price: number | null;
  unit_price_difference: number | null;
  po_line_total: number | null;
  invoice_line_total: number | null;
  line_difference: number;
}

export interface ReconciliationResult {
  purchase_order_id: string;
  invoice_id: string;
  supplier: string;
  supplier_match: boolean;
  currency: string;
  currency_match: boolean;
  po_reference_match: boolean;
  matched_items: string[];
  unmatched_items: string[];
  line_comparisons: LineComparison[];
  quantity_comparison: string;
  unit_price_comparison: string;
  purchase_order_total: number;
  invoice_total: number;
  discrepancy_amount: number;
  discrepancy_direction: 'OVERBILLED' | 'UNDERBILLED' | 'NONE';
  discrepancy_explanation: string;
  discrepancies: Discrepancy[];
  integrity_warnings: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const formatUsd = (value: number, currency: string): string =>
  `${currency === 'USD' ? '$' : ''}${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${currency === 'USD' ? '' : ` ${currency}`}`;

/** True when the number appears in the text in any common money/number format. */
const appearsInText = (value: number, text: string): boolean => {
  const fixed = value.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const withCommas = Number(whole).toLocaleString('en-US');
  const candidates = [
    `${withCommas}.${cents}`,
    `${whole}.${cents}`,
    withCommas,
    whole,
  ];
  const haystack = text.replace(/\s+/g, ' ');
  return candidates.some((candidate) => new RegExp(`(^|[^0-9.,])${candidate.replace(/[.,]/g, '\\$&')}([^0-9]|$)`).test(haystack));
};

const lineTotal = (item: ExtractedLineItem): number => round2(item.quantity * item.unit_price);

export const reconcileInvoice = (
  purchaseOrder: ExtractedDocument,
  invoice: ExtractedDocument,
  sources: { purchaseOrderText: string; invoiceText: string },
): ReconciliationResult => {
  const warnings: string[] = [];

  // Integrity: computed line totals vs stated values, and grounding in source text.
  const checkDocument = (doc: ExtractedDocument, text: string, label: string): number => {
    const computedTotal = round2(doc.line_items.reduce((sum, item) => sum + lineTotal(item), 0));
    doc.line_items.forEach((item) => {
      if (round2(item.line_total) !== lineTotal(item)) {
        warnings.push(
          `${label} line "${item.description}": stated line total ${item.line_total} differs from quantity × unit price ${lineTotal(item)}`,
        );
      }
      [item.quantity, item.unit_price].forEach((number) => {
        if (!appearsInText(number, text)) {
          warnings.push(`${label}: extracted value ${number} for "${item.description}" was not found in the document text`);
        }
      });
    });
    if (round2(doc.stated_total) !== computedTotal) {
      warnings.push(`${label}: stated total ${doc.stated_total} differs from the computed line total ${computedTotal}`);
    }
    if (!appearsInText(doc.stated_total, text)) {
      warnings.push(`${label}: extracted total ${doc.stated_total} was not found in the document text`);
    }
    return computedTotal;
  };

  const poTotal = checkDocument(purchaseOrder, sources.purchaseOrderText, 'Purchase order');
  const invoiceTotal = checkDocument(invoice, sources.invoiceText, 'Invoice');

  // Item matching by normalized description.
  const comparisons: LineComparison[] = [];
  const invoiceRemaining = [...invoice.line_items];
  purchaseOrder.line_items.forEach((poItem) => {
    const index = invoiceRemaining.findIndex(
      (candidate) => normalize(candidate.description) === normalize(poItem.description),
    );
    const invItem = index >= 0 ? invoiceRemaining.splice(index, 1)[0] : undefined;
    comparisons.push({
      description: poItem.description,
      matched: Boolean(invItem),
      po_quantity: poItem.quantity,
      invoice_quantity: invItem?.quantity ?? null,
      quantity_difference: invItem ? round2(invItem.quantity - poItem.quantity) : null,
      po_unit_price: poItem.unit_price,
      invoice_unit_price: invItem?.unit_price ?? null,
      unit_price_difference: invItem ? round2(invItem.unit_price - poItem.unit_price) : null,
      po_line_total: lineTotal(poItem),
      invoice_line_total: invItem ? lineTotal(invItem) : null,
      line_difference: round2((invItem ? lineTotal(invItem) : 0) - lineTotal(poItem)),
    });
  });
  invoiceRemaining.forEach((invItem) => {
    comparisons.push({
      description: invItem.description,
      matched: false,
      po_quantity: null,
      invoice_quantity: invItem.quantity,
      quantity_difference: null,
      po_unit_price: null,
      invoice_unit_price: invItem.unit_price,
      unit_price_difference: null,
      po_line_total: null,
      invoice_line_total: lineTotal(invItem),
      line_difference: lineTotal(invItem),
    });
  });

  const matched = comparisons.filter((c) => c.matched);
  const discrepancy = round2(invoiceTotal - poTotal);
  const currency = purchaseOrder.currency || invoice.currency || 'USD';

  const quantityIssues = matched.filter((c) => c.quantity_difference !== 0);
  const priceIssues = matched.filter((c) => c.unit_price_difference !== 0);

  const quantityComparison = quantityIssues.length
    ? quantityIssues
        .map((c) => `${c.description}: ordered ${c.po_quantity}, invoiced ${c.invoice_quantity}`)
        .join('; ')
    : `All ${matched.length} matched item(s) have identical quantities`;

  const priceComparison = priceIssues.length
    ? priceIssues
        .map(
          (c) =>
            `${c.description}: PO unit price ${formatUsd(c.po_unit_price!, currency)}, invoice unit price ${formatUsd(
              c.invoice_unit_price!,
              currency,
            )} (${c.unit_price_difference! > 0 ? '+' : '-'}${formatUsd(c.unit_price_difference!, currency)} per unit)`,
        )
        .join('; ')
    : `All ${matched.length} matched item(s) have identical unit prices`;

  const explanationParts: string[] = [];
  if (discrepancy === 0) {
    explanationParts.push(
      `Invoice total ${formatUsd(invoiceTotal, currency)} matches the purchase order total ${formatUsd(poTotal, currency)}.`,
    );
  } else {
    explanationParts.push(
      `Invoice total ${formatUsd(invoiceTotal, currency)} is ${discrepancy > 0 ? 'higher' : 'lower'} than the purchase order total ${formatUsd(
        poTotal,
        currency,
      )} by ${formatUsd(discrepancy, currency)}.`,
    );
    priceIssues.forEach((c) => {
      explanationParts.push(
        `${c.description}: unit price changed from ${formatUsd(c.po_unit_price!, currency)} to ${formatUsd(
          c.invoice_unit_price!,
          currency,
        )} across ${c.invoice_quantity} unit(s) = ${formatUsd(c.line_difference, currency)}.`,
      );
    });
    quantityIssues.forEach((c) => {
      explanationParts.push(`${c.description}: quantity changed from ${c.po_quantity} to ${c.invoice_quantity}.`);
    });
  }
  const unmatched = comparisons.filter((c) => !c.matched).map((c) => c.description);
  if (unmatched.length) explanationParts.push(`Unmatched items: ${unmatched.join(', ')}.`);

  const supplierMatch = normalize(purchaseOrder.supplier) === normalize(invoice.supplier);
  const poReferenceMatch =
    normalize(invoice.purchase_order_reference ?? '') === normalize(purchaseOrder.document_id);
  if (!supplierMatch) warnings.push('Supplier on invoice does not match the purchase order');
  if (!poReferenceMatch) warnings.push('Invoice does not reference this purchase order');

  const fmt = (value: number) => formatUsd(value, currency);
  const discrepancies: Discrepancy[] = [];
  const add = (d: Omit<Discrepancy, 'expected_source' | 'actual_source'>) =>
    discrepancies.push({ ...d, expected_source: 'purchase_order', actual_source: 'invoice' });

  comparisons.forEach((c) => {
    if (c.matched && c.quantity_difference) {
      add({
        type: 'QUANTITY',
        item: c.description,
        field: 'Quantity',
        expected: String(c.po_quantity),
        actual: String(c.invoice_quantity),
        amount_impact: round2(c.quantity_difference * (c.invoice_unit_price ?? 0)),
      });
    }
    if (c.matched && c.unit_price_difference) {
      add({
        type: 'UNIT_PRICE',
        item: c.description,
        field: 'Unit price',
        expected: fmt(c.po_unit_price!),
        actual: fmt(c.invoice_unit_price!),
        amount_impact: round2(c.unit_price_difference * (c.po_quantity ?? 0)),
      });
    }
    if (!c.matched && c.po_quantity === null) {
      add({
        type: 'LINE_NOT_ON_PURCHASE_ORDER',
        item: c.description,
        field: 'Line item',
        expected: 'Not on purchase order',
        actual: `${c.invoice_quantity} × ${fmt(c.invoice_unit_price!)} = ${fmt(c.invoice_line_total!)}`,
        amount_impact: c.invoice_line_total,
      });
    }
    if (!c.matched && c.invoice_quantity === null) {
      add({
        type: 'LINE_NOT_INVOICED',
        item: c.description,
        field: 'Line item',
        expected: `${c.po_quantity} × ${fmt(c.po_unit_price!)} = ${fmt(c.po_line_total!)}`,
        actual: 'Not on invoice',
        amount_impact: c.po_line_total === null ? null : -c.po_line_total,
      });
    }
  });
  const normalizedTerms = (value?: string) => normalize(value ?? '');
  if (purchaseOrder.payment_terms && invoice.payment_terms && normalizedTerms(purchaseOrder.payment_terms) !== normalizedTerms(invoice.payment_terms)) {
    add({ type: 'PAYMENT_TERMS', item: 'Header', field: 'Payment terms', expected: purchaseOrder.payment_terms, actual: invoice.payment_terms, amount_impact: null });
  }
  if (purchaseOrder.currency && invoice.currency && normalize(purchaseOrder.currency) !== normalize(invoice.currency)) {
    add({ type: 'CURRENCY', item: 'Header', field: 'Currency', expected: purchaseOrder.currency, actual: invoice.currency, amount_impact: null });
  }
  if (!supplierMatch) {
    add({ type: 'SUPPLIER', item: 'Header', field: 'Supplier', expected: purchaseOrder.supplier, actual: invoice.supplier, amount_impact: null });
  }
  if (!poReferenceMatch) {
    add({
      type: 'PO_REFERENCE',
      item: 'Header',
      field: 'Purchase order reference',
      expected: purchaseOrder.document_id,
      actual: invoice.purchase_order_reference || 'Missing',
      amount_impact: null,
    });
  }
  if (discrepancy !== 0) {
    add({ type: 'TOTAL', item: 'Document total', field: 'Total', expected: fmt(poTotal), actual: fmt(invoiceTotal), amount_impact: discrepancy });
  }

  return {
    purchase_order_id: purchaseOrder.document_id,
    invoice_id: invoice.document_id,
    supplier: purchaseOrder.supplier,
    supplier_match: supplierMatch,
    currency,
    currency_match: normalize(purchaseOrder.currency) === normalize(invoice.currency),
    po_reference_match: poReferenceMatch,
    matched_items: matched.map((c) => c.description),
    unmatched_items: unmatched,
    line_comparisons: comparisons,
    quantity_comparison: quantityComparison,
    unit_price_comparison: priceComparison,
    purchase_order_total: poTotal,
    invoice_total: invoiceTotal,
    discrepancy_amount: Math.abs(discrepancy),
    discrepancy_direction: discrepancy > 0 ? 'OVERBILLED' : discrepancy < 0 ? 'UNDERBILLED' : 'NONE',
    discrepancy_explanation: explanationParts.join(' '),
    discrepancies,
    integrity_warnings: warnings,
  };
};
