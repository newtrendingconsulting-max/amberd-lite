import { Injectable } from '@nestjs/common';
import { AgentRunStatus, RunActionStatus } from '@prisma/client';
import {
  AGENT_TEMPLATES,
  CostBreakdownRow,
  CostsView,
  MODEL_CATALOG,
  ModelView,
  OverviewView,
  PlatformLogView,
  PriorityTier,
  ResourcePolicyView,
  findCatalogModel,
} from '@app-starter/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AmberdAccessService } from './amberd-access.service';
import { AmberdBootstrapService } from './amberd-bootstrap.service';
import { LlmRegistryService } from './llm/llm-registry.service';
import { isGooglePickerConfigured } from './connectors/google-drive.client';
import { UpdatePolicyDto } from './dto/amberd.dto';

interface RunRow {
  agentId: string;
  status: AgentRunStatus;
  startedAt: Date;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  model: string | null;
  agent: { name: string; department: string };
}

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Aggregations behind the Overview, Costs, Models, Policies, and Logs pages. */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AmberdAccessService,
    private readonly bootstrap: AmberdBootstrapService,
    private readonly llm: LlmRegistryService,
  ) {}

  async overview(userId: string, organizationId: string): Promise<OverviewView> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);

    const [agents, runs, actions, failedRuns] = await Promise.all([
      this.prisma.agent.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, status: true } }),
      this.loadRuns(organizationId),
      this.prisma.runAction.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { run: { select: { agent: { select: { name: true } } } } },
      }),
      this.prisma.agentRun.findMany({
        where: { organizationId, status: AgentRunStatus.FAILED },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { agent: { select: { name: true } } },
      }),
    ]);

    const latestByAgent = new Map<string, AgentRunStatus>();
    runs.forEach((run) => {
      if (!latestByAgent.has(run.agentId)) latestByAgent.set(run.agentId, run.status);
    });

    const finished = runs.filter((r) => r.status !== AgentRunStatus.RUNNING);
    const succeeded = runs.filter((r) => r.status === AgentRunStatus.SUCCEEDED).length;
    const failed = runs.filter((r) => r.status === AgentRunStatus.FAILED).length;
    const durations = finished.map((r) => r.durationMs).filter((d): d is number => d !== null);

    const activity = new Map<string, { runs: number; failed: number }>();
    for (let i = 13; i >= 0; i -= 1) activity.set(dayKey(new Date(Date.now() - i * 86_400_000)), { runs: 0, failed: 0 });
    runs.forEach((run) => {
      const entry = activity.get(dayKey(run.startedAt));
      if (entry) {
        entry.runs += 1;
        if (run.status === AgentRunStatus.FAILED) entry.failed += 1;
      }
    });

    const alerts: OverviewView['alerts'] = [];
    actions.forEach((action) => {
      const agentName = action.run.agent.name;
      if (action.type === 'FLAG_DISCREPANCY' && action.status === RunActionStatus.COMPLETED) {
        alerts.push({
          id: action.id,
          kind: 'PROBLEM_DETECTED',
          title: `${agentName}: problem detected`,
          detail: action.label,
          runId: action.runId,
          createdAt: action.createdAt.toISOString(),
        });
      } else if (action.status === RunActionStatus.FAILED) {
        alerts.push({
          id: action.id,
          kind: 'ACTION_FAILED',
          title: `${agentName}: action failed`,
          detail: action.label,
          runId: action.runId,
          createdAt: action.createdAt.toISOString(),
        });
      } else if (action.status === RunActionStatus.APPROVED || action.status === RunActionStatus.REJECTED) {
        alerts.push({
          id: action.id,
          kind: 'ACTION_COMPLETED',
          title: `${agentName}: approval ${action.status.toLowerCase()}`,
          detail: action.label,
          runId: action.runId,
          createdAt: (action.decidedAt ?? action.updatedAt).toISOString(),
        });
      } else if (action.type === 'MARK_PASSED') {
        alerts.push({
          id: action.id,
          kind: 'ACTION_COMPLETED',
          title: `${agentName}: audit passed`,
          detail: action.label,
          runId: action.runId,
          createdAt: action.createdAt.toISOString(),
        });
      }
    });
    failedRuns.forEach((run) =>
      alerts.push({
        id: run.id,
        kind: 'ACTION_FAILED',
        title: `${run.agent.name}: run failed`,
        detail: run.error ?? 'Unknown error',
        runId: run.id,
        createdAt: run.startedAt.toISOString(),
      }),
    );
    alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pendingApprovals = await this.prisma.runAction.count({
      where: { organizationId, status: RunActionStatus.AWAITING_APPROVAL },
    });

    return {
      agents: {
        total: agents.length,
        active: agents.filter((a) => a.status === 'ACTIVE').length,
        inactive: agents.filter((a) => a.status === 'INACTIVE').length,
        draft: agents.filter((a) => a.status === 'DRAFT').length,
        failing: agents.filter((a) => latestByAgent.get(a.id) === AgentRunStatus.FAILED).length,
      },
      runs: {
        total: runs.length,
        succeeded,
        failed,
        running: runs.length - finished.length,
        successRate: finished.length ? succeeded / finished.length : null,
        avgLatencyMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      },
      spend: {
        totalCostUsd: runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
        totalTokens: runs.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
        byAgent: this.breakdown(runs, (r) => [r.agentId, r.agent.name]),
        byDepartment: this.breakdown(runs, (r) => [r.agent.department, r.agent.department]),
      },
      activity: Array.from(activity.entries()).map(([date, value]) => ({ date, ...value })),
      alerts: alerts.slice(0, 12),
      pendingApprovals,
      llmConfigured: this.llm.isConfigured('anthropic'),
    };
  }

  async costs(userId: string, organizationId: string): Promise<CostsView> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);
    const [runs, policy] = await Promise.all([
      this.loadRuns(organizationId),
      this.prisma.resourcePolicy.findUnique({ where: { organizationId } }),
    ]);

    const daily = new Map<string, { costUsd: number; tokens: number }>();
    for (let i = 29; i >= 0; i -= 1) daily.set(dayKey(new Date(Date.now() - i * 86_400_000)), { costUsd: 0, tokens: 0 });
    runs.forEach((run) => {
      const entry = daily.get(dayKey(run.startedAt));
      if (entry) {
        entry.costUsd += run.costUsd ?? 0;
        entry.tokens += run.inputTokens + run.outputTokens;
      }
    });

    const windowDays = policy?.spendWindowDays ?? 30;
    const windowStart = Date.now() - windowDays * 86_400_000;
    return {
      totalCostUsd: runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      totalInputTokens: runs.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: runs.reduce((sum, r) => sum + r.outputTokens, 0),
      unpricedRuns: runs.filter((r) => r.costUsd === null && r.inputTokens + r.outputTokens > 0).length,
      byAgent: this.breakdown(runs, (r) => [r.agentId, r.agent.name]),
      byDepartment: this.breakdown(runs, (r) => [r.agent.department, r.agent.department]),
      byModel: this.breakdown(runs, (r) => [
        r.model ?? 'unknown',
        findCatalogModel(r.model ?? '')?.displayName ?? r.model ?? 'unknown',
      ]),
      daily: Array.from(daily.entries()).map(([date, value]) => ({ date, ...value })),
      windowSpendUsd: runs
        .filter((r) => r.startedAt.getTime() >= windowStart)
        .reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      spendCapUsd: policy?.spendCapUsd ?? 0,
      spendWindowDays: windowDays,
    };
  }

  async models(userId: string, organizationId: string): Promise<ModelView[]> {
    await this.access.requireMember(userId, organizationId);
    const agents = await this.prisma.agent.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true, model: true },
    });
    return MODEL_CATALOG.map((entry) => {
      const isConfigured = entry.isIntegrated && this.llm.isConfigured(entry.provider);
      return {
        ...entry,
        isConfigured,
        availability: !entry.isIntegrated ? 'NOT_INTEGRATED' : isConfigured ? 'AVAILABLE' : 'NOT_CONFIGURED',
        connectedAgents: agents.filter((a) => a.model === entry.model).map(({ id, name }) => ({ id, name })),
      };
    });
  }

  async getPolicy(userId: string, organizationId: string): Promise<ResourcePolicyView> {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);
    const policy = await this.prisma.resourcePolicy.findUniqueOrThrow({ where: { organizationId } });
    return this.toPolicyView(policy);
  }

  async updatePolicy(userId: string, organizationId: string, data: UpdatePolicyDto): Promise<ResourcePolicyView> {
    await this.access.requireManager(userId, organizationId, 'change resource policies');
    await this.bootstrap.ensureDefaults(organizationId, userId);
    const policy = await this.prisma.resourcePolicy.update({ where: { organizationId }, data });
    await this.access.log(organizationId, userId, 'info', 'governance', 'Resource policy updated', {
      ...data,
    });
    return this.toPolicyView(policy);
  }

  /** Reports configuration presence only — never values. */
  async integrationsStatus(userId: string, organizationId: string) {
    await this.access.requireMember(userId, organizationId);
    const smtpHost = process.env.SMTP_HOST ?? 'localhost';
    const isLocalTestInbox = smtpHost === 'localhost' || smtpHost === 'mailpit';
    return {
      email: {
        provider: isLocalTestInbox ? 'Local test inbox (Mailpit)' : smtpHost,
        isLocalTestInbox,
        sender: isLocalTestInbox ? null : (process.env.SMTP_FROM_EMAIL ?? null),
      },
      googleDrive: { isConfigured: isGooglePickerConfigured() },
      anthropic: { isConfigured: this.llm.isConfigured('anthropic') },
    };
  }

  async logs(userId: string, organizationId: string): Promise<PlatformLogView[]> {
    await this.access.requireMember(userId, organizationId);
    const logs = await this.prisma.platformLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return logs.map((log) => ({
      id: log.id,
      level: log.level,
      category: log.category,
      message: log.message,
      actorId: log.actorId,
      data: log.data as Record<string, unknown> | null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async templates(userId: string, organizationId: string) {
    await this.access.requireMember(userId, organizationId);
    await this.bootstrap.ensureDefaults(organizationId, userId);
    const repository = await this.prisma.dataConnection.findFirst({
      where: { organizationId, type: 'LOCAL_DOCUMENTS' },
      orderBy: { createdAt: 'asc' },
    });
    return AGENT_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      department: template.department,
      summary: template.summary,
      maturity: template.maturity,
      definition: template.build(repository?.id ?? ''),
    }));
  }

  /**
   * Illustrative GPU inventory. No GPU infrastructure is connected in this
   * build, so every figure is static demo data and flagged as such; workload
   * rows reflect real agents and their configured priority tiers.
   */
  async gpu(userId: string, organizationId: string) {
    await this.access.requireMember(userId, organizationId);
    const agents = await this.prisma.agent.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true, priorityTier: true, status: true },
    });
    const pools = [
      { id: 'pool-a', name: 'Inference Pool A', gpuModel: 'NVIDIA H100 80GB', total: 8, allocated: 6, utilization: 0.71, status: 'HEALTHY' },
      { id: 'pool-b', name: 'Inference Pool B', gpuModel: 'NVIDIA A100 40GB', total: 8, allocated: 3, utilization: 0.38, status: 'HEALTHY' },
      { id: 'pool-c', name: 'Batch Pool', gpuModel: 'NVIDIA L40S 48GB', total: 4, allocated: 4, utilization: 0.92, status: 'SATURATED' },
    ];
    const tierShare: Record<PriorityTier, number> = { CRITICAL: 0.5, STANDARD: 0.35, BEST_EFFORT: 0.15 };
    return {
      isIllustrative: true,
      pools,
      tiers: (Object.keys(tierShare) as PriorityTier[]).map((tier) => ({
        tier,
        reservedShare: tierShare[tier],
        agents: agents.filter((a) => a.priorityTier === tier).length,
      })),
      workloads: agents.map((agent, index) => ({
        agentId: agent.id,
        name: agent.name,
        priorityTier: agent.priorityTier,
        status: agent.status,
        illustrativeGpuShare: Number((0.05 + ((index * 7) % 10) / 100).toFixed(2)),
      })),
    };
  }

  private async loadRuns(organizationId: string): Promise<RunRow[]> {
    return this.prisma.agentRun.findMany({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
      select: {
        agentId: true,
        status: true,
        startedAt: true,
        durationMs: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        model: true,
        agent: { select: { name: true, department: true } },
      },
    });
  }

  private breakdown(runs: RunRow[], keyOf: (run: RunRow) => [string, string]): CostBreakdownRow[] {
    const map = new Map<string, CostBreakdownRow>();
    runs.forEach((run) => {
      const [key, label] = keyOf(run);
      const row = map.get(key) ?? { key, label, costUsd: 0, inputTokens: 0, outputTokens: 0, runs: 0 };
      row.costUsd += run.costUsd ?? 0;
      row.inputTokens += run.inputTokens;
      row.outputTokens += run.outputTokens;
      row.runs += 1;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
  }

  private toPolicyView(policy: {
    maxConcurrentRuns: number;
    maxConnectionsPerSource: number;
    spendCapUsd: number;
    spendWindowDays: number;
    timeoutSeconds: number;
    defaultPriorityTier: string;
    updatedAt: Date;
  }): ResourcePolicyView {
    return {
      maxConcurrentRuns: policy.maxConcurrentRuns,
      maxConnectionsPerSource: policy.maxConnectionsPerSource,
      spendCapUsd: policy.spendCapUsd,
      spendWindowDays: policy.spendWindowDays,
      timeoutSeconds: policy.timeoutSeconds,
      defaultPriorityTier: policy.defaultPriorityTier as PriorityTier,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }
}
