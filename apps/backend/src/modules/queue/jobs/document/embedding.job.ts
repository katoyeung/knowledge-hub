import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { Embedding } from '../../../dataset/entities/embedding.entity';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { EventTypes } from '../../../event/constants/event-types';
import { NotificationService } from '../../../notification/notification.service';
import {
  EmbeddingProcessingService,
  EmbeddingConfig,
} from '../../../dataset/services/embedding-processing.service';

export interface EmbeddingJobData {
  documentId: string;
  datasetId: string;
  userId: string;
  embeddingConfig: {
    model: string;
    customModelName?: string;
    provider: string;
    textSplitter: string;
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
    enableParentChildChunking?: boolean;
    useModelDefaults?: boolean;
  };
  segmentIds?: string[];
}

@Injectable()
export class EmbeddingJob extends BaseJob<EmbeddingJobData> {
  protected readonly logger = new Logger(EmbeddingJob.name);
  static readonly jobType = 'embedding';

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    private readonly embeddingProcessingService: EmbeddingProcessingService,
    private readonly notificationService: NotificationService,
    protected readonly jobDispatcher: JobDispatcherService,
    protected readonly eventBus: EventBusService,
  ) {
    super(eventBus, jobDispatcher);
  }

  async process(data: EmbeddingJobData): Promise<void> {
    const { documentId, datasetId, userId, embeddingConfig, segmentIds } = data;

    this.logger.log(
      `[EMBEDDING] Starting embedding generation for document ${documentId}`,
    );

    try {
      // Update document status to embedding
      await this.documentRepository.update(documentId, {
        indexingStatus: 'embedding',
        processingMetadata: {
          currentStage: 'embedding',
        },
      });

      // Send notification that embedding started
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'embedding',
          stage: 'embedding',
          message: 'Document embedding started',
        },
      );

      // Get segments to process
      const segments = await this.segmentRepository.find({
        where: segmentIds ? { id: In(segmentIds) } : { documentId },
        order: { position: 'ASC' },
      });

      // Filter segments that need embedding
      const incompleteSegments = segments.filter(
        (segment) =>
          segment.status === 'chunked' || segment.status === 'waiting',
      );

      this.logger.log(
        `[EMBEDDING] Processing ${incompleteSegments.length} segments for document ${documentId}`,
      );

      if (incompleteSegments.length === 0) {
        this.logger.log(
          `[EMBEDDING] All segments already embedded for document ${documentId}`,
        );
        await this.completeEmbeddingStage(documentId, datasetId);
        return;
      }

      // Process segments using EmbeddingProcessingService
      const processingConfig: EmbeddingConfig = {
        model: embeddingConfig.model,
        customModelName: embeddingConfig.customModelName,
        provider: embeddingConfig.provider,
        textSplitter: embeddingConfig.textSplitter,
        chunkSize: embeddingConfig.chunkSize,
        chunkOverlap: embeddingConfig.chunkOverlap,
        separators: embeddingConfig.separators,
        enableParentChildChunking: embeddingConfig.enableParentChildChunking,
        useModelDefaults: embeddingConfig.useModelDefaults,
      };

      // Send progress notification for embedding start
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'embedding',
          stage: 'embedding',
          message: `Processing embeddings: 0/${incompleteSegments.length} segments`,
          progress: {
            current: 0,
            total: incompleteSegments.length,
            percentage: 0,
          },
        },
      );

      const result = await this.embeddingProcessingService.processSegments(
        incompleteSegments,
        processingConfig,
        {
          useWorkerPool: true,
          batchSize: 5,
        },
        documentId,
        datasetId,
      );

      const embeddingDimensions = result.embeddingDimensions;
      const processedCount = result.processedCount;

      // Update document with embedding dimensions
      await this.documentRepository.update(documentId, {
        embeddingModel: embeddingConfig.model,
        embeddingDimensions: embeddingDimensions,
        processingMetadata: {
          currentStage: 'completed',
          embedding: {
            startedAt: new Date(),
            completedAt: new Date(),
            processedCount: processedCount,
            totalCount: incompleteSegments.length,
          },
        },
      });

      // Send progress notification for embedding completion
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'embedded',
          stage: 'embedding',
          message: `Embedding completed: ${processedCount}/${incompleteSegments.length} segments`,
          progress: {
            current: processedCount,
            total: incompleteSegments.length,
            percentage: 100,
          },
        },
      );

      this.logger.log(
        `[EMBEDDING] Completed embedding generation for document ${documentId}: ${processedCount} segments processed`,
      );

      // Complete embedding stage and dispatch next job
      await this.completeEmbeddingStage(documentId, datasetId);
    } catch (error) {
      this.logger.error(
        `[EMBEDDING] Failed to process document ${documentId}:`,
        error,
      );

      // Update document status to embedding_failed
      await this.documentRepository.update(documentId, {
        indexingStatus: 'embedding_failed',
        error: error.message,
        stoppedAt: new Date(),
      });

      // Send notification that embedding failed
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'error',
          message: 'Document embedding failed',
          error: error.message,
        },
      );

      throw error;
    }
  }

  private async completeEmbeddingStage(
    documentId: string,
    datasetId: string,
  ): Promise<void> {
    // Update document status to embedded
    await this.documentRepository.update(documentId, {
      indexingStatus: 'embedded',
    });

    // Send notification that embedding completed
    this.notificationService.sendDocumentProcessingUpdate(
      documentId,
      datasetId,
      {
        status: 'embedded',
        message: 'Document embedding completed',
      },
    );

    // Update processing metadata
    await this.updateProcessingMetadata(documentId, {
      currentStage: 'completed',
      embedding: {
        startedAt: new Date(),
        completedAt: new Date(),
        processedCount: 0, // Will be updated with actual count
        totalCount: 0,
      },
    });

    // Emit embedding completed event
    this.eventBus.publish({
      type: EventTypes.DOCUMENT_EMBEDDING_COMPLETED,
      timestamp: Date.now(),
      payload: {
        documentId,
        datasetId,
      },
    });

    // Check if all segments are properly embedded before marking as completed
    const remainingSegments = await this.segmentRepository.find({
      where: {
        documentId,
        status: In(['embedding', 'waiting', 'chunked']),
      },
    });

    if (remainingSegments.length > 0) {
      this.logger.warn(
        `[EMBEDDING] Document ${documentId} has ${remainingSegments.length} segments still processing. Not marking as completed.`,
      );

      // Mark document as embedding_failed due to incomplete segments
      await this.documentRepository.update(documentId, {
        indexingStatus: 'embedding_failed',
        error: `${remainingSegments.length} segments failed to embed properly`,
        stoppedAt: new Date(),
      });

      // Send notification that embedding failed
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'embedding_failed',
          message: `${remainingSegments.length} segments failed to embed properly`,
        },
      );

      throw new Error(
        `Document processing failed: ${remainingSegments.length} segments did not complete embedding`,
      );
    }

    // All segments are embedded, mark document as completed
    await this.documentRepository.update(documentId, {
      indexingStatus: 'completed',
      completedAt: new Date(),
    });

    // Send notification that processing completed
    this.notificationService.sendDocumentProcessingUpdate(
      documentId,
      datasetId,
      {
        status: 'completed',
        message: 'Document processing completed',
      },
    );

    this.eventBus.publish({
      type: EventTypes.DOCUMENT_PROCESSING_COMPLETED,
      timestamp: Date.now(),
      payload: {
        documentId,
        datasetId,
      },
    });

    this.logger.log(`[EMBEDDING] Document ${documentId} processing completed`);
  }

  private async updateProcessingMetadata(
    documentId: string,
    metadata: any,
  ): Promise<void> {
    // This will be implemented when we add the processingMetadata column
    this.logger.debug(
      `[EMBEDDING] Updating processing metadata for document ${documentId}`,
    );
  }
}
