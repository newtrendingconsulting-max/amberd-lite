// Acceptance tests for the Invoice Audit Agent running on the generic engine.
//
// Everything is real except the database (an in-memory stand-in) and the model:
// the stand-in provider reads the documents out of the prompt it receives and
// extracts fields with regular expressions, the way a faithful model would. It
// is never told the expected result, so the discrepancy still has to come from
// the documents and the backend reconciliation.
import * as path from 'path';
import { AgentDefinition, invoiceAuditDefinition } from '@app-starter/shared';
import { ExecutionEngineService } from './execution-engine.service';
import { ConnectionsService } from '../connectors/connections.service';
import { LocalDocumentConnector } from '../connectors/local-document.connector';
import { LlmRegistryService } from '../llm/llm-registry.service';
import { LlmExecutionError, LlmProvider, LlmRequest, LlmResult } from '../llm/llm.types';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CONNECTION_ID = 'conn-finance';

const money = (text: string): number => Number(text.replace(/[$,]/g, ''));

/** Extracts one document the way the output schema asks for it. */
const extractDocument = (content: string) => {
  const line = /^\s*\d+\s+(.+?)\s{2,}(\d+)\s+(\$[\d,]+\.\d{2})\s+(\$[\d,]+\.\d{2})\s*$/m.exec(content);
  const total = /TOTAL(?: DUE)?:\s+(\$[\d,]+\.\d{2})/.exec(content);
  return {
    document_id: (/(?:Purchase Order Number|Invoice Number):\s*(\S+)/.exec(content) ?? [])[1] ?? '',
    supplier: (/Supplier:\s*(.+)/.exec(content) ?? [])[1]?.trim() ?? content.split('\n')[0].trim(),
    currency: (/Currency:\s*(\w+)/.exec(content) ?? [])[1] ?? '',
    payment_terms: (/Payment Terms:\s*(.+)/.exec(content) ?? [])[1]?.trim() ?? '',
    line_items: line
      ? [{ description: line[1].trim(), quantity: Number(line[2]), unit_price: money(line[3]), line_total: money(line[4]) }]
      : [],
    stated_total: total ? money(total[1]) : 0,
    purchase_order_reference: (/Purchase Order Reference:\s*(\S+)/.exec(content) ?? [])[1] ?? '',
  };
};

class DocumentReadingProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly requests: LlmRequest[] = [];
  isConfigured(): boolean {
    return true;
  }
  async complete(request: LlmRequest): Promise<LlmResult> {
    this.requests.push(request);
    const documents = Array.from(request.prompt.matchAll(/<document label="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/document>/g));
    const po = documents.find(([, label]) => label === 'Purchase order')?.[2] ?? '';
    const invoice = documents.find(([, label]) => label === 'Supplier invoice')?.[2] ?? '';
    const { purchase_order_reference: _ignored, ...purchaseOrder } = extractDocument(po);
    const invoiceDoc = extractDocument(invoice);
    invoiceDoc.supplier = 'Acme Technology Solutions';
    return {
      output: { purchase_order: purchaseOrder, invoice: invoiceDoc, observations: [] },
      inputTokens: 1200,
      outputTokens: 300,
      stopReason: 'end_turn',
      latencyMs: 5,
    };
  }
}

class FailingProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  isConfigured(): boolean {
    return true;
  }
  async complete(): Promise<LlmResult> {
    throw new LlmExecutionError('Anthropic API error 503: overloaded', 'API_ERROR');
  }
}

