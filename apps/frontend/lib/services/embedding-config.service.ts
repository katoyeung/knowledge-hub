import {
  UnifiedEmbeddingConfig,
  EmbeddingConfigData,
} from "@/components/embedding-config/embedding-config-step";

export interface EmbeddingConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ModelOptimization {
  chunkSize: number;
  chunkOverlap: number;
  description: string;
  optimizationApplied: boolean;
}

export class EmbeddingConfigService {
  /**
   * Validates the current configuration
   */
  static validateConfig(
    config: EmbeddingConfigData
  ): EmbeddingConfigValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    const currentConfig = config.config;

    // Validate chunk size
    if (currentConfig.chunkSize < 100) {
      errors.push("Chunk size must be at least 100 characters");
    }
    // Allow larger chunk sizes for certain models that are optimized for them
    const maxChunkSize = this.getMaxChunkSizeForModel(
      currentConfig.embeddingModel
    );
    if (currentConfig.chunkSize > maxChunkSize) {
      errors.push(
        `Chunk size must not exceed ${maxChunkSize} characters for this model`
      );
    }

    // Validate chunk overlap
    if (currentConfig.chunkOverlap < 0) {
      errors.push("Chunk overlap must be at least 0");
    }
    // Allow larger overlap for models optimized for large chunks
    const maxOverlapRatio = this.getMaxOverlapRatioForModel(
      currentConfig.embeddingModel
    );
    const maxOverlap = Math.floor(currentConfig.chunkSize * maxOverlapRatio);
    if (currentConfig.chunkOverlap > maxOverlap) {
      errors.push(
        `Chunk overlap must not exceed ${maxOverlap} characters (${Math.round(maxOverlapRatio * 100)}% of chunk size) for this model`
      );
    }

    // Validate custom model name
    if (
      currentConfig.embeddingModel === "custom" &&
      !currentConfig.customModelName?.trim()
    ) {
      errors.push(
        "Custom model name is required when using custom embedding model"
      );
    }

    // Validate search weights
    if (currentConfig.bm25Weight < 0 || currentConfig.bm25Weight > 1) {
      errors.push("BM25 weight must be between 0 and 1");
    }

    if (
      currentConfig.embeddingWeight < 0 ||
      currentConfig.embeddingWeight > 1
    ) {
      errors.push("Embedding weight must be between 0 and 1");
    }

    // Check if weights sum to 1 (warning, not error)
    const totalWeight =
      currentConfig.bm25Weight + currentConfig.embeddingWeight;
    if (Math.abs(totalWeight - 1) > 0.01) {
      warnings.push("Search weights should sum to 1.0 for optimal performance");
    }

