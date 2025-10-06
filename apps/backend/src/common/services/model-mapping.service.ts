import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingModel } from '../../modules/dataset/dto/create-dataset-step.dto';
import { EmbeddingProvider } from '../enums/embedding-provider.enum';

export interface ModelMapping {
  local: string;
  ollama: string;
  dashscope: string;
  dimensions: number;
  description?: string;
}

@Injectable()
export class ModelMappingService {
  private readonly logger = new Logger(ModelMappingService.name);

  /**
   * Single source of truth for all model mappings
   * This ensures consistency across all services and prevents dimension mismatches
   */
  private readonly MODEL_MAPPINGS: Record<EmbeddingModel, ModelMapping> = {
    // Local Models (Xenova Transformers) - 1024 dimensions
    [EmbeddingModel.XENOVA_BGE_M3]: {
      local: 'Xenova/bge-m3',
      ollama: 'Xenova/bge-m3', // Keep consistent to prevent dimension mismatches
      dashscope: 'text-embedding-v4',
      dimensions: 1024,
      description: 'BGE-M3: Multilingual model, good for diverse languages',
    },
    [EmbeddingModel.MIXEDBREAD_MXBAI_EMBED_LARGE_V1]: {
      local: 'mixedbread-ai/mxbai-embed-large-v1',
      ollama: 'mixedbread-ai/mxbai-embed-large-v1', // Keep consistent
      dashscope: 'text-embedding-v4',
      dimensions: 1024,
      description:
        'MixedBread mxbai-embed-large-v1: High-quality English model',
    },
    [EmbeddingModel.WHEREISAI_UAE_LARGE_V1]: {
      local: 'WhereIsAI/UAE-Large-V1',
      ollama: 'WhereIsAI/UAE-Large-V1', // Keep consistent
      dashscope: 'text-embedding-v4',
      dimensions: 1024,
      description:
        'UAE-Large-V1: Universal Angle Embedding, good for various tasks',
    },

    // Ollama Models - Various dimensions
    [EmbeddingModel.QWEN3_EMBEDDING_0_6B]: {
      local: 'qwen3-embedding:0.6b',
      ollama: 'qwen3-embedding:0.6b',
      dashscope: 'text-embedding-v4',
      dimensions: 2560, // Ollama qwen3-embedding:0.6b produces 2560D
      description: 'Qwen3 Embedding 0.6B (Ollama) - Recommended for Ollama',
    },
    [EmbeddingModel.QWEN3_EMBEDDING_4B]: {
      local: 'qwen3-embedding:4b',
      ollama: 'qwen3-embedding:4b',
      dashscope: 'text-embedding-v4',
      dimensions: 2560, // Correct: qwen3-embedding:4b actually produces 2560D
      description: 'Qwen3 Embedding 4B (Ollama)',
    },
    [EmbeddingModel.EMBEDDING_GEMMA_300M]: {
      local: 'embeddinggemma:300m',
      ollama: 'embeddinggemma:300m',
      dashscope: 'text-embedding-v4',
      dimensions: 1024, // Gemma 300M produces 1024D
      description: 'Embedding Gemma 300M (Ollama)',
    },
    [EmbeddingModel.NOMIC_EMBED_TEXT_V1_5]: {
      local: 'nomic-embed-text:v1.5',
      ollama: 'nomic-embed-text:v1.5',
      dashscope: 'text-embedding-v4',
      dimensions: 768, // Nomic embed text v1.5 produces 768D
      description: 'Nomic Embed Text v1.5 (Ollama)',
    },

    // DashScope Models - 1536 dimensions
    [EmbeddingModel.TEXT_EMBEDDING_V1]: {
      local: 'text-embedding-v1',
      ollama: 'text-embedding-v1',
      dashscope: 'text-embedding-v1',
      dimensions: 1536,
      description: 'Text Embedding V1 (DashScope)',
    },
    [EmbeddingModel.TEXT_EMBEDDING_V2]: {
      local: 'text-embedding-v2',
      ollama: 'text-embedding-v2',
      dashscope: 'text-embedding-v2',
      dimensions: 1536,
      description: 'Text Embedding V2 (DashScope)',
    },
    [EmbeddingModel.TEXT_EMBEDDING_V3]: {
      local: 'text-embedding-v3',
      ollama: 'text-embedding-v3',
      dashscope: 'text-embedding-v3',
      dimensions: 1536,
      description: 'Text Embedding V3 (DashScope)',
    },
    [EmbeddingModel.TEXT_EMBEDDING_V4]: {
      local: 'text-embedding-v4',
      ollama: 'text-embedding-v4',
      dashscope: 'text-embedding-v4',
      dimensions: 1536,
      description: 'Text Embedding V4 (DashScope) - Recommended for DashScope',
    },

    // Custom model
    [EmbeddingModel.CUSTOM]: {
      local: 'custom',
      ollama: 'custom',
      dashscope: 'custom',
      dimensions: 1024, // Default to 1024D for custom models
      description: 'Custom model (user input - must be 1024 dimensions)',
    },
  };

