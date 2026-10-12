import Anthropic from '@anthropic-ai/sdk';
import { LlmExecutionError, LlmProvider, LlmRequest, LlmResult } from './llm.types';

/**
 * Anthropic Messages API client.
 *
 * The key is read from `ANTHROPIC_API_KEY` on the server only. Structured
 * output (`output_config.format`) constrains the response to the agent's
 * schema. No refusal fallback is configured on purpose: Amberd Lite must run the
 * model the agent selected, so a decline fails the run instead of silently
 * switching models.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    if (!this.isConfigured()) {
      throw new LlmExecutionError(
        'Anthropic is not configured: ANTHROPIC_API_KEY is not set on the server',
        'NOT_CONFIGURED',
      );
    }
    this.client ??= new Anthropic({ maxRetries: 1 });

    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            effort: request.effort,
            format: { type: 'json_schema', schema: request.outputSchema },
          },
        },
        { timeout: request.timeoutMs },
      );
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new LlmExecutionError(`Model call exceeded the ${request.timeoutMs / 1000}s timeout`, 'TIMEOUT');
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new LlmExecutionError('Anthropic rejected the API key (401)', 'API_ERROR');
      }
      if (error instanceof Anthropic.NotFoundError) {
        throw new LlmExecutionError(`Model "${request.model}" was not found (404)`, 'UNKNOWN_MODEL');
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmExecutionError('Anthropic rate limit reached (429) — try again shortly', 'API_ERROR');
      }
      if (error instanceof Anthropic.APIError) {
        throw new LlmExecutionError(`Anthropic API error ${error.status ?? ''}: ${error.message}`, 'API_ERROR');
      }
      throw new LlmExecutionError(`Model call failed: ${(error as Error).message}`, 'API_ERROR');
    }

    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    if (response.stop_reason === 'refusal') {
      throw new LlmExecutionError('The model declined this request', 'REFUSAL', usage);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new LlmExecutionError(
        'The model hit the maximum output tokens before finishing — raise the limit',
        'TRUNCATED',
        usage,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new LlmExecutionError('The model returned output that is not valid JSON', 'INVALID_OUTPUT', usage);
    }

    return {
      output,
      ...usage,
      stopReason: response.stop_reason,
      latencyMs: Date.now() - startedAt,
    };
  }
}
