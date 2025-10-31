import { Injectable } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { EmbeddingProcessingService } from '../../dataset/services/embedding-processing.service';
import { EmbeddingConfig } from '../../dataset/services/embedding-processing.service';

export interface EmbeddingGenerationConfig extends StepConfig {
  model: string;
  provider: string;
  customModelName?: string;
  batchSize?: number;
  useWorkerPool?: boolean;
  maxConcurrency?: number;
  skipExisting?: boolean; // Skip segments that already have embeddings
  updateExisting?: boolean; // Update existing embeddings
}

@Injectable()
export class EmbeddingGenerationStep extends BaseStep {
  constructor(
    private readonly embeddingProcessingService: EmbeddingProcessingService,
  ) {
    super('embedding_generation', 'Embedding Generation');
  }

  protected async executeStep(
    _inputSegments: DocumentSegment[],
    _config: any,
    _context: any,
  ): Promise<DocumentSegment[]> {
    this.logger.warn('executeStep() not yet migrated - using old execute()');
    return [];
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: EmbeddingGenerationConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting embedding generation for ${inputSegments.length} segments`,
    );

    try {
      // Filter segments that need embedding
      const segmentsToProcess = inputSegments.filter((segment) =>
        this.shouldProcessSegment(segment, config),
      );

      this.logger.log(
        `Found ${segmentsToProcess.length} segments eligible for embedding generation`,
      );

      if (segmentsToProcess.length === 0) {
        this.logger.log('No segments need embedding generation');
        return {
          success: true,
          outputSegments: inputSegments,
          metrics: this.calculateMetrics(
            inputSegments,
            inputSegments,
            startTime,
            new Date(),
          ),
          rollbackData: this.createRollbackData(inputSegments, config),
        };
      }

      // Create embedding configuration
      const embeddingConfig: EmbeddingConfig = {
        model: config.model,
        customModelName: config.customModelName,
        provider: config.provider,
        textSplitter: 'recursive_character', // Default
        chunkSize: 1000, // Default
        chunkOverlap: 200, // Default
        enableParentChildChunking: false,
        useModelDefaults: true,
      };

      // Process embeddings
      const result = await this.embeddingProcessingService.processSegments(
        segmentsToProcess,
        embeddingConfig,
        {
          useWorkerPool: config.useWorkerPool !== false,
          batchSize: config.batchSize || 5,
          maxConcurrency: config.maxConcurrency || 3,
        },
        context.documentId,
        context.datasetId,
      );

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        inputSegments,
        startTime,
        endTime,
      );

      // Add specific metrics for embedding generation
      metrics.segmentsProcessed = segmentsToProcess.length;
      metrics.embeddingsGenerated = result.processedCount;
      metrics.embeddingDimensions = result.embeddingDimensions;
      metrics.embeddingRate =
        segmentsToProcess.length > 0
          ? result.processedCount / segmentsToProcess.length
          : 0;

      this.logger.log(
        `Embedding generation completed: ${result.processedCount} embeddings generated`,
      );

      return {
        success: true,
        outputSegments: inputSegments, // Segments are updated in place
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      this.logger.error('Embedding generation failed:', error);
      return {
        success: false,
        outputSegments: inputSegments, // Return original segments on error
        metrics: this.calculateMetrics(
          inputSegments,
          inputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    }
  }

  async validate(
    config: EmbeddingGenerationConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model is required');
    }

    if (!config.provider) {
      errors.push('Provider is required');
    } else if (
      !['local', 'openai', 'openrouter', 'ollama', 'dashscope'].includes(
        config.provider,
      )
    ) {
      errors.push(
        'Provider must be one of: local, openai, openrouter, ollama, dashscope',
      );
    }

    if (config.batchSize !== undefined && config.batchSize <= 0) {
      errors.push('Batch size must be a positive number');
    }

    if (config.maxConcurrency !== undefined && config.maxConcurrency <= 0) {
      errors.push('Max concurrency must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log('Rolling back embedding generation step');
      // For embedding generation, rollback would involve removing generated embeddings
      // This is complex and typically not needed as embeddings don't break the pipeline
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'embedding_generation',
      name: 'Embedding Generation',
      description: 'Generate vector embeddings for document segments',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'Embedding model to use',
          },
          provider: {
            type: 'string',
            enum: ['local', 'openai', 'openrouter', 'ollama', 'dashscope'],
            description: 'Embedding provider',
          },
          customModelName: {
            type: 'string',
            description: 'Custom model name (for OpenRouter)',
          },
          batchSize: {
            type: 'number',
            minimum: 1,
            default: 5,
            description: 'Number of segments to process in parallel',
          },
          useWorkerPool: {
            type: 'boolean',
            default: true,
            description: 'Whether to use worker pool for processing',
          },
          maxConcurrency: {
            type: 'number',
            minimum: 1,
            default: 3,
            description: 'Maximum concurrent processing threads',
          },
          skipExisting: {
            type: 'boolean',
            default: true,
            description: 'Skip segments that already have embeddings',
          },
          updateExisting: {
            type: 'boolean',
            default: false,
            description: 'Update existing embeddings',
          },
        },
        required: ['model', 'provider'],
      },
    };
  }

  private shouldProcessSegment(
    segment: DocumentSegment,
    config: EmbeddingGenerationConfig,
  ): boolean {
    // Check if segment already has embedding
    if (config.skipExisting && segment.embeddingId) {
      return false;
    }

    // Check if we should update existing embeddings
    if (!config.updateExisting && segment.embeddingId) {
      return false;
    }

    // Check if segment has content
    if (!segment.content || segment.content.trim().length === 0) {
      return false;
    }

    // Check segment status
    if (segment.status === 'completed' && config.skipExisting) {
      return false;
    }

    return true;
  }
}
