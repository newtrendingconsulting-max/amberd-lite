import { LlmProviderId } from './agent-definition';

export type ModelCategory = 'FOUNDATION' | 'OPEN_SOURCE' | 'OPEN_WEIGHT' | 'CUSTOM';

export interface ModelCatalogEntry {
  provider: LlmProviderId;
  providerName: string;
  model: string;
  displayName: string;
  category: ModelCategory;
  /** USD per million tokens, from the provider's published list price. Null when unknown. */
  inputPricePerMTok: number | null;
  outputPricePerMTok: number | null;
  /** True only for providers the hackathon build has a working client for. */
  isIntegrated: boolean;
}

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  FOUNDATION: 'Foundation models',
  OPEN_SOURCE: 'Open-source models',
  OPEN_WEIGHT: 'Open-weight models',
  CUSTOM: 'Your own LLM',
};

/**
 * Anthropic prices are the published first-party API rates. Other providers
 * are listed so agents can target them later, but have no client in this build
 * and therefore no price is asserted.
 */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    provider: 'anthropic',
    providerName: 'Anthropic',
    model: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5',
    category: 'FOUNDATION',
    inputPricePerMTok: 4,
    outputPricePerMTok: 20,
    isIntegrated: true,
  },
  {
    provider: 'anthropic',
    providerName: 'Anthropic',
    model: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    category: 'FOUNDATION',
    inputPricePerMTok: 2,
    outputPricePerMTok: 10,
    isIntegrated: true,
  },
  {
    provider: 'anthropic',
    providerName: 'Anthropic',
    model: 'claude-haiku-5-5',
    displayName: 'Claude Haiku 5.5',
    category: 'FOUNDATION',
    inputPricePerMTok: 0.1,
    outputPricePerMTok: 0.5,
    isIntegrated: true,
  },
  {
    provider: 'openai',
    providerName: 'OpenAI',
    model: 'openai-gpt',
    displayName: 'OpenAI GPT (flagship)',
    category: 'FOUNDATION',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    isIntegrated: false,
  },
  {
    provider: 'gemini',
    providerName: 'Google',
    model: 'gemini-pro',
    displayName: 'Gemini Pro',
    category: 'FOUNDATION',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    isIntegrated: false,
  },
  {
    provider: 'open-source',
    providerName: 'Self-hosted',
    model: 'llama-open-source',
    displayName: 'Llama (self-hosted)',
    category: 'OPEN_SOURCE',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    isIntegrated: false,
  },
  {
    provider: 'open-weight',
    providerName: 'Self-hosted',
    model: 'mistral-open-weight',
    displayName: 'Mistral (open weights)',
    category: 'OPEN_WEIGHT',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    isIntegrated: false,
  },
  {
    provider: 'custom',
    providerName: 'Your organization',
    model: 'custom-endpoint',
    displayName: 'Custom model endpoint',
    category: 'CUSTOM',
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    isIntegrated: false,
  },
];

export const findCatalogModel = (model: string): ModelCatalogEntry | undefined =>
  MODEL_CATALOG.find((entry) => entry.model === model);

/** Cost in USD for a token count, or null when the model has no published price. */
export const estimateCostUsd = (
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null => {
  const entry = findCatalogModel(model);
  if (!entry || entry.inputPricePerMTok === null || entry.outputPricePerMTok === null) return null;
  return (inputTokens * entry.inputPricePerMTok + outputTokens * entry.outputPricePerMTok) / 1_000_000;
};
