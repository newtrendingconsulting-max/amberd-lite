import type {
  AgentDefinition,
  AgentDetail,
  AgentSummary,
  ConnectionResource,
  ConnectionView,
  CostsView,
  DefinitionValidationError,
  ModelView,
  OverviewView,
  PlatformLogView,
  ResourcePolicyView,
  RunDetail,
  RunSummary,
  TemplateMaturity,
} from '@app-starter/shared';
import { apiClient } from './api-client';
import { downloadAuthedFile } from './download';

export interface IntegrationsStatus {
  email: { provider: string; isLocalTestInbox: boolean; sender: string | null };
  googleDrive: { isConfigured: boolean };
  anthropic: { isConfigured: boolean };
}

export interface TemplateView {
  id: string;
  name: string;
  department: string;
  summary: string;
  maturity: TemplateMaturity;
  definition: AgentDefinition;
}

export interface GpuView {
  isIllustrative: true;
  pools: Array<{
    id: string;
    name: string;
    gpuModel: string;
    total: number;
    allocated: number;
    utilization: number;
    status: string;
  }>;
  tiers: Array<{ tier: string; reservedShare: number; agents: number }>;
  workloads: Array<{
    agentId: string;
    name: string;
    priorityTier: string;
    status: string;
    illustrativeGpuShare: number;
  }>;
}

/** Errors thrown by the API client carry the server's validation details. */
export interface ApiErrorShape {
  message: string;
  statusCode?: number;
  errors?: DefinitionValidationError[];
}

const base = (organizationId: string) => `/api/organizations/${organizationId}/amberd`;

export const amberdApi = {
  overview: (org: string) => apiClient.get<OverviewView>(`${base(org)}/overview`),
  agents: (org: string) => apiClient.get<AgentSummary[]>(`${base(org)}/agents`),
  agent: (org: string, id: string) => apiClient.get<AgentDetail>(`${base(org)}/agents/${id}`),
  createAgent: (org: string, definition: AgentDefinition) =>
    apiClient.post<AgentDetail>(`${base(org)}/agents`, { definition }),
  importAgent: (org: string, definition: unknown) =>
    apiClient.post<AgentDetail>(`${base(org)}/agents/import`, { definition }),
  updateAgent: (org: string, id: string, definition: AgentDefinition) =>
    apiClient.put<AgentDetail>(`${base(org)}/agents/${id}`, { definition }),
  validateAgent: (org: string, definition: unknown, agentId?: string) =>
    apiClient.post<{ isValid: boolean; errors: DefinitionValidationError[] }>(
      `${base(org)}/agents/validate${agentId ? `?agentId=${agentId}` : ''}`,
      { definition },
    ),
  duplicateAgent: (org: string, id: string) =>
    apiClient.post<AgentDetail>(`${base(org)}/agents/${id}/duplicate`, {}),
  setAgentStatus: (org: string, id: string, status: 'ACTIVE' | 'INACTIVE' | 'DRAFT') =>
    apiClient.patch<AgentDetail>(`${base(org)}/agents/${id}/status`, { status }),
  archiveAgent: (org: string, id: string) => apiClient.delete(`${base(org)}/agents/${id}`),
  executeAgent: (org: string, id: string, inputs: Record<string, unknown>, emailRecipients?: string[]) =>
    apiClient.post<{ runId: string; status: string }>(`${base(org)}/agents/${id}/execute`, {
      inputs,
      ...(emailRecipients?.length ? { emailRecipients } : {}),
    }),
  downloadReport: (org: string, runId: string) =>
    downloadAuthedFile(`${base(org)}/runs/${runId}/report.pdf`, `amberd-report-${runId.slice(0, 8)}.pdf`),
  integrationsStatus: (org: string) => apiClient.get<IntegrationsStatus>(`${base(org)}/integrations-status`),
  driveAuthorizeUrl: (org: string, connectionId: string) =>
    apiClient.get<{ url: string }>(`${base(org)}/connections/${connectionId}/google-drive/authorize`),
  drivePickerSession: (org: string, connectionId: string) =>
    apiClient.get<{ accessToken: string; clientId: string; apiKey: string; appId: string }>(
      `${base(org)}/connections/${connectionId}/google-drive/picker-session`,
    ),
  driveSetResources: (
    org: string,
    connectionId: string,
    resources: Array<{ id: string; name: string; type: 'file' }>,
  ) => apiClient.put<ConnectionView[]>(`${base(org)}/connections/${connectionId}/google-drive/resources`, { resources }),
  driveDisconnect: (org: string, connectionId: string) =>
    apiClient.post<ConnectionView[]>(`${base(org)}/connections/${connectionId}/google-drive/disconnect`, {}),
  runs: (org: string, agentId?: string) =>
    apiClient.get<RunSummary[]>(`${base(org)}/runs${agentId ? `?agentId=${agentId}` : ''}`),
  run: (org: string, id: string) => apiClient.get<RunDetail>(`${base(org)}/runs/${id}`),
  decide: (org: string, runId: string, actionId: string, decision: 'APPROVE' | 'REJECT', note?: string) =>
    apiClient.post<RunDetail>(`${base(org)}/runs/${runId}/actions/${actionId}/decision`, {
      decision,
      note,
    }),
  connections: (org: string) => apiClient.get<ConnectionView[]>(`${base(org)}/connections`),
  resources: (org: string, connectionId: string, collection: string) =>
    apiClient.get<ConnectionResource[]>(
      `${base(org)}/connections/${connectionId}/resources?collection=${encodeURIComponent(collection)}`,
    ),
  previewResource: (org: string, connectionId: string, resourceId: string) =>
    apiClient.get<{ id: string; title: string; content: string }>(
      `${base(org)}/connections/${connectionId}/resources/${resourceId}`,
    ),
  models: (org: string) => apiClient.get<ModelView[]>(`${base(org)}/models`),
  templates: (org: string) => apiClient.get<TemplateView[]>(`${base(org)}/templates`),
  costs: (org: string) => apiClient.get<CostsView>(`${base(org)}/costs`),
  policy: (org: string) => apiClient.get<ResourcePolicyView>(`${base(org)}/policies`),
  updatePolicy: (org: string, data: Partial<ResourcePolicyView>) =>
    apiClient.put<ResourcePolicyView>(`${base(org)}/policies`, data),
  logs: (org: string) => apiClient.get<PlatformLogView[]>(`${base(org)}/logs`),
  gpu: (org: string) => apiClient.get<GpuView>(`${base(org)}/gpu`),
};

export const errorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) return String((error as ApiErrorShape).message);
  return 'Something went wrong';
};
