import { AGENT_DEFINITION_SCHEMA_VERSION, AgentDefinition, OutputSchemaNode } from './agent-definition';

export type TemplateMaturity = 'WORKING' | 'CONFIGURATION_EXAMPLE';

export interface AgentTemplate {
  id: string;
  name: string;
  department: string;
  summary: string;
  maturity: TemplateMaturity;
  build: (connectionId: string) => AgentDefinition;
}

const lineItemsSchema: OutputSchemaNode = {
  type: 'array',
  description: 'Every line item exactly as stated in the document',
  items: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Item description' },
      quantity: { type: 'number', description: 'Quantity as stated' },
      unit_price: { type: 'number', description: 'Unit price as stated, numeric only' },
      line_total: { type: 'number', description: 'Line total as stated, numeric only' },
    },
    required: ['description', 'quantity', 'unit_price', 'line_total'],
  },
};

/**
 * The model's job here is extraction only. Comparison and arithmetic are done
 * by the `invoice_reconciliation` validator in backend code, so the prompt
 * never states an expected result.
 */
export const invoiceAuditDefinition = (
  connectionId: string,
  /** Where each document comes from: local folder names or Google Drive folder ids. */
  collections: { purchaseOrders: string; invoices: string } = { purchaseOrders: 'purchase-orders', invoices: 'invoices' },
): AgentDefinition => ({
  schemaVersion: AGENT_DEFINITION_SCHEMA_VERSION,
  identity: {
    name: 'Invoice Audit Agent',
    description:
      'Compares supplier invoices against purchase orders to detect billing discrepancies before payment.',
    agentKey: 'invoice-audit',
    department: 'Finance',
    status: 'ACTIVE',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    temperature: 0,
    maxOutputTokens: 4000,
    effort: 'low',
  },
  trigger: { type: 'MANUAL' },
  variables: [
    {
      name: 'purchase_order_id',
      type: 'string',
      required: true,
      defaultValue: 'PO-2026-1042',
      description: 'Purchase order document in the Finance repository',
    },
    {
      name: 'invoice_id',
      type: 'string',
      required: true,
      defaultValue: 'INV-2026-2087',
      description: 'Supplier invoice document in the Finance repository',
    },
    {
      name: 'discrepancy_threshold',
      type: 'number',
      required: false,
      defaultValue: 0,
      description: 'Discrepancies above this amount (USD) are flagged',
    },
  ],
  dataInputs: [
    {
      connectionId,
      resources: Array.from(new Set([collections.purchaseOrders, collections.invoices])),
      operations: ['list', 'read'],
      bindings: [
        { variable: 'purchase_order_id', collection: collections.purchaseOrders, label: 'Purchase order' },
        { variable: 'invoice_id', collection: collections.invoices, label: 'Supplier invoice' },
      ],
    },
  ],
  compute: {
    systemInstructions:
      'You are a finance document extraction agent running on the Amberd platform. Read the enterprise documents provided and extract their contents faithfully. Copy numbers exactly as written in the documents. Do not calculate, reconcile, or correct any values — comparison is performed separately by the platform. If a field is missing from a document, use an empty string or 0 and mention it in observations.',
    taskInstructions:
      'Extract the purchase order and the supplier invoice: document identifiers, supplier name, currency, payment terms, every line item (description, quantity, unit price, line total), and the stated document total. For the invoice, also extract the purchase order number it references. Spreadsheet rows are given as cells separated by " | ". Then add brief observations about anything unusual in either document.',
    inputMapping: {
      purchase_order_id: 'Purchase order',
      invoice_id: 'Supplier invoice',
    },
    outputSchema: {
      type: 'object',
      properties: {
        purchase_order: {
          type: 'object',
          properties: {
            document_id: { type: 'string', description: 'Purchase order number' },
            supplier: { type: 'string' },
            currency: { type: 'string' },
            payment_terms: { type: 'string', description: 'Payment terms as written, e.g. Net 30' },
            line_items: lineItemsSchema,
            stated_total: { type: 'number', description: 'Total as printed on the document' },
          },
          required: ['document_id', 'supplier', 'currency', 'payment_terms', 'line_items', 'stated_total'],
        },
        invoice: {
          type: 'object',
          properties: {
            document_id: { type: 'string', description: 'Invoice number' },
            purchase_order_reference: { type: 'string' },
            supplier: { type: 'string' },
            currency: { type: 'string' },
            payment_terms: { type: 'string', description: 'Payment terms as written, e.g. Net 30' },
            line_items: lineItemsSchema,
            stated_total: { type: 'number', description: 'Total as printed on the document' },
          },
          required: [
            'document_id',
            'purchase_order_reference',
            'supplier',
            'currency',
            'payment_terms',
            'line_items',
            'stated_total',
          ],
        },
        observations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Short factual notes about the documents',
        },
      },
      required: ['purchase_order', 'invoice', 'observations'],
    },
    validators: ['invoice_reconciliation'],
  },
  conditions: [
    {
      id: 'discrepancy-check',
      name: 'Discrepancy exceeds threshold',
      field: 'discrepancy_amount',
      operator: 'gt',
      valueFromVariable: 'discrepancy_threshold',
      thenActions: ['flag', 'discrepancy-report', 'notify-problem'],
      elseActions: ['passed', 'confirmation-report'],
    },
  ],
  actions: [
    {
      id: 'flag',
      type: 'FLAG_DISCREPANCY',
      label: 'Flag invoice',
      runWhen: 'ON_CONDITION',
      config: { severity: 'critical' },
    },
    {
      id: 'discrepancy-report',
      type: 'GENERATE_REPORT',
      label: 'Generate discrepancy report',
      runWhen: 'ON_CONDITION',
      config: { title: 'Invoice discrepancy report' },
    },
    {
      id: 'notify-problem',
      type: 'CREATE_NOTIFICATION',
      label: 'Notify finance admins',
      runWhen: 'ON_CONDITION',
      config: { title: 'Invoice discrepancy detected', severity: 'critical' },
    },
    {
      id: 'passed',
      type: 'MARK_PASSED',
      label: 'Mark audit passed',
      runWhen: 'ON_CONDITION',
    },
    {
      id: 'confirmation-report',
      type: 'GENERATE_REPORT',
      label: 'Generate confirmation report',
      runWhen: 'ON_CONDITION',
      config: { title: 'Invoice audit confirmation' },
    },
    {
      id: 'email-report',
      type: 'SEND_EMAIL',
      label: 'Email audit report',
      runWhen: 'ALWAYS',
      config: { recipients: [], attachReport: true },
    },
    { id: 'save', type: 'SAVE_RESULT', label: 'Save audit result', runWhen: 'ALWAYS' },
  ],
  resourceLimits: {
    maxConcurrency: 2,
    timeoutSeconds: 180,
    maxDataResources: 4,
    spendCapUsd: 20,
    spendWindowDays: 30,
    priorityTier: 'CRITICAL',
  },
});

