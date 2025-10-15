import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Embedding } from '../entities/embedding.entity';
import { EmbeddingV2Service } from './embedding-v2.service';
import { ModelMappingService } from '../../../common/services/model-mapping.service';
import {
  WorkerPoolService,
  EmbeddingTask,
  EmbeddingResult,
} from '../../queue/jobs/document/worker-pool.service';
import * as crypto from 'crypto';

export interface EmbeddingConfig {
  model: string;
  customModelName?: string;
  provider: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  enableParentChildChunking?: boolean;
  useModelDefaults?: boolean;
}

export interface EmbeddingProcessingOptions {
  useWorkerPool?: boolean;
  batchSize?: number;
  maxConcurrency?: number;
}

@Injectable()
export class EmbeddingProcessingService {
  private readonly logger = new Logger(EmbeddingProcessingService.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly modelMappingService: ModelMappingService,
    private readonly workerPoolService: WorkerPoolService,
  ) {}

  async processSegments(
    segments: DocumentSegment[],
    config: EmbeddingConfig,
    options: EmbeddingProcessingOptions = {},
  ): Promise<{ processedCount: number; embeddingDimensions?: number }> {
    const {
      useWorkerPool = true,
      batchSize = 5,
      maxConcurrency = 10,
    } = options;

    this.logger.log(
      `[EMBEDDING] Processing ${segments.length} segments with worker pool: ${useWorkerPool}`,
    );

    // Filter segments that need embedding
    const incompleteSegments = segments.filter(
      (segment) => segment.status === 'chunked' || segment.status === 'waiting',
    );

    if (incompleteSegments.length === 0) {
      this.logger.log(`[EMBEDDING] All segments already embedded`);
      return { processedCount: 0 };
    }

    let embeddingDimensions: number | undefined;
    let processedCount = 0;

    if (useWorkerPool && this.workerPoolService.getStats().isEnabled) {
      // Use worker pool for parallel processing
      const result = await this.processWithWorkerPool(
        incompleteSegments,
        config,
        batchSize,
      );
      embeddingDimensions = result.embeddingDimensions;
      processedCount = result.processedCount;
    } else {
      // Use traditional batch processing
      const result = await this.processWithBatching(
        incompleteSegments,
        config,
        batchSize,
      );
      embeddingDimensions = result.embeddingDimensions;
      processedCount = result.processedCount;
    }

    this.logger.log(
      `[EMBEDDING] Completed processing: ${processedCount} segments processed`,
    );
    return { processedCount, embeddingDimensions };
  }

