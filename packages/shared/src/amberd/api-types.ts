import { AgentDefinition, AgentStatusValue, PriorityTier } from './agent-definition';
import { ModelCatalogEntry } from './models';

export type AgentRunStatusValue = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type RunActionStatusValue =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  department: string;
  status: AgentStatusValue;
  provider: string;
  model: string;
  triggerType: string;
  priorityTier: PriorityTier;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: AgentRunStatusValue | null;
  estimatedCostUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDetail extends AgentSummary {
  definition: AgentDefinition;
}

export interface TimelineStep {
  step: string;
  status: 'ok' | 'failed' | 'skipped';
  at: string;
  detail?: string;
}

export interface ConditionEvaluation {
  id: string;
  name: string;
  field: string;
  operator: string;
  left: unknown;
  right: unknown;
  result: boolean;
  actionsTriggered: string[];
}

export interface RunActionView {
  id: string;
  actionKey: string;
  type: string;
  label: string;
  status: RunActionStatusValue;
  detail: Record<string, unknown>;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  agentId: string;
  agentName: string;
  department: string;
  provider: string | null;
  model: string | null;
  status: AgentRunStatusValue;
  outcome: string | null;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  pendingApprovals: number;
}

export interface RunDetail extends RunSummary {
  inputs: Record<string, unknown>;
  documents: Array<{ variable: string; resourceId: string; title: string; characters: number }>;
  connection: { id: string; name: string; type: string } | null;
  timeline: TimelineStep[];
  extracted: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  conditions: ConditionEvaluation[];
  report: Record<string, unknown> | null;
  error: string | null;
  actions: RunActionView[];
  triggeredById: string;
}

export interface ConnectionView {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  description: string | null;
  isSimulated: boolean;
  authorizedResources: string[];
  permissions: string[];
  connectedAgents: Array<{ id: string; name: string }>;
  lastActivityAt: string | null;
  /** Display names of authorized resources, keyed by id (remote connectors). */
  resourceNames: Record<string, { name: string; type: 'folder' | 'file' }>;
  /** Signed-in account for OAuth connectors, e.g. the Google account email. */
  accountEmail: string | null;
  /** Whether the server has the OAuth client credentials this connector needs. */
  isOAuthConfigured: boolean | null;
}

export interface ConnectionResource {
  id: string;
  collection: string;
  documentId: string;
  title: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface ModelView extends ModelCatalogEntry {
  isConfigured: boolean;
  availability: 'AVAILABLE' | 'NOT_CONFIGURED' | 'NOT_INTEGRATED';
  connectedAgents: Array<{ id: string; name: string }>;
}

export interface ResourcePolicyView {
  maxConcurrentRuns: number;
  maxConnectionsPerSource: number;
  spendCapUsd: number;
  spendWindowDays: number;
  timeoutSeconds: number;
  defaultPriorityTier: PriorityTier;
  updatedAt: string;
}

export interface CostBreakdownRow {
  key: string;
  label: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

export interface CostsView {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  unpricedRuns: number;
  byAgent: CostBreakdownRow[];
  byDepartment: CostBreakdownRow[];
  byModel: CostBreakdownRow[];
  daily: Array<{ date: string; costUsd: number; tokens: number }>;
  windowSpendUsd: number;
  spendCapUsd: number;
  spendWindowDays: number;
}

export interface OverviewView {
  agents: { total: number; active: number; inactive: number; draft: number; failing: number };
  runs: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    successRate: number | null;
    avgLatencyMs: number | null;
  };
  spend: {
    totalCostUsd: number;
    totalTokens: number;
    byAgent: CostBreakdownRow[];
    byDepartment: CostBreakdownRow[];
  };
  activity: Array<{ date: string; runs: number; failed: number }>;
  alerts: Array<{
    id: string;
    kind: 'PROBLEM_DETECTED' | 'ACTION_COMPLETED' | 'ACTION_FAILED';
    title: string;
    detail: string;
    runId: string | null;
    createdAt: string;
  }>;
  pendingApprovals: number;
  llmConfigured: boolean;
}

export interface PlatformLogView {
  id: string;
  level: string;
  category: string;
  message: string;
  actorId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}