const buildHarness = (provider: LlmProvider, definition: AgentDefinition = invoiceAuditDefinition(CONNECTION_ID)) => {
  const runs = new Map<string, Record<string, any>>();
  const actions: Array<Record<string, any>> = [];
  const connection = {
    id: CONNECTION_ID,
    organizationId: ORG_ID,
    name: 'Finance Document Repository',
    type: 'LOCAL_DOCUMENTS',
    status: 'CONNECTED',
    authorizedResources: ['purchase-orders', 'invoices'],
    permissions: ['list', 'read'],
    config: {},
  };
  const prisma: any = {
    agent: {
      findFirst: jest.fn(async ({ where }) =>
        where.id === 'agent-1' && where.organizationId === ORG_ID
          ? { id: 'agent-1', organizationId: ORG_ID, name: 'Invoice Audit Agent', status: 'ACTIVE', definition }
          : null,
      ),
    },
    resourcePolicy: { findUnique: jest.fn(async () => ({ maxConcurrentRuns: 3, spendCapUsd: 50, spendWindowDays: 30, timeoutSeconds: 180 })) },
    agentRun: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { costUsd: 0 } })),
      create: jest.fn(async ({ data }) => {
        const run = { id: `run-${runs.size + 1}`, startedAt: new Date(), ...data };
        runs.set(run.id, run);
        return run;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(runs.get(where.id)!, data)),
    },
    runAction: { create: jest.fn(async ({ data }) => (actions.push(data), data)) },
    organizationMember: { findMany: jest.fn(async () => [{ userId: 'admin-1' }]) },
    dataConnection: {
      findFirst: jest.fn(async ({ where }) =>
        where.id === connection.id && where.organizationId === ORG_ID ? connection : null,
      ),
      update: jest.fn(async () => connection),
    },
  };
  const access: any = { requireMember: jest.fn(), log: jest.fn() };
  const notifications: any = { createNotification: jest.fn() };
  const email: any = { sendEmail: jest.fn(async () => ({ messageId: 'msg-1' })) };
  const connections = new ConnectionsService(prisma, access, {} as any);
  connections.register(new LocalDocumentConnector(path.resolve(__dirname, '../../../enterprise-docs')));
  const llm = new LlmRegistryService();
  llm.register(provider);
  const engine = new ExecutionEngineService(prisma, access, connections, llm, notifications, email);
  return { engine, runs, actions, notifications, prisma, email };
};