  private async processWithWorkerPool(
    segments: DocumentSegment[],
    config: EmbeddingConfig,
    batchSize: number,
  ): Promise<{ processedCount: number; embeddingDimensions?: number }> {
    this.logger.log(
      `[EMBEDDING] Using worker pool for ${segments.length} segments`,
    );

    let embeddingDimensions: number | undefined;
    let processedCount = 0;

    // Process segments in batches
    const batches = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.log(
        `[EMBEDDING] Processing worker pool batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`,
      );

      // Create tasks for worker pool
      const tasks: EmbeddingTask[] = batch.map((segment, index) => ({
        id: `${segment.id}-${Date.now()}-${index}`,
        text: segment.content,
        model: config.model,
        provider: config.provider,
        customModelName: config.customModelName,
      }));

      try {
        // Process batch with worker pool
        const results =
          await this.workerPoolService.processEmbeddingsBatch(tasks);

        // Process results
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const segment = batch[i];

          if (result.error) {
            this.logger.error(
              `[EMBEDDING] Worker pool error for segment ${segment.id}: ${result.error}`,
            );
            continue;
          }

          // Store dimensions from first embedding
          if (!embeddingDimensions) {
            embeddingDimensions = result.dimensions;
            this.logger.log(
              `[EMBEDDING] Using embedding model ${config.model} with ${embeddingDimensions} dimensions`,
            );
          }

          // Create embedding entity
          const embeddingHash = this.generateEmbeddingHash(
            segment.content,
            config.model,
          );
          const correctModelName = this.modelMappingService.getModelName(
            config.model as any,
            config.provider as any,
          );

          const embedding = this.embeddingRepository.create({
            modelName: correctModelName,
            hash: embeddingHash,
            embedding: result.embedding,
            providerName: config.provider,
          });

          const savedEmbedding = await this.embeddingRepository.save(embedding);

          // Update segment with embedding reference
          await this.segmentRepository.update(segment.id, {
            status: 'embedded',
            embeddingId: savedEmbedding.id,
            completedAt: new Date(),
          });

          processedCount++;
          this.logger.debug(
            `[EMBEDDING] Completed segment ${segment.id} (${processedCount}/${segments.length})`,
          );
        }

        this.logger.log(
          `[EMBEDDING] Completed worker pool batch ${batchIndex + 1}/${batches.length}`,
        );
      } catch (error) {
        this.logger.error(
          `[EMBEDDING] Worker pool batch ${batchIndex + 1} failed:`,
          error,
        );
        // Fallback to individual processing for this batch
        await this.processBatchIndividually(batch, config);
        processedCount += batch.length;
      }
    }

    return { processedCount, embeddingDimensions };
  }

  private async processWithBatching(
    segments: DocumentSegment[],
    config: EmbeddingConfig,
    batchSize: number,
  ): Promise<{ processedCount: number; embeddingDimensions?: number }> {
    this.logger.log(
      `[EMBEDDING] Using traditional batching for ${segments.length} segments`,
    );

    let embeddingDimensions: number | undefined;
    let processedCount = 0;

    // Process segments in batches
    const batches = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.log(
        `[EMBEDDING] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`,
      );

      await this.processBatchIndividually(batch, config);
      processedCount += batch.length;

      this.logger.log(
        `[EMBEDDING] Completed batch ${batchIndex + 1}/${batches.length}`,
      );
    }

    return { processedCount, embeddingDimensions };
  }

  private async processBatchIndividually(
    segments: DocumentSegment[],
    config: EmbeddingConfig,
  ): Promise<void> {
    // Process segments in parallel within each batch
    const batchPromises = segments.map(async (segment) => {
      // Update segment status to embedding
      await this.segmentRepository.update(segment.id, {
        status: 'embedding',
        indexingAt: new Date(),
      });

      // Generate embedding
      const embeddingResult = await this.generateEmbedding(
        segment.content,
        config,
      );

      // Create embedding entity
      const embeddingHash = this.generateEmbeddingHash(
        segment.content,
        config.model,
      );
      const correctModelName = this.modelMappingService.getModelName(
        config.model as any,
        config.provider as any,
      );

      const embedding = this.embeddingRepository.create({
        modelName: correctModelName,
        hash: embeddingHash,
        embedding: embeddingResult.embedding,
        providerName: config.provider,
      });

      const savedEmbedding = await this.embeddingRepository.save(embedding);

      // Update segment with embedding reference
      await this.segmentRepository.update(segment.id, {
        status: 'embedded',
        embeddingId: savedEmbedding.id,
        completedAt: new Date(),
      });

      this.logger.debug(`[EMBEDDING] Completed segment ${segment.id}`);
      return { segment, embedding: savedEmbedding };
    });

    // Wait for all segments in this batch to complete
    await Promise.all(batchPromises);
  }

  private async generateEmbedding(
    text: string,
    config: EmbeddingConfig,
  ): Promise<{ embedding: number[]; model: string; dimensions: number }> {
    this.logger.debug(
      `[EMBEDDING] Generating embedding for text (${text.length} chars) using ${config.model}`,
    );

    return this.embeddingService.generateEmbedding(
      text,
      config.model as any,
      config.provider as any,
      config.customModelName,
    );
  }

  private generateEmbeddingHash(text: string, model: string): string {
    return crypto
      .createHash('sha256')
      .update(text + model)
      .digest('hex');
  }

  async getWorkerPoolStats(): Promise<{
    workerCount: number;
    activeTasks: number;
    queueSize: number;
    isEnabled: boolean;
  }> {
    return this.workerPoolService.getStats();
  }
}
