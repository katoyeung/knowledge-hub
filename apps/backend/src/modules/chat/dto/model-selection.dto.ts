import { LLMProvider } from '../../../common/services/api-client-factory.service';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  maxTokens?: number;
  contextWindow?: number;
  pricing?: {
    input: number; // per 1M tokens
    output: number; // per 1M tokens
  };
}

export class ModelSelectionResponseDto {
  providers: Array<{
    id: string; // AI provider UUID
    name: string;
    type: string; // AI provider type
    provider: LLMProvider; // Resolved LLMProvider enum for backward compatibility
    models: ModelInfo[];
    available: boolean;
    availabilityMessage: string;
  }>;
}

export class ProviderModelsDto {
  id: LLMProvider;
  name: string;
  models: ModelInfo[];
}
