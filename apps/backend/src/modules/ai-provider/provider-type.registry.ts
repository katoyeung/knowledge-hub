// Note: These imports are for type references only in the registry
// The actual client classes are imported dynamically in the factory

export interface ProviderTypeConfig {
  clientClass: string;
  defaultModel: string;
  requiresApiKey: boolean;
  supportsCustomBaseUrl: boolean;
}

/**
 * Centralized registry mapping AI Provider types to their corresponding LLM client implementations
 */
export const PROVIDER_TYPE_REGISTRY: Record<string, ProviderTypeConfig> = {
  openai: {
    clientClass: 'OpenRouterApiClient',
    defaultModel: 'openai/gpt-4',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  anthropic: {
    clientClass: 'OpenRouterApiClient',
    defaultModel: 'anthropic/claude-3-opus',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  openrouter: {
    clientClass: 'OpenRouterApiClient',
    defaultModel: 'openai/gpt-4',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  dashscope: {
    clientClass: 'DashScopeApiClient',
    defaultModel: 'qwen3-max',
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
  },
  perplexity: {
    clientClass: 'PerplexityApiClient',
    defaultModel: 'sonar',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  custom: {
    clientClass: 'OllamaApiClient',
    defaultModel: 'llama3.1:8b',
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
  },
};

/**
 * Get provider configuration by type
 */
export function getProviderConfig(type: string): ProviderTypeConfig | null {
  return PROVIDER_TYPE_REGISTRY[type] || null;
}

/**
 * Check if a provider type is supported
 */
export function isProviderTypeSupported(type: string): boolean {
  return type in PROVIDER_TYPE_REGISTRY;
}

/**
 * Get all supported provider types
 */
export function getSupportedProviderTypes(): string[] {
  return Object.keys(PROVIDER_TYPE_REGISTRY);
}
