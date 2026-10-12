import { createBlankAgentDefinition, invoiceAuditDefinition, validateAgentDefinition } from '@app-starter/shared';
import { compare, evaluateConditions } from './conditions';
import { reconcileInvoice } from './invoice-reconciliation';
import { toStrictJsonSchema, validateOutput } from './output-schema';

const doc = (id: string, unitPrice: number, statedTotal: number) => ({
  document_id: id,
  supplier: 'Acme Technology Solutions',
  currency: 'USD',
  line_items: [{ description: 'Enterprise SSD Storage', quantity: 10, unit_price: unitPrice, line_total: unitPrice * 10 }],
  stated_total: statedTotal,
  purchase_order_reference: 'PO-2026-1042',
});

describe('reconcileInvoice', () => {
  it('computes the discrepancy from line items rather than trusting stated totals', () => {
    const inputPo = doc('PO-2026-1042', 850, 8500);
    const inputInvoice = doc('INV-2026-2087', 920, 9200);

    const actual = reconcileInvoice(inputPo, inputInvoice, {
      purchaseOrderText: 'Quantity 10 $850.00 $8,500.00',
      invoiceText: 'Quantity 10 $920.00 $9,200.00',
    });

    expect(actual.discrepancy_amount).toBe(700);
    expect(actual.discrepancy_direction).toBe('OVERBILLED');
    expect(actual.matched_items).toEqual(['Enterprise SSD Storage']);
    expect(actual.integrity_warnings).toEqual([]);
  });

  it('warns when an extracted number does not appear in the source text', () => {
    const actual = reconcileInvoice(doc('PO-1', 850, 8500), doc('INV-1', 850, 8500), {
      purchaseOrderText: '10 $850.00 $8,500.00',
      invoiceText: '10 $800.00 $8,000.00',
    });

    expect(actual.integrity_warnings.some((w) => w.includes('not found in the document text'))).toBe(true);
  });
});

describe('reconcileInvoice — Google Drive demo files', () => {
  const line = (description: string, quantity: number, unit_price: number) => ({
    description,
    quantity,
    unit_price,
    line_total: quantity * unit_price,
  });

  it('finds every intentional discrepancy with expected and actual values', () => {
    const inputPo = {
      document_id: 'PO-2026-2001',
      supplier: 'Contoso Workplace Solutions',
      currency: 'USD',
      payment_terms: 'Net 30',
      stated_total: 23450,
      line_items: [
        line('Ergonomic Office Chair', 20, 310),
        line('Height-Adjustable Standing Desk', 10, 640),
        line('27-inch 4K Monitor', 25, 289),
        line('USB-C Docking Station', 25, 145),
      ],
    };
    const inputInvoice = {
      document_id: 'INV-88412',
      purchase_order_reference: 'PO-2026-2001',
      supplier: 'Contoso Workplace Solutions',
      currency: 'USD',
      payment_terms: 'Net 15',
      stated_total: 25580,
      line_items: [
        line('Ergonomic Office Chair', 20, 310),
        line('Height-Adjustable Standing Desk', 12, 640),
        line('27-inch 4K Monitor', 25, 305),
        line('USB-C Docking Station', 25, 145),
        line('Expedited Freight', 1, 450),
      ],
    };

    const actual = reconcileInvoice(inputPo, inputInvoice, {
      purchaseOrderText: '20 310 6,200.00 10 640 6,400.00 25 289 7,225.00 25 145 3,625.00 23,450.00',
      invoiceText: '20 310 6200 12 640 7680 25 305 7625 25 145 3625 1 450 450 25580',
    });

    expect(actual.discrepancy_amount).toBe(2130);
    expect(actual.discrepancies.map((d) => [d.type, d.item, d.expected, d.actual, d.amount_impact])).toEqual([
      ['QUANTITY', 'Height-Adjustable Standing Desk', '10', '12', 1280],
      ['UNIT_PRICE', '27-inch 4K Monitor', '$289.00', '$305.00', 400],
      ['LINE_NOT_ON_PURCHASE_ORDER', 'Expedited Freight', 'Not on purchase order', '1 × $450.00 = $450.00', 450],
      ['PAYMENT_TERMS', 'Header', 'Net 30', 'Net 15', null],
      ['TOTAL', 'Document total', '$23,450.00', '$25,580.00', 2130],
    ]);
    expect(actual.integrity_warnings).toEqual([]);
  });
});

describe('conditions', () => {
  it('compare handles every operator', () => {
    expect(compare('gt', 700, 0)).toBe(true);
    expect(compare('lt', 1, 2)).toBe(true);
    expect(compare('gte', 2, 2)).toBe(true);
    expect(compare('lte', 3, 2)).toBe(false);
    expect(compare('eq', 'PASSED', 'PASSED')).toBe(true);
    expect(compare('neq', 'a', 'b')).toBe(true);
    expect(compare('contains', 'Enterprise SSD', 'ssd')).toBe(true);
  });

  it('evaluateConditions treats a missing field as false and reads thresholds from variables', () => {
    const [inputRule] = invoiceAuditDefinition('c').conditions;

    const [missing] = evaluateConditions([inputRule], {}, { discrepancy_threshold: 0 });
    const [overThreshold] = evaluateConditions([inputRule], { discrepancy_amount: 700 }, { discrepancy_threshold: 1000 });

    expect(missing.result).toBe(false);
    expect(overThreshold.result).toBe(false);
    expect(overThreshold.actionsTriggered).toEqual(inputRule.elseActions);
  });
});

describe('agent definitions', () => {
  it('accepts the built-in templates and a blank agent', () => {
    expect(validateAgentDefinition(invoiceAuditDefinition('conn-1')).isValid).toBe(true);
    expect(validateAgentDefinition(createBlankAgentDefinition('conn-1')).isValid).toBe(true);
  });

  it('rejects unknown fields so no executable payload can ride along', () => {
    const input = { ...invoiceAuditDefinition('conn-1'), script: 'process.exit(1)' };

    const actual = validateAgentDefinition(input);

    expect(actual.isValid).toBe(false);
    expect(actual.errors[0].path).toBe('script');
  });

  it('rejects conditions that reference undeclared actions', () => {
    const input = invoiceAuditDefinition('conn-1');
    input.conditions[0].thenActions.push('does-not-exist');

    expect(validateAgentDefinition(input).isValid).toBe(false);
  });
});

describe('output schema', () => {
  it('closes every object for strict structured output', () => {
    const actual = toStrictJsonSchema(invoiceAuditDefinition('c').compute.outputSchema) as any;

    expect(actual.additionalProperties).toBe(false);
    expect(actual.properties.purchase_order.additionalProperties).toBe(false);
    expect(actual.properties.purchase_order.properties.line_items.items.required).toContain('unit_price');
  });

  it('reports type mismatches in model output', () => {
    const schema = createBlankAgentDefinition().compute.outputSchema;

    const actual = validateOutput(schema, { summary: 'ok', risk_count: 'three', risks: [] });

    expect(actual).toEqual(['output.risk_count must be an integer']);
  });
});
