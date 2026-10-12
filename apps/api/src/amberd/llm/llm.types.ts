import { LlmEffort, LlmProviderId } from '@app-starter/shared';

export interface LlmRequest {
  model: string;
  system: string;
  prompt: string;
  /** Strict JSON schema the response must satisfy. */
  outputSchema: Record<string, unknown>;
  maxOutputTokens: number;
  effort: LlmEffort;
  timeoutMs: number;
}

export interface LlmResult {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  isConfigured(): boolean;
  complete(request: LlmRequest): Promise<LlmResult>;
}

/** Any model-side failure. The engine records it and never fabricates a result. */
export class LlmExecutionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_CONFIGURED'
      | 'NOT_INTEGRATED'
      | 'UNKNOWN_MODEL'
      | 'API_ERROR'
      | 'TIMEOUT'
      | 'REFUSAL'
      | 'TRUNCATED'
      | 'INVALID_OUTPUT',
    readonly usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = 'LlmExecutionError';
  }
}
