import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Agent, AgentRunStatus, AgentStatus, Prisma } from '@prisma/client';
import {
  AgentDefinition,
  AgentDetail,
  AgentSummary,
  DefinitionValidationError,
  PriorityTier,
  validateAgentDefinition,
} from '@app-starter/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AmberdAccessService } from './amberd-access.service';
import { AmberdBootstrapService } from './amberd-bootstrap.service';

/** Organization-scoped agent lifecycle, shaped after ProjectsService. */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AmberdAccessService,
    private readonly bootstrap: AmberdBootstrapService,
  ) {}

  async list(userId: string, organizationId: string): Promise<AgentSummary[]> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);

    const agents = await this.prisma.agent.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const stats = await this.statsFor(organizationId);
    return agents.map((agent) => this.toSummary(agent, stats.get(agent.id)));
  }

  async get(userId: string, organizationId: string, agentId: string): Promise<AgentDetail> {
    await this.access.requireMember(userId, organizationId);
    const agent = await this.loadScoped(organizationId, agentId);
    const stats = await this.statsFor(organizationId, agent.id);
    return { ...this.toSummary(agent, stats.get(agent.id)), definition: agent.definition as unknown as AgentDefinition };
  }

  /** Full validation: schema checks plus references that need the database. */
  async validate(
    userId: string,
    organizationId: string,
    definition: unknown,
    excludeAgentId?: string,
  ): Promise<{ isValid: boolean; errors: DefinitionValidationError[] }> {
    await this.access.requireMember(userId, organizationId);
    return this.validateInternal(organizationId, definition, excludeAgentId);
  }

  async create(userId: string, organizationId: string, definition: unknown, source: string): Promise<AgentDetail> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);
    const valid = await this.assertValid(organizationId, definition);

    const agent = await this.prisma.agent.create({
      data: { organizationId, createdById: userId, ...this.columnsFrom(valid) },
    });
    await this.access.log(organizationId, userId, 'info', 'agents', `Agent created (${source}): ${agent.name}`, {
      agentId: agent.id,
    });
    return this.get(userId, organizationId, agent.id);
  }

  async update(userId: string, organizationId: string, agentId: string, definition: unknown): Promise<AgentDetail> {
    await this.access.requireMember(userId, organizationId);
    const existing = await this.loadScoped(organizationId, agentId);
    const valid = await this.assertValid(organizationId, definition, existing.id);

    await this.prisma.agent.update({ where: { id: existing.id }, data: this.columnsFrom(valid) });
    await this.access.log(organizationId, userId, 'info', 'agents', `Agent updated: ${valid.identity.name}`, {
      agentId,
    });
    return this.get(userId, organizationId, agentId);
  }

  async duplicate(userId: string, organizationId: string, agentId: string): Promise<AgentDetail> {
    await this.access.requireMember(userId, organizationId);
    const source = await this.loadScoped(organizationId, agentId);
    const definition = source.definition as unknown as AgentDefinition;
    const copy: AgentDefinition = {
      ...definition,
      identity: {
        ...definition.identity,
        name: `${definition.identity.name} (copy)`.slice(0, 120),
        agentKey: `${definition.identity.agentKey}-copy`.slice(0, 64),
        status: 'DRAFT',
      },
    };
    return this.create(userId, organizationId, copy, `duplicate of ${source.name}`);
  }

  async setStatus(
    userId: string,
    organizationId: string,
    agentId: string,
    status: AgentStatus,
  ): Promise<AgentDetail> {
    await this.access.requireManager(userId, organizationId, 'change agent status');
    const agent = await this.loadScoped(organizationId, agentId);
    const definition = agent.definition as unknown as AgentDefinition;
    const updated: AgentDefinition = { ...definition, identity: { ...definition.identity, status } };
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { status, definition: updated as unknown as Prisma.InputJsonValue },
    });
    await this.access.log(organizationId, userId, 'info', 'agents', `Agent ${agent.name} set to ${status}`, { agentId });
    return this.get(userId, organizationId, agentId);
  }

  async archive(userId: string, organizationId: string, agentId: string): Promise<void> {
    await this.access.requireManager(userId, organizationId, 'archive agents');
    const agent = await this.loadScoped(organizationId, agentId);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { archivedAt: new Date(), status: AgentStatus.INACTIVE },
    });
    await this.access.log(organizationId, userId, 'warn', 'agents', `Agent archived: ${agent.name}`, { agentId });
  }

  async loadScoped(organizationId: string, agentId: string): Promise<Agent> {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, organizationId, archivedAt: null } });
    if (!agent) throw new NotFoundException(`Agent not found: ${agentId}`);
    return agent;
  }

  private async assertValid(
    organizationId: string,
    definition: unknown,
    excludeAgentId?: string,
  ): Promise<AgentDefinition> {
    const result = await this.validateInternal(organizationId, definition, excludeAgentId);
    if (!result.isValid) {
      throw new BadRequestException(
        `Agent definition is invalid: ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
      );
    }
    return definition as AgentDefinition;
  }

  private async validateInternal(
    organizationId: string,
    definition: unknown,
    excludeAgentId?: string,
  ): Promise<{ isValid: boolean; errors: DefinitionValidationError[] }> {
    const result = validateAgentDefinition(definition);
    if (!result.isValid) return result;

    const valid = definition as AgentDefinition;
    const errors: DefinitionValidationError[] = [];
    const policy = await this.prisma.resourcePolicy.findUnique({ where: { organizationId } });

    for (const [index, input] of valid.dataInputs.entries()) {
      const connection = await this.prisma.dataConnection.findFirst({
        where: { id: input.connectionId, organizationId },
      });
      if (!connection) {
        errors.push({ path: `dataInputs[${index}].connectionId`, message: 'Connection not found in this organization' });
        continue;
      }
      // Authorization is checked at save time as well as at run time.
      input.resources.forEach((resource) => {
        if (!connection.authorizedResources.includes(resource)) {
          errors.push({
            path: `dataInputs[${index}].resources`,
            message: `"${resource}" is not an authorized resource of ${connection.name}`,
          });
        }
      });
      if (policy) {
        const agents = await this.prisma.agent.findMany({
          where: { organizationId, archivedAt: null, ...(excludeAgentId ? { id: { not: excludeAgentId } } : {}) },
          select: { definition: true },
        });
        const usage = agents.filter((agent) =>
          ((agent.definition as unknown as AgentDefinition)?.dataInputs ?? []).some(
            (other) => other.connectionId === input.connectionId,
          ),
        ).length;
        if (usage >= policy.maxConnectionsPerSource) {
          errors.push({
            path: `dataInputs[${index}].connectionId`,
            message: `Resource policy allows at most ${policy.maxConnectionsPerSource} agents per data source (${connection.name} has ${usage})`,
          });
        }
      }
    }
    return { isValid: errors.length === 0, errors };
  }

  private columnsFrom(definition: AgentDefinition) {
    return {
      name: definition.identity.name,
      description: definition.identity.description || null,
      department: definition.identity.department,
      status: definition.identity.status as AgentStatus,
      provider: definition.llm.provider,
      model: definition.llm.model,
      triggerType: definition.trigger.type,
      priorityTier: definition.resourceLimits.priorityTier,
      definition: definition as unknown as Prisma.InputJsonValue,
    };
  }

  private async statsFor(organizationId: string, agentId?: string) {
    const where = { organizationId, ...(agentId ? { agentId } : {}) };
    const [grouped, latest] = await Promise.all([
      this.prisma.agentRun.groupBy({ by: ['agentId'], where, _count: { _all: true }, _sum: { costUsd: true } }),
      this.prisma.agentRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        distinct: ['agentId'],
        select: { agentId: true, startedAt: true, status: true },
      }),
    ]);
    const map = new Map<string, { runs: number; cost: number; lastRunAt: Date | null; lastStatus: AgentRunStatus | null }>();
    grouped.forEach((row) =>
      map.set(row.agentId, { runs: row._count._all, cost: row._sum.costUsd ?? 0, lastRunAt: null, lastStatus: null }),
    );
    latest.forEach((row) => {
      const entry = map.get(row.agentId);
      if (entry) {
        entry.lastRunAt = row.startedAt;
        entry.lastStatus = row.status;
      }
    });
    return map;
  }

  private toSummary(
    agent: Agent,
    stats?: { runs: number; cost: number; lastRunAt: Date | null; lastStatus: AgentRunStatus | null },
  ): AgentSummary {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      department: agent.department,
      status: agent.status,
      provider: agent.provider,
      model: agent.model,
      triggerType: agent.triggerType,
      priorityTier: agent.priorityTier as PriorityTier,
      runCount: stats?.runs ?? 0,
      lastRunAt: stats?.lastRunAt?.toISOString() ?? null,
      lastRunStatus: stats?.lastStatus ?? null,
      estimatedCostUsd: stats?.cost ?? 0,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }
}