    // Validate number of chunks
    if (currentConfig.numChunks < 1 || currentConfig.numChunks > 20) {
      errors.push("Number of chunks must be between 1 and 20");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Gets the maximum chunk size allowed for a specific model
   */
  static getMaxChunkSizeForModel(model: string): number {
    // Models that can handle larger chunk sizes
    const largeChunkModels = [
      "qwen3-embedding:4b",
      "mixedbread-ai/mxbai-embed-large-v1",
    ];

    if (largeChunkModels.includes(model)) {
      return 12000; // Allow up to 12k characters for these models
    }

    // Default limit for most models
    return 4000;
  }

  /**
   * Gets the maximum overlap ratio allowed for a specific model
   */
  static getMaxOverlapRatioForModel(model: string): number {
    // Models that can handle larger overlap ratios
    const largeOverlapModels = [
      "qwen3-embedding:4b",
      "mixedbread-ai/mxbai-embed-large-v1",
    ];

    if (largeOverlapModels.includes(model)) {
      return 0.15; // Allow up to 15% overlap for these models
    }

    // Default limit for most models (50%)
    return 0.5;
  }

  /**
   * Applies model-specific optimizations to a configuration
   */
  static applyModelOptimizations(
    config: UnifiedEmbeddingConfig
  ): UnifiedEmbeddingConfig {
    const optimizedConfig = { ...config };

    switch (config.embeddingModel) {
      case "Xenova/bge-m3":
        optimizedConfig.chunkSize = 2000;
        optimizedConfig.chunkOverlap = 200;
        break;
      case "qwen3-embedding:0.6b":
        optimizedConfig.chunkSize = 8000;
        optimizedConfig.chunkOverlap = 800;
        break;
      case "mixedbread-ai/mxbai-embed-large-v1":
      case "qwen3-embedding:4b":
        optimizedConfig.chunkSize = 10000;
        optimizedConfig.chunkOverlap = 1000;
        break;
      case "WhereIsAI/UAE-Large-V1":
      case "nomic-embed-text:v1.5":
        optimizedConfig.chunkSize = 3000;
        optimizedConfig.chunkOverlap = 300;
        break;
      case "embeddinggemma:300m":
        optimizedConfig.chunkSize = 1500;
        optimizedConfig.chunkOverlap = 150;
        break;
      case "text-embedding-v4":
        optimizedConfig.chunkSize = 4000;
        optimizedConfig.chunkOverlap = 400;
        break;
      default:
        // Keep existing values for custom models
        break;
    }

    return optimizedConfig;
  }

  /**
   * Calculates model-specific optimizations
   */
  static calculateModelOptimization(
    embeddingModel: string,
    currentChunkSize: number,
    currentChunkOverlap: number
  ): ModelOptimization {
    let optimizedChunkSize = currentChunkSize;
    let optimizedChunkOverlap = currentChunkOverlap;
    let description = "";

    switch (embeddingModel) {
      case "Xenova/bge-m3":
        optimizedChunkSize = 2000;
        optimizedChunkOverlap = 200;
        description = "BGE-M3 optimized for multilingual content";
        break;
      case "qwen3-embedding:0.6b":
        optimizedChunkSize = 8000;
        optimizedChunkOverlap = 800;
        description = "Qwen3 0.6B optimized for large context";
        break;
      case "mixedbread-ai/mxbai-embed-large-v1":
      case "qwen3-embedding:4b":
        optimizedChunkSize = 10000;
        optimizedChunkOverlap = 1000;
        description = "High-quality model optimized for large chunks";
        break;
      case "WhereIsAI/UAE-Large-V1":
      case "nomic-embed-text:v1.5":
        optimizedChunkSize = 3000;
        optimizedChunkOverlap = 300;
        description = "Universal model optimized for balanced performance";
        break;
      case "embeddinggemma:300m":
        optimizedChunkSize = 1500;
        optimizedChunkOverlap = 150;
        description = "Lightweight model optimized for efficiency";
        break;
      case "text-embedding-v4":
        optimizedChunkSize = 4000;
        optimizedChunkOverlap = 400;
        description = "DashScope V4 optimized for large-scale processing";
        break;
      default:
        description = "Custom model - using specified values";
    }

    return {
      chunkSize: optimizedChunkSize,
      chunkOverlap: optimizedChunkOverlap,
      description,
      optimizationApplied:
        optimizedChunkSize !== currentChunkSize ||
        optimizedChunkOverlap !== currentChunkOverlap,
    };
  }

  /**
   * Converts configuration to backend DTO format
   */
  static toBackendDto(config: EmbeddingConfigData): Record<string, unknown> {
    const currentConfig = config.config;

    return {
      embeddingProvider: currentConfig.embeddingProvider,
      embeddingModel: currentConfig.embeddingModel,
      customModelName: currentConfig.customModelName,
      textSplitter: currentConfig.textSplitter,
      chunkSize: currentConfig.chunkSize,
      chunkOverlap: currentConfig.chunkOverlap,
      enableParentChildChunking: currentConfig.enableParentChildChunking,
      separators: currentConfig.separators,
      bm25Weight: currentConfig.bm25Weight,
      embeddingWeight: currentConfig.embeddingWeight,
      numChunks: currentConfig.numChunks,
      enableLangChainRAG: true, // Always enabled for unified config
    };
  }

  /**
   * Converts backend DTO to frontend configuration
   */
  static fromBackendDto(dto: Record<string, unknown>): EmbeddingConfigData {
    const unifiedConfig: UnifiedEmbeddingConfig = {
      embeddingProvider:
        (dto.embeddingProvider as "local" | "ollama" | "dashscope") || "local",
      embeddingModel: (dto.embeddingModel as string) || "Xenova/bge-m3",
      customModelName: dto.customModelName as string,
      textSplitter:
        (dto.textSplitter as UnifiedEmbeddingConfig["textSplitter"]) ||
        "recursive_character",
      chunkSize: (dto.chunkSize as number) || 1000,
      chunkOverlap: (dto.chunkOverlap as number) || 200,
      enableParentChildChunking:
        (dto.enableParentChildChunking as boolean) || false,
      separators: dto.separators as string[],
      bm25Weight: (dto.bm25Weight as number) || 0.3,
      embeddingWeight: (dto.embeddingWeight as number) || 0.7,
      numChunks: (dto.numChunks as number) || 5,
    };

    return {
      config: unifiedConfig,
    };
  }

  /**
   * Gets recommended settings for a specific use case
   */
  static getRecommendedConfig(
    useCase: "general" | "multilingual" | "english" | "code" | "research"
  ): EmbeddingConfigData {
    const baseConfig: UnifiedEmbeddingConfig = {
      embeddingProvider: "local",
      embeddingModel: "Xenova/bge-m3",
      chunkSize: 1000,
      chunkOverlap: 200,
      textSplitter: "smart_chunking",
      enableParentChildChunking: false,
      bm25Weight: 0.3,
      embeddingWeight: 0.7,
      numChunks: 5,
    };

    switch (useCase) {
      case "multilingual":
        return {
          config: {
            ...baseConfig,
            embeddingModel: "Xenova/bge-m3",
            textSplitter: "smart_chunking",
          },
        };

      case "english":
        return {
          config: {
            ...baseConfig,
            embeddingModel: "mixedbread-ai/mxbai-embed-large-v1",
            textSplitter: "smart_chunking",
          },
        };

      case "code":
        return {
          config: {
            ...baseConfig,
            embeddingModel: "Xenova/bge-m3",
            textSplitter: "python_code",
            chunkSize: 1500,
            chunkOverlap: 150,
          },
        };

      case "research":
        return {
          config: {
            ...baseConfig,
            embeddingModel: "WhereIsAI/UAE-Large-V1",
            textSplitter: "smart_chunking",
            numChunks: 8,
            enableParentChildChunking: true,
          },
        };

      default: // general
        return {
          config: baseConfig,
        };
    }
  }

  /**
   * Gets performance estimates for the current configuration
   */
  static getPerformanceEstimates(config: EmbeddingConfigData): {
    processingTime: string;
    memoryUsage: string;
    searchQuality: string;
    recommendations: string[];
  } {
    const currentConfig = config.config;

    let processingTime = "Fast";
    let memoryUsage = "Low";
    let searchQuality = "Good";
    const recommendations: string[] = [];

    // Chunk size impact
    if (currentConfig.chunkSize > 2000) {
      processingTime = "Slow";
      memoryUsage = "High";
      recommendations.push(
        "Consider reducing chunk size for faster processing"
      );
    } else if (currentConfig.chunkSize < 500) {
      searchQuality = "Fair";
      recommendations.push("Consider increasing chunk size for better context");
    }

    // Overlap impact
    if (currentConfig.chunkOverlap > currentConfig.chunkSize * 0.3) {
      processingTime = "Slow";
      recommendations.push(
        "High overlap may slow processing - consider reducing"
      );
    }

    // Parent-child chunking impact
    if (currentConfig.enableParentChildChunking) {
      processingTime = "Slow";
      memoryUsage = "High";
      searchQuality = "Excellent";
    }

    // Provider-specific recommendations
    if (currentConfig.embeddingProvider === "local") {
      recommendations.push(
        "Local models provide best privacy but may be slower"
      );
    } else if (currentConfig.embeddingProvider === "ollama") {
      recommendations.push(
        "Ollama provides good balance of performance and privacy"
      );
    } else if (currentConfig.embeddingProvider === "dashscope") {
      recommendations.push(
        "DashScope provides high performance for cloud deployments"
      );
    }

    return {
      processingTime,
      memoryUsage,
      searchQuality,
      recommendations,
    };
  }
}
