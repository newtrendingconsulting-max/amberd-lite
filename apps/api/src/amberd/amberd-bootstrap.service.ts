import { Injectable, Logger } from '@nestjs/common';
import { AgentStatus, Prisma } from '@prisma/client';
import { AgentDefinition, invoiceAuditDefinition } from '@app-starter/shared';
import { PrismaService } from '../prisma/prisma.service';

const SEMANTIC_LAYER_EXAMPLE = `# Optional semantic layer — governs what agents may query
dataset: accounts_payable
business_name: Accounts Payable Ledger
fields:
  - name: invoice_number
    type: string
    description: Supplier invoice identifier
    allowed: true
  - name: amount_usd
    type: decimal
    description: Invoice amount in USD
    allowed: true
  - name: supplier_bank_account
    type: string
    description: Remittance bank account
    allowed: false   # restricted — never exposed to models
operations: [select, aggregate]
rules:
  - Only invoices for the caller's organization are visible
`;

/**
 * Provisions the per-organization defaults Amberd Lite needs: a resource policy,
 * the connection catalog, and the Invoice Audit Agent.
 *
 * Runs lazily the first time an organization opens Amberd Lite, so new
 * organizations get a working environment without a separate seed step. The
 * resource policy row doubles as the "already provisioned" marker.
 */
@Injectable()
export class AmberdBootstrapService {
  private readonly logger = new Logger(AmberdBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(organizationId: string, actorId: string): Promise<void> {
    const existing = await this.prisma.resourcePolicy.findUnique({ where: { organizationId } });
    if (existing) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.resourcePolicy.create({ data: { organizationId } });

        const repository = await tx.dataConnection.create({
          data: {
            organizationId,
            name: 'Finance Document Repository',
            type: 'LOCAL_DOCUMENTS',
            category: 'Storage',
            status: 'CONNECTED',
            isSimulated: true,
            description:
              'Local Enterprise Document Connector serving purchase orders and supplier invoices. Simulated enterprise integration — not a live Google Drive connection.',
            authorizedResources: ['purchase-orders', 'invoices'],
            permissions: ['list', 'read'],
            config: { repository: 'enterprise-docs' },
          },
        });

        await tx.dataConnection.createMany({
          data: [
            {
              organizationId,
              name: 'Google Drive — Finance Shared Drive',
              type: 'GOOGLE_DRIVE',
              category: 'Google Drive',
              status: 'NOT_CONFIGURED',
              description: 'Requires Google OAuth credentials. Not configured in this hackathon build.',
              authorizedResources: [],
              permissions: [],
            },
            {
              organizationId,
              name: 'Finance Data Warehouse (PostgreSQL)',
              type: 'DATABASE',
              category: 'Databases',
              status: 'NOT_CONFIGURED',
              description: 'Governed SQL access through an optional YAML semantic layer. Not configured.',
              authorizedResources: [],
              permissions: [],
              config: { semanticLayer: SEMANTIC_LAYER_EXAMPLE },
            },
            {
              organizationId,
              name: 'ERP REST API',
              type: 'API',
              category: 'APIs',
              status: 'NOT_CONFIGURED',
              description: 'Supplier and payment records from the ERP. Not configured.',
              authorizedResources: [],
              permissions: [],
            },
            {
              organizationId,
              name: 'Object Storage (S3 / R2)',
              type: 'OBJECT_STORAGE',
              category: 'Storage',
              status: 'NOT_CONFIGURED',
              description: 'Bucket-based document storage. Not configured.',
              authorizedResources: [],
              permissions: [],
            },
          ],
        });

        const definition: AgentDefinition = invoiceAuditDefinition(repository.id);
        await tx.agent.create({
          data: {
            organizationId,
            createdById: actorId,
            name: definition.identity.name,
            description: definition.identity.description,
            department: definition.identity.department,
            status: AgentStatus.ACTIVE,
            provider: definition.llm.provider,
            model: definition.llm.model,
            triggerType: definition.trigger.type,
            priorityTier: definition.resourceLimits.priorityTier,
            definition: definition as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.platformLog.create({
          data: {
            organizationId,
            actorId,
            level: 'info',
            category: 'platform',
            message: 'Amberd Lite environment provisioned (policy, connections, Invoice Audit Agent)',
          },
        });
      });
    } catch (error) {
      // A concurrent request provisioned first; the unique policy row makes this safe.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      this.logger.error(`Provisioning failed for ${organizationId}`, error as Error);
      throw error;
    }
  }
}
