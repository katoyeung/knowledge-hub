import { Injectable, Logger } from '@nestjs/common';
import { CreateDatasetStepTwoDto } from '../dto/create-dataset-step.dto';

export interface ProcessedEmbeddingConfig {
  mode: 'advanced';
  embeddingModel: string;
  customModelName?: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  enableParentChildChunking: boolean;
  useModelDefaults: boolean;
  separators?: string[];
  embeddingModelProvider?: string;
}

@Injectable()
export class EmbeddingConfigProcessorService {
  private readonly logger = new Logger(EmbeddingConfigProcessorService.name);

  /**
   * Processes the embedding configuration from the DTO
   */
  processConfig(dto: CreateDatasetStepTwoDto): ProcessedEmbeddingConfig {
    this.logger.log(
      `Processing embedding configuration with mode: ${(dto as any).configMode || 'advanced'}`,
    );

    const mode = 'advanced';

    // Determine effective configuration based on mode
    const config: ProcessedEmbeddingConfig = {
      mode: 'advanced',
      embeddingModel: dto.embeddingModel,
      customModelName: dto.customModelName,
      textSplitter: dto.textSplitter,
      chunkSize: dto.chunkSize,
      chunkOverlap: dto.chunkOverlap,
      enableParentChildChunking:
        (dto as any).enableParentChildChunking || false,
      useModelDefaults: dto.useModelDefaults !== false,
      separators: dto.separators,
      embeddingModelProvider: dto.embeddingModelProvider,
    };

    // Apply model-specific optimizations if enabled
    // DISABLED: Model optimizations override user-specified chunk sizes
    // if (config.useModelDefaults) {
    //   this.applyModelOptimizations(config);
    // }

    this.logger.log(
      `Processed configuration: ${JSON.stringify(config, null, 2)}`,
    );
    return config;
  }

  /**
   * Applies model-specific optimizations to the configuration
   */
  private applyModelOptimizations(config: ProcessedEmbeddingConfig): void {
    const originalChunkSize = config.chunkSize;
    const originalChunkOverlap = config.chunkOverlap;

    switch (config.embeddingModel) {
      case 'Xenova/bge-m3':
        config.chunkSize = 800;
        config.chunkOverlap = 80;
        this.logger.log(
          'Applied BGE-M3 optimizations: chunkSize=800, chunkOverlap=80',
        );
        break;
      case 'mixedbread-ai/mxbai-embed-large-v1':
        config.chunkSize = 1000;
        config.chunkOverlap = 100;
        this.logger.log(
          'Applied MixedBread AI optimizations: chunkSize=1000, chunkOverlap=100',
        );
        break;
      case 'WhereIsAI/UAE-Large-V1':
        config.chunkSize = 900;
        config.chunkOverlap = 90;
        this.logger.log(
          'Applied UAE-Large-V1 optimizations: chunkSize=900, chunkOverlap=90',
        );
        break;
      default:
        this.logger.log(
          `No specific optimizations for model: ${config.embeddingModel}`,
        );
    }

    // Log if optimizations were applied
    if (
      config.chunkSize !== originalChunkSize ||
      config.chunkOverlap !== originalChunkOverlap
    ) {
      this.logger.log(
        `Model optimizations applied: chunkSize ${originalChunkSize} -> ${config.chunkSize}, ` +
          `chunkOverlap ${originalChunkOverlap} -> ${config.chunkOverlap}`,
      );
    }
  }

  /**
   * Gets the maximum chunk size allowed for a specific model
   */
  private getMaxChunkSizeForModel(model: string): number {
    // Models that can handle larger chunk sizes
    const largeChunkModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    if (largeChunkModels.includes(model)) {
      return 12000; // Allow up to 12k characters for these models
    }

    // Default limit for most models
    return 8000;
  }

  /**
   * Gets the maximum overlap ratio allowed for a specific model
   */
  private getMaxOverlapRatioForModel(model: string): number {
    // Models that can handle larger overlap ratios
    const largeOverlapModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    if (largeOverlapModels.includes(model)) {
      return 0.15; // Allow up to 15% overlap for these models
    }

    // Default limit for most models (50%)
    return 0.5;
  }

  /**
   * Validates the processed configuration
   */
  validateConfig(config: ProcessedEmbeddingConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate chunk size
    if (config.chunkSize < 100) {
      errors.push('Chunk size must be at least 100 characters');
    }
    // Allow larger chunk sizes for certain models that are optimized for them
    const maxChunkSize = this.getMaxChunkSizeForModel(config.embeddingModel);
    if (config.chunkSize > maxChunkSize) {
      errors.push(
        `Chunk size must not exceed ${maxChunkSize} characters for this model`,
      );
    }

    // Validate chunk overlap
    if (config.chunkOverlap < 0) {
      errors.push('Chunk overlap must be at least 0');
    }
    // Allow larger overlap for models optimized for large chunks
    const maxOverlapRatio = this.getMaxOverlapRatioForModel(
      config.embeddingModel,
    );
    const maxOverlap = Math.floor(config.chunkSize * maxOverlapRatio);
    if (config.chunkOverlap > maxOverlap) {
      errors.push(
        `Chunk overlap must not exceed ${maxOverlap} characters (${Math.round(maxOverlapRatio * 100)}% of chunk size) for this model`,
      );
    }

    // Validate custom model name
    if (config.embeddingModel === 'custom' && !config.customModelName?.trim()) {
      errors.push(
        'Custom model name is required when using custom embedding model',
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Gets configuration summary for logging
   */
  getConfigSummary(config: ProcessedEmbeddingConfig): string {
    const summary = {
      mode: config.mode,
      embeddingModel: config.embeddingModel,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      textSplitter: config.textSplitter,
      enableParentChildChunking: config.enableParentChildChunking,
      useModelDefaults: config.useModelDefaults,
    };

    return (
      `Advanced: ${config.embeddingModel}, ` +
      `chunks: ${config.chunkSize}/${config.chunkOverlap}, ` +
      `splitter: ${config.textSplitter}`
    );
  }

  /**
   * Converts processed config back to DTO format for storage
   */
  toDtoFormat(
    config: ProcessedEmbeddingConfig,
  ): Partial<CreateDatasetStepTwoDto> {
    const dto: any = {
      embeddingModel: config.embeddingModel as any,
      customModelName: config.customModelName,
      textSplitter: config.textSplitter as any,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      enableParentChildChunking: config.enableParentChildChunking,
      useModelDefaults: config.useModelDefaults,
      separators: config.separators,
      embeddingModelProvider: config.embeddingModelProvider,
      configMode: config.mode,
    };

    return dto;
  }
}