describe('Invoice Audit Agent acceptance', () => {
  it('TEST 1 — detects the $700 overbilling, flags it, and notifies without human approval', async () => {
    const provider = new DocumentReadingProvider();
    const { engine, runs, actions, notifications } = buildHarness(provider);

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'PO-2026-1042',
      invoice_id: 'INV-2026-2087',
    });

    const run = runs.get(actualResult.runId)!;
    expect(actualResult.status).toBe('SUCCEEDED');
    expect(run.outcome).toBe('FLAGGED');
    expect(run.report.discrepancyAmount).toBe(700);
    expect(run.report.purchaseOrderTotal).toBe(8500);
    expect(run.report.invoiceTotal).toBe(9200);
    expect(run.report.auditStatus).toBe('FLAGGED');
    expect(run.report.approvalRequired).toBe(false);
    expect(actions.some((a) => a.type === 'REQUEST_APPROVAL')).toBe(false);
    expect(actions.filter((a) => a.type !== 'SEND_EMAIL').every((a) => a.status === 'COMPLETED')).toBe(true);
    expect(actions.find((a) => a.type === 'FLAG_DISCREPANCY')?.status).toBe('COMPLETED');
    expect(notifications.createNotification).toHaveBeenCalled();
    expect(run.costUsd).toBeGreaterThan(0);
    // The model is never handed the answer.
    expect(provider.requests[0].prompt).not.toMatch(/700/);
    expect(run.report.discrepancies.map((d: { type: string }) => d.type)).toEqual(['UNIT_PRICE', 'TOTAL']);
    expect(run.report.discrepancies[0]).toMatchObject({ expected: '$850.00', actual: '$920.00', amount_impact: 700 });
    expect(run.report.sourceDocuments.map((d: { title: string }) => d.title)).toEqual(['PO-2026-1042', 'INV-2026-2087']);
  });

  it('emails the report with the PDF attached to the recipients given at run time', async () => {
    const { engine, runs, actions, email } = buildHarness(new DocumentReadingProvider());

    const actualResult = await engine.execute(
      USER_ID,
      ORG_ID,
      'agent-1',
      { purchase_order_id: 'PO-2026-1042', invoice_id: 'INV-2026-2087' },
      'MANUAL',
      { emailRecipients: ['Finance@Example.com', 'cfo@example.com'] },
    );

    expect(runs.get(actualResult.runId)!.status).toBe('SUCCEEDED');
    const sent = actions.find((a) => a.type === 'SEND_EMAIL')!;
    expect(sent.status).toBe('COMPLETED');
    expect(sent.detail.deliveries).toEqual([
      { recipient: 'finance@example.com', status: 'SENT', messageId: 'msg-1' },
      { recipient: 'cfo@example.com', status: 'SENT', messageId: 'msg-1' },
    ]);
    const [, subject, , , options] = email.sendEmail.mock.calls[0];
    expect(subject).toContain('$700.00 discrepancy');
    expect(options.attachments[0].filename).toMatch(/\.pdf$/);
    expect(options.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('records a failed email action (not a failed audit) when delivery fails', async () => {
    const { engine, runs, actions, email } = buildHarness(new DocumentReadingProvider());
    email.sendEmail.mockRejectedValueOnce(new Error('Failed to send email'));

    const actualResult = await engine.execute(
      USER_ID,
      ORG_ID,
      'agent-1',
      { purchase_order_id: 'PO-2026-1042', invoice_id: 'INV-2026-2087' },
      'MANUAL',
      { emailRecipients: ['finance@example.com'] },
    );

    expect(runs.get(actualResult.runId)!.status).toBe('SUCCEEDED');
    const sent = actions.find((a) => a.type === 'SEND_EMAIL')!;
    expect(sent.status).toBe('FAILED');
    expect(sent.detail.deliveries[0]).toMatchObject({ recipient: 'finance@example.com', status: 'FAILED' });
  });

  it('marks the email action failed when no recipients were given', async () => {
    const { engine, actions, email } = buildHarness(new DocumentReadingProvider());

    await engine.execute(USER_ID, ORG_ID, 'agent-1', { purchase_order_id: 'PO-2026-1042', invoice_id: 'INV-2026-2087' });

    expect(actions.find((a) => a.type === 'SEND_EMAIL')?.status).toBe('FAILED');
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid recipient before running', async () => {
    const { engine } = buildHarness(new DocumentReadingProvider());

    await expect(
      engine.execute(USER_ID, ORG_ID, 'agent-1', { purchase_order_id: 'PO-2026-1042', invoice_id: 'INV-2026-2087' }, 'MANUAL', {
        emailRecipients: ['not-an-email'],
      }),
    ).rejects.toThrow(/Invalid email address/);
  });

  it('TEST 2 — passes a matching invoice with no approval', async () => {
    const { engine, runs, actions } = buildHarness(new DocumentReadingProvider());

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'PO-2026-1042',
      invoice_id: 'INV-2026-2091',
    });

    const run = runs.get(actualResult.runId)!;
    expect(actualResult.status).toBe('SUCCEEDED');
    expect(run.outcome).toBe('PASSED');
    expect(run.report.discrepancyAmount).toBe(0);
    expect(run.report.approvalRequired).toBe(false);
    expect(actions.some((a) => a.type === 'REQUEST_APPROVAL')).toBe(false);
    expect(actions.find((a) => a.type === 'MARK_PASSED')?.status).toBe('COMPLETED');
  });

  it('TEST 3 — denies a resource the connection does not authorize', async () => {
    const provider = new DocumentReadingProvider();
    const { engine, runs } = buildHarness(provider);
    const harness = buildHarness(provider);

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'hr-confidential/compensation-review-2026',
      invoice_id: 'INV-2026-2087',
    });

    expect(actualResult.status).toBe('FAILED');
    expect(runs.get(actualResult.runId)!.error).toMatch(/denied/);
    expect(provider.requests).toHaveLength(0);
    await expect(
      harness.engine['connections'].readAuthorized(ORG_ID, CONNECTION_ID, 'hr-confidential/compensation-review-2026', null),
    ).rejects.toThrow(/not an authorized resource/);
  });

  it('TEST 4 — fails clearly when the document does not exist', async () => {
    const { engine, runs } = buildHarness(new DocumentReadingProvider());

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'PO-9999-0000',
      invoice_id: 'INV-2026-2087',
    });

    const run = runs.get(actualResult.runId)!;
    expect(actualResult.status).toBe('FAILED');
    expect(run.error).toMatch(/Document not found/);
    expect(run.report).toBeUndefined();
  });

  it('TEST 5 — records a failed run and no result when the model call fails', async () => {
    const { engine, runs, actions } = buildHarness(new FailingProvider());

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'PO-2026-1042',
      invoice_id: 'INV-2026-2087',
    });

    const run = runs.get(actualResult.runId)!;
    expect(actualResult.status).toBe('FAILED');
    expect(run.error).toMatch(/503/);
    expect(run.report).toBeUndefined();
    expect(run.results).toBeUndefined();
    expect(actions).toHaveLength(0);
  });

  it('TEST 5b — fails when the selected model is not configured for its provider', async () => {
    const definition = invoiceAuditDefinition(CONNECTION_ID);
    definition.llm = { ...definition.llm, provider: 'openai', model: 'openai-gpt' };
    const { engine, runs } = buildHarness(new DocumentReadingProvider(), definition);

    const actualResult = await engine.execute(USER_ID, ORG_ID, 'agent-1', {
      purchase_order_id: 'PO-2026-1042',
      invoice_id: 'INV-2026-2087',
    });

    expect(actualResult.status).toBe('FAILED');
    expect(runs.get(actualResult.runId)!.error).toMatch(/not integrated/);
  });
});
