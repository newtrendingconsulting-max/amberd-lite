import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentRun, Prisma, RunAction, RunActionStatus } from '@prisma/client';
import {
  ConditionEvaluation,
  RunActionView,
  RunDetail,
  RunSummary,
  TimelineStep,
} from '@app-starter/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InAppNotificationService } from '../notifications/services/in-app-notification.service';
import { AmberdAccessService } from './amberd-access.service';
import { renderReportPdf } from './reports/report-pdf';

type RunWithRelations = AgentRun & {
  agent: { name: string; department: string };
  actions: RunAction[];
};

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AmberdAccessService,
    private readonly notifications: InAppNotificationService,
  ) {}

  async list(userId: string, organizationId: string, agentId?: string): Promise<RunSummary[]> {
    await this.access.requireMember(userId, organizationId);
    const runs = await this.prisma.agentRun.findMany({
      where: { organizationId, ...(agentId ? { agentId } : {}) },
      include: { agent: { select: { name: true, department: true } }, actions: true },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    return runs.map((run) => this.toSummary(run));
  }

  async get(userId: string, organizationId: string, runId: string): Promise<RunDetail> {
    await this.access.requireMember(userId, organizationId);
    const run = await this.loadScoped(organizationId, runId);
    const connection = run.connectionId
      ? await this.prisma.dataConnection.findFirst({
          where: { id: run.connectionId, organizationId },
          select: { id: true, name: true, type: true },
        })
      : null;

    return {
      ...this.toSummary(run),
      inputs: run.inputs as Record<string, unknown>,
      documents: run.documents as RunDetail['documents'],
      connection,
      timeline: run.timeline as unknown as TimelineStep[],
      extracted: run.extracted as Record<string, unknown> | null,
      results: run.results as Record<string, unknown> | null,
      conditions: run.conditions as unknown as ConditionEvaluation[],
      report: run.report as Record<string, unknown> | null,
      error: run.error,
      actions: run.actions
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((action) => this.toActionView(action)),
      triggeredById: run.triggeredById,
    };
  }

  /**
   * Record a human decision on an approval action. Approval is recorded in
   * Amberd Lite only; no payment or external system is touched.
   */
  async decide(
    userId: string,
    organizationId: string,
    runId: string,
    actionId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ): Promise<RunDetail> {
    await this.access.requireManager(userId, organizationId, 'decide approvals');
    const run = await this.loadScoped(organizationId, runId);
    const action = run.actions.find((a) => a.id === actionId);
    if (!action) throw new NotFoundException(`Action not found: ${actionId}`);
    if (action.status !== RunActionStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('This action is not awaiting approval');
    }

    const status = decision === 'APPROVE' ? RunActionStatus.APPROVED : RunActionStatus.REJECTED;
    await this.prisma.runAction.update({
      where: { id: action.id },
      data: {
        status,
        decidedById: userId,
        decidedAt: new Date(),
        decisionNote: note?.slice(0, 1000) ?? null,
        detail: {
          ...(action.detail as Record<string, unknown>),
          decision,
        } as Prisma.InputJsonValue,
      },
    });
    await this.access.log(
      organizationId,
      userId,
      'info',
      'approvals',
      `${decision === 'APPROVE' ? 'Approved' : 'Rejected'}: ${action.label} (${run.agent.name})`,
      { runId, actionId, note },
    );
    if (run.triggeredById !== userId) {
      await this.notifications.createNotification(
        run.triggeredById,
        'system',
        `Approval ${decision === 'APPROVE' ? 'granted' : 'rejected'}: ${run.agent.name}`,
        note || action.label,
        { kind: 'amberd_approval', organizationId, runId, actionUrl: `/runs/${runId}` },
      );
    }
    return this.get(userId, organizationId, runId);
  }

  async reportPdf(userId: string, organizationId: string, runId: string): Promise<{ buffer: Buffer; filename: string }> {
    await this.access.requireMember(userId, organizationId);
    const run = await this.loadScoped(organizationId, runId);
    if (!run.report) throw new NotFoundException('This run has no report (it did not complete)');
    const buffer = await renderReportPdf({
      report: run.report as Record<string, unknown>,
      runId: run.id,
      model: run.model,
      completedAt: run.completedAt,
    });
    return { buffer, filename: `amberd-report-${run.id.slice(0, 8)}.pdf` };
  }

  private async loadScoped(organizationId: string, runId: string): Promise<RunWithRelations> {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, organizationId },
      include: { agent: { select: { name: true, department: true } }, actions: true },
    });
    if (!run) throw new NotFoundException(`Run not found: ${runId}`);
    return run;
  }

  private toSummary(run: RunWithRelations): RunSummary {
    return {
      id: run.id,
      agentId: run.agentId,
      agentName: run.agent.name,
      department: run.agent.department,
      provider: run.provider,
      model: run.model,
      status: run.status,
      outcome: run.outcome,
      triggerType: run.triggerType,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      costUsd: run.costUsd,
      pendingApprovals: run.actions.filter((a) => a.status === RunActionStatus.AWAITING_APPROVAL).length,
    };
  }

  private toActionView(action: RunAction): RunActionView {
    return {
      id: action.id,
      actionKey: action.actionKey,
      type: action.type,
      label: action.label,
      status: action.status,
      detail: action.detail as Record<string, unknown>,
      decidedById: action.decidedById,
      decidedAt: action.decidedAt?.toISOString() ?? null,
      decisionNote: action.decisionNote,
      createdAt: action.createdAt.toISOString(),
    };
  }
}
