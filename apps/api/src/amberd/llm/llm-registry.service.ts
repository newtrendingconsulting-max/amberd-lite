import { Injectable } from '@nestjs/common';
import { LlmProviderId, findCatalogModel } from '@app-starter/shared';
import { AnthropicProvider } from './anthropic.provider';
import { LlmExecutionError, LlmProvider } from './llm.types';

/**
 * Resolves the provider for an agent's selected model.
 *
 * Only providers with a real client are registered; anything else fails with a
 * clear "not integrated" error rather than a simulated response.
 */
@Injectable()
export class LlmRegistryService {
  private readonly providers = new Map<LlmProviderId, LlmProvider>();

  constructor() {
    this.register(new AnthropicProvider());
  }

  register(provider: LlmProvider): void {
    this.providers.set(provider.id, provider);
  }

  isConfigured(providerId: string): boolean {
    return this.providers.get(providerId as LlmProviderId)?.isConfigured() ?? false;
  }

  isIntegrated(providerId: string): boolean {
    return this.providers.has(providerId as LlmProviderId);
  }

  resolve(providerId: string, model: string): LlmProvider {
    const provider = this.providers.get(providerId as LlmProviderId);
    if (!provider) {
      throw new LlmExecutionError(
        `Provider "${providerId}" is not integrated in this Amberd Lite deployment`,
        'NOT_INTEGRATED',
      );
    }
    const catalogEntry = findCatalogModel(model);
    if (!catalogEntry || catalogEntry.provider !== providerId) {
      throw new LlmExecutionError(
        `Model "${model}" is not registered for provider "${providerId}"`,
        'UNKNOWN_MODEL',
      );
    }
    if (!provider.isConfigured()) {
      throw new LlmExecutionError(`Provider "${providerId}" has no credentials configured`, 'NOT_CONFIGURED');
    }
    return provider;
  }
}
