import { LLMProvider, ModelInfo } from '../services/model-config.service';

export class ModelSelectionResponseDto {
  providers: Array<{
    id: LLMProvider;
    name: string;
    models: ModelInfo[];
  }>;
}

export class ProviderModelsDto {
  id: LLMProvider;
  name: string;
  models: ModelInfo[];
}
