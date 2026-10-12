import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataConnection } from '@prisma/client';
import { AgentDefinition, ConnectionResource, ConnectionView } from '@app-starter/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AmberdAccessService } from '../amberd-access.service';
import { AmberdBootstrapService } from '../amberd-bootstrap.service';
import {
  ConnectorDocument,
  EnterpriseConnector,
  parseResourceId,
} from './enterprise-connector.interface';
import { LocalDocumentConnector } from './local-document.connector';
import { DRIVE_SELECTED_FILES, GoogleDriveConnector, GoogleDriveConfig } from './google-drive.connector';
import { GoogleDriveError, isGooglePickerConfigured } from './google-drive.client';
import { UnsupportedDocumentError } from './document-text';

export class ResourceAccessDeniedException extends ForbiddenException {
  constructor(resourceId: string, reason: string) {
    super(`Access to resource "${resourceId}" denied: ${reason}`);
  }
}

export class ResourceNotFoundException extends NotFoundException {
  constructor(resourceId: string) {
    super(`Document not found in the connected repository: ${resourceId}`);
  }
}

/**
 * Resolves connections for an organization and enforces their permissions
 * server-side before any connector is asked for data.
 */
@Injectable()
export class ConnectionsService {
  private readonly connectors = new Map<string, EnterpriseConnector>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AmberdAccessService,
    private readonly bootstrap: AmberdBootstrapService,
  ) {
    this.register(new LocalDocumentConnector());
    this.register(this.googleDrive);
  }

  readonly googleDrive = new GoogleDriveConnector();

  register(connector: EnterpriseConnector): void {
    this.connectors.set(connector.type, connector);
  }

  async list(userId: string, organizationId: string): Promise<ConnectionView[]> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);

    const [connections, agents] = await Promise.all([
      this.prisma.dataConnection.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.agent.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, name: true, definition: true },
      }),
    ]);

    return connections.map((connection) => this.toView(connection, agents));
  }

  async listResources(
    userId: string,
    organizationId: string,
    connectionId: string,
    collection: string,
  ): Promise<ConnectionResource[]> {
    await this.access.requireMember(userId, organizationId);
    const connection = await this.loadScoped(organizationId, connectionId);
    this.assertCollectionAuthorized(connection, collection, `${collection}/*`);
    this.assertPermission(connection, 'list', `${collection}/*`);

    const connector = this.connectorFor(connection);
    const resources = await this.callConnector(collection, () =>
      connector.listResources(this.configOf(connection), collection),
    );
    return resources.map((resource) => ({ ...resource, updatedAt: resource.updatedAt.toISOString() }));
  }

  async preview(
    userId: string,
    organizationId: string,
    connectionId: string,
    resourceId: string,
  ): Promise<{ id: string; title: string; content: string }> {
    await this.access.requireMember(userId, organizationId);
    const document = await this.readAuthorized(organizationId, connectionId, resourceId, null);
    return { id: document.id, title: document.title, content: document.content };
  }

  /**
   * The single entry point the execution engine uses to obtain data.
   *
   * Checks run in order: the resource id is well formed, the connection belongs
   * to the organization and is connected, the collection is authorized on the
   * connection, the connection grants `read`, and — when an agent scope is
   * given — the agent itself was granted that collection.
   */
  async readAuthorized(
    organizationId: string,
    connectionId: string,
    resourceId: string,
    agentScope: AgentDefinition['dataInputs'][number] | null,
  ): Promise<ConnectorDocument> {
    const parsed = parseResourceId(resourceId);
    if (!parsed) throw new ResourceAccessDeniedException(resourceId, 'malformed resource id');

    const connection = await this.loadScoped(organizationId, connectionId);
    if (connection.status !== 'CONNECTED') {
      throw new ResourceAccessDeniedException(resourceId, `connection "${connection.name}" is not connected`);
    }
    this.assertCollectionAuthorized(connection, parsed.collection, resourceId);
    this.assertPermission(connection, 'read', resourceId);
    if (agentScope && !agentScope.resources.includes(parsed.collection)) {
      throw new ResourceAccessDeniedException(resourceId, 'the agent is not authorized for this collection');
    }
    if (agentScope && !agentScope.operations.includes('read')) {
      throw new ResourceAccessDeniedException(resourceId, 'the agent is not granted read access');
    }

    const connector = this.connectorFor(connection);
    const document = await this.callConnector(resourceId, () =>
      connector.readResource(this.configOf(connection), resourceId),
    );
    if (!document) throw new ResourceNotFoundException(resourceId);

    await this.prisma.dataConnection.update({
      where: { id: connection.id },
      data: { lastActivityAt: new Date() },
    });
    return document;
  }

  async loadScoped(organizationId: string, connectionId: string): Promise<DataConnection> {
    const connection = await this.prisma.dataConnection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!connection) throw new NotFoundException(`Data connection not found: ${connectionId}`);
    return connection;
  }

  /** Translate connector failures into clear, user-facing HTTP errors. */
  private async callConnector<T>(resourceId: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof GoogleDriveError) {
        if (error.status === 403) throw new ResourceAccessDeniedException(resourceId, error.message);
        if (error.status === 404) throw new ResourceNotFoundException(resourceId);
        throw new BadGatewayException(error.message);
      }
      if (error instanceof UnsupportedDocumentError) {
        throw new UnprocessableEntityException(`${resourceId}: ${error.message}`);
      }
      throw error;
    }
  }

  private assertCollectionAuthorized(connection: DataConnection, collection: string, resourceId: string): void {
    if (!connection.authorizedResources.includes(collection)) {
      throw new ResourceAccessDeniedException(
        resourceId,
        `"${collection}" is not an authorized resource of connection "${connection.name}"`,
      );
    }
  }

  private assertPermission(connection: DataConnection, operation: string, resourceId: string): void {
    if (!connection.permissions.includes(operation)) {
      throw new ResourceAccessDeniedException(resourceId, `connection does not grant "${operation}"`);
    }
  }

  private connectorFor(connection: DataConnection): EnterpriseConnector {
    const connector = this.connectors.get(connection.type);
    if (!connector) {
      throw new ForbiddenException(`Connector type ${connection.type} is not configured in this deployment`);
    }
    return connector;
  }

  private configOf(connection: DataConnection): Record<string, unknown> {
    return (connection.config ?? {}) as Record<string, unknown>;
  }

  private toView(
    connection: DataConnection,
    agents: Array<{ id: string; name: string; definition: unknown }>,
  ): ConnectionView {
    const connectedAgents = agents
      .filter((agent) =>
        ((agent.definition as AgentDefinition)?.dataInputs ?? []).some(
          (input) => input.connectionId === connection.id,
        ),
      )
      .map(({ id, name }) => ({ id, name }));

    const config = this.configOf(connection) as Partial<GoogleDriveConfig>;
    const isDrive = connection.type === 'GOOGLE_DRIVE';
    const isDriveLinked = isDrive && Boolean(config.encryptedRefreshToken);
    return {
      id: connection.id,
      name: connection.name,
      type: connection.type,
      category: connection.category,
      // Drive status reflects reality: server credentials, then the org's sign-in.
      status: isDrive
        ? isDriveLinked
          ? 'CONNECTED'
          : isGooglePickerConfigured()
            ? 'NOT_CONNECTED'
            : 'NOT_CONFIGURED'
        : connection.status,
      description: connection.description,
      isSimulated: connection.isSimulated,
      authorizedResources: connection.authorizedResources,
      permissions: connection.permissions,
      connectedAgents,
      lastActivityAt: connection.lastActivityAt?.toISOString() ?? null,
      resourceNames: isDrive
        ? {
            ...(config.resourceNames ?? {}),
            [DRIVE_SELECTED_FILES]: {
              name: `Files selected in Google Drive (${Object.keys(config.resourceNames ?? {}).length})`,
              type: 'file' as const,
            },
          }
        : {},
      accountEmail: isDrive ? (config.accountEmail ?? null) : null,
      isOAuthConfigured: isDrive ? isGooglePickerConfigured() : null,
    };
  }
}