  /**
   * Get the actual model name for a given embedding model and provider
   */
  getModelName(model: EmbeddingModel, provider: EmbeddingProvider): string {
    const mapping = this.MODEL_MAPPINGS[model];
    if (!mapping) {
      this.logger.warn(`Unknown embedding model: ${model}, using default`);
      return 'Xenova/bge-m3';
    }

    const modelName = mapping[provider] || mapping.local;
    this.logger.log(`Mapped ${model} (${provider}) → ${modelName}`);
    return modelName;
  }

  /**
   * Get the expected dimensions for a given embedding model
   */
  getDimensions(model: EmbeddingModel): number {
    const mapping = this.MODEL_MAPPINGS[model];
    if (!mapping) {
      this.logger.warn(
        `Unknown embedding model: ${model}, using default dimensions`,
      );
      return 1024;
    }
    return mapping.dimensions;
  }

  /**
   * Get model mapping information
   */
  getModelMapping(model: EmbeddingModel): ModelMapping | null {
    return this.MODEL_MAPPINGS[model] || null;
  }

  /**
   * Get all available models for a provider
   */
  getAvailableModelsForProvider(provider: EmbeddingProvider): Array<{
    model: EmbeddingModel;
    name: string;
    dimensions: number;
    description: string;
  }> {
    return Object.entries(this.MODEL_MAPPINGS).map(([model, mapping]) => ({
      model: model as EmbeddingModel,
      name: mapping[provider] || mapping.local,
      dimensions: mapping.dimensions,
      description: mapping.description || '',
    }));
  }

  /**
   * Reverse mapping: Get the embedding model enum from a stored model name
   * This is used by search services to find the correct model
   */
  getEmbeddingModelFromStoredName(
    storedModelName: string,
  ): EmbeddingModel | null {
    for (const [model, mapping] of Object.entries(this.MODEL_MAPPINGS)) {
      if (
        mapping.local === storedModelName ||
        mapping.ollama === storedModelName ||
        mapping.dashscope === storedModelName
      ) {
        return model as EmbeddingModel;
      }
    }
    return null;
  }

  /**
   * Get all possible stored model names for a given embedding model
   * This helps search services find embeddings created with different providers
   */
  getAllPossibleStoredNames(model: EmbeddingModel): string[] {
    const mapping = this.MODEL_MAPPINGS[model];
    if (!mapping) {
      return ['Xenova/bge-m3']; // Default fallback
    }

    return [mapping.local, mapping.ollama, mapping.dashscope].filter(
      (name, index, arr) => arr.indexOf(name) === index,
    ); // Remove duplicates
  }

  /**
   * Validate that a model name and provider combination is valid
   */
  validateModelProvider(
    model: EmbeddingModel,
    provider: EmbeddingProvider,
  ): boolean {
    const mapping = this.MODEL_MAPPINGS[model];
    if (!mapping) {
      return false;
    }
    return !!mapping[provider];
  }

  /**
   * Get model information for debugging
   */
  getModelInfo(model: EmbeddingModel): {
    model: EmbeddingModel;
    mappings: ModelMapping;
    allStoredNames: string[];
  } | null {
    const mapping = this.MODEL_MAPPINGS[model];
    if (!mapping) {
      return null;
    }

    return {
      model,
      mappings: mapping,
      allStoredNames: this.getAllPossibleStoredNames(model),
    };
  }
}