const simpleTemplate = (
  base: Pick<AgentDefinition['identity'], 'name' | 'description' | 'agentKey' | 'department'>,
  task: string,
  connectionId: string,
  collection: string,
  outputSchema: OutputSchemaNode,
  condition: { field: string; value: number },
  tier: AgentDefinition['resourceLimits']['priorityTier'],
): AgentDefinition => ({
  schemaVersion: AGENT_DEFINITION_SCHEMA_VERSION,
  identity: { ...base, status: 'DRAFT' },
  llm: { provider: 'anthropic', model: 'claude-sonnet-5-5', temperature: 0, maxOutputTokens: 4000, effort: 'low' },
  trigger: { type: 'MANUAL' },
  variables: [{ name: 'document_id', type: 'string', required: true, description: 'Document to analyze' }],
  dataInputs: [
    {
      connectionId,
      resources: [collection],
      operations: ['list', 'read'],
      bindings: [{ variable: 'document_id', collection, label: 'Document' }],
    },
  ],
  compute: {
    systemInstructions:
      'You are an enterprise agent running on Amberd. Work only from the provided documents and never invent facts.',
    taskInstructions: task,
    inputMapping: { document_id: 'Document' },
    outputSchema,
    validators: [],
  },
  conditions: [
    {
      id: 'review-check',
      name: 'Needs review',
      field: condition.field,
      operator: 'gte',
      value: condition.value,
      thenActions: ['notify'],
      elseActions: [],
    },
  ],
  actions: [
    { id: 'report', type: 'GENERATE_REPORT', label: 'Generate report', runWhen: 'ALWAYS' },
    { id: 'save', type: 'SAVE_RESULT', label: 'Save execution result', runWhen: 'ALWAYS' },
    {
      id: 'notify',
      type: 'CREATE_NOTIFICATION',
      label: 'Notify owners',
      runWhen: 'ON_CONDITION',
      config: { title: `${base.name}: review needed`, severity: 'warning' },
    },
  ],
  resourceLimits: {
    maxConcurrency: 2,
    timeoutSeconds: 120,
    maxDataResources: 3,
    spendCapUsd: 10,
    spendWindowDays: 30,
    priorityTier: tier,
  },
});

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'invoice-audit',
    name: 'Invoice Audit',
    department: 'Finance',
    summary:
      'Compares a supplier invoice with its purchase order, reconciles amounts in backend code, flags discrepancies, notifies finance, and records the audit — fully automated.',
    maturity: 'WORKING',
    build: invoiceAuditDefinition,
  },
  {
    id: 'customer-risk',
    name: 'Customer Risk Assessment',
    department: 'Risk & Compliance',
    summary: 'Scores counterparty risk from customer documents and escalates high-risk accounts.',
    maturity: 'CONFIGURATION_EXAMPLE',
    build: (connectionId) =>
      simpleTemplate(
        {
          name: 'Customer Risk Assessment',
          description: 'Assesses customer risk signals and escalates high-risk accounts.',
          agentKey: 'customer-risk',
          department: 'Risk & Compliance',
        },
        'Assess the customer described in the document. Score overall risk from 0 (none) to 10 (severe) and list the signals behind the score.',
        connectionId,
        'invoices',
        {
          type: 'object',
          properties: {
            customer: { type: 'string' },
            risk_score: { type: 'number', description: '0 to 10' },
            signals: { type: 'array', items: { type: 'string' } },
          },
          required: ['customer', 'risk_score', 'signals'],
        },
        { field: 'risk_score', value: 7 },
        'STANDARD',
      ),
  },
  {
    id: 'knowledge-assistant',
    name: 'Internal Knowledge Assistant',
    department: 'Operations',
    summary: 'Answers employee questions from governed internal documents with source references.',
    maturity: 'CONFIGURATION_EXAMPLE',
    build: (connectionId) =>
      simpleTemplate(
        {
          name: 'Internal Knowledge Assistant',
          description: 'Answers questions from approved internal documents.',
          agentKey: 'knowledge-assistant',
          department: 'Operations',
        },
        'Summarize the document for an employee and list the three most important facts. Rate how uncertain the answer is from 0 to 10.',
        connectionId,
        'purchase-orders',
        {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            key_facts: { type: 'array', items: { type: 'string' } },
            uncertainty: { type: 'number' },
          },
          required: ['answer', 'key_facts', 'uncertainty'],
        },
        { field: 'uncertainty', value: 6 },
        'BEST_EFFORT',
      ),
  },
  {
    id: 'ops-monitoring',
    name: 'Operational Monitoring',
    department: 'IT',
    summary: 'Watches operational records continuously and raises alerts on anomalies.',
    maturity: 'CONFIGURATION_EXAMPLE',
    build: (connectionId) => {
      const definition = simpleTemplate(
        {
          name: 'Operational Monitoring',
          description: 'Detects operational anomalies and raises alerts.',
          agentKey: 'ops-monitoring',
          department: 'IT',
        },
        'Review the record for operational anomalies. Count anomalies and describe each.',
        connectionId,
        'invoices',
        {
          type: 'object',
          properties: {
            anomaly_count: { type: 'integer' },
            anomalies: { type: 'array', items: { type: 'string' } },
          },
          required: ['anomaly_count', 'anomalies'],
        },
        { field: 'anomaly_count', value: 1 },
        'CRITICAL',
      );
      return { ...definition, trigger: { type: 'CONTINUOUS' } };
    },
  },
];
