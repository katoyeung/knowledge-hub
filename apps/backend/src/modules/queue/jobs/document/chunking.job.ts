import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { Dataset } from '../../../dataset/entities/dataset.entity';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { EventTypes } from '../../../event/constants/event-types';
import { NotificationService } from '../../../notification/notification.service';
import {
  ChunkingService,
  ChunkingConfig,
} from '../../../dataset/services/chunking.service';

export interface ChunkingJobData {
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
}

@Injectable()
export class ChunkingJob extends BaseJob<ChunkingJobData> {
  protected readonly logger = new Logger(ChunkingJob.name);
  static readonly jobType = 'chunking';

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    private readonly chunkingService: ChunkingService,
    private readonly notificationService: NotificationService,
    protected readonly jobDispatcher: JobDispatcherService,
    protected readonly eventBus: EventBusService,
  ) {
    super(eventBus, jobDispatcher);
  }

  async process(data: ChunkingJobData): Promise<void> {
    const { documentId, datasetId, userId, embeddingConfig } = data;

    this.logger.log(`[CHUNKING] Starting chunking for document ${documentId}`);

    try {
      // Update document status to chunking
      await this.documentRepository.update(documentId, {
        indexingStatus: 'chunking',
        processingStartedAt: new Date(),
        processingMetadata: {
          currentStage: 'chunking',
        },
      });

      // Send notification that chunking started
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'chunking',
          stage: 'chunking',
          message: 'Document chunking started',
        },
      );

      // Get document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Check if already chunked (resume scenario)
      const existingSegments = await this.segmentRepository.find({
        where: { documentId },
        order: { position: 'ASC' },
      });

      let segments: DocumentSegment[] = [];

      if (existingSegments.length > 0) {
        this.logger.log(
          `[CHUNKING] Resume mode: Found ${existingSegments.length} existing segments`,
        );
        segments = existingSegments;
      } else {
        // Clear any existing segments for this document (in case of reprocessing)
        await this.segmentRepository.delete({ documentId });
        this.logger.log(
          `[CHUNKING] Cleared existing segments for document ${documentId}`,
        );

        // Extract text and create segments
        const chunkingConfig: ChunkingConfig = {
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
        segments = await this.chunkingService.createSegments(
          document,
          datasetId,
          chunkingConfig,
          userId,
        );
      }

      // For posts documents, processPostsDocument creates new source documents
      // and deletes the placeholder. The segments returned are linked to source documents.
      if (document.docType === 'posts' && segments.length > 0) {
        // Group segments by their documentId (source documents)
        const segmentsByDocument = new Map<string, typeof segments>();
        for (const segment of segments) {
          if (!segmentsByDocument.has(segment.documentId)) {
            segmentsByDocument.set(segment.documentId, []);
          }
          segmentsByDocument.get(segment.documentId)!.push(segment);
        }

        this.logger.log(
          `[CHUNKING] Posts document created ${segmentsByDocument.size} source documents with ${segments.length} total segments`,
        );

        // For each source document, update status and dispatch embedding job
        for (const [
          sourceDocId,
          sourceSegments,
        ] of segmentsByDocument.entries()) {
          // Update source document status
          await this.documentRepository.update(sourceDocId, {
            indexingStatus: 'chunked',
            splittingCompletedAt: new Date(),
            wordCount: sourceSegments.reduce(
              (sum, seg) => sum + seg.wordCount,
              0,
            ),
            tokens: sourceSegments.reduce((sum, seg) => sum + seg.tokens, 0),
          });

          // Dispatch embedding job for this source document
          await this.jobDispatcher.dispatch('embedding', {
            documentId: sourceDocId,
            datasetId,
            userId,
            embeddingConfig,
            segmentIds: sourceSegments.map((s) => s.id),
          });

          this.logger.log(
            `[CHUNKING] Dispatched embedding job for source document ${sourceDocId} with ${sourceSegments.length} segments`,
          );
        }

        // Update placeholder document status (if it still exists) or mark as completed
        // The placeholder should have been deleted, but update it if it exists
        const placeholderStillExists = await this.documentRepository.findOne({
          where: { id: documentId },
        });

        if (placeholderStillExists) {
          await this.documentRepository.update(documentId, {
            indexingStatus: 'chunked',
            splittingCompletedAt: new Date(),
          });
        }

        // Send notification that chunking completed
        this.notificationService.sendDocumentProcessingUpdate(
          documentId,
          datasetId,
          {
            status: 'chunked',
            stage: 'chunking',
            message: 'Posts document chunking completed',
            segmentsCount: segments.length,
            wordCount: segments.reduce((sum, seg) => sum + seg.wordCount, 0),
            tokens: segments.reduce((sum, seg) => sum + seg.tokens, 0),
            progress: {
              current: segments.length,
              total: segments.length,
              percentage: 100,
            },
          },
        );

        // Emit chunking completed event
        this.eventBus.publish({
          type: EventTypes.DOCUMENT_CHUNKING_COMPLETED,
          timestamp: Date.now(),
          payload: {
            documentId,
            datasetId,
            segmentCount: segments.length,
          },
        });

        // Exit early since we've handled all source documents
        return;
      }

      // Update document status to chunked
      await this.documentRepository.update(documentId, {
        indexingStatus: 'chunked',
        splittingCompletedAt: new Date(),
        wordCount: segments.reduce((sum, seg) => sum + seg.wordCount, 0),
        tokens: segments.reduce((sum, seg) => sum + seg.tokens, 0),
        processingMetadata: {
          currentStage: 'embedding',
          chunking: {
            startedAt: new Date(),
            completedAt: new Date(),
            segmentCount: segments.length,
          },
        },
      });

      // Send notification that chunking completed
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'chunked',
          stage: 'chunking',
          message: 'Document chunking completed',
          segmentsCount: segments.length,
          wordCount: segments.reduce((sum, seg) => sum + seg.wordCount, 0),
          tokens: segments.reduce((sum, seg) => sum + seg.tokens, 0),
          progress: {
            current: segments.length,
            total: segments.length,
            percentage: 100,
          },
        },
      );

      // Update processing metadata
      this.updateProcessingMetadata(documentId);

      this.logger.log(
        `[CHUNKING] Completed chunking for document ${documentId}: ${segments.length} segments created`,
      );

      // Emit chunking completed event
      this.eventBus.publish({
        type: EventTypes.DOCUMENT_CHUNKING_COMPLETED,
        timestamp: Date.now(),
        payload: {
          documentId,
          datasetId,
          segmentCount: segments.length,
        },
      });

      // Dispatch embedding job
      await this.jobDispatcher.dispatch('embedding', {
        documentId,
        datasetId,
        userId,
        embeddingConfig,
        segmentIds: segments.map((s) => s.id),
      });

      this.logger.log(
        `[CHUNKING] Dispatched embedding job for document ${documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `[CHUNKING] Failed to process document ${documentId}:`,
        error,
      );

      // Update document status to chunking_failed
      await this.documentRepository.update(documentId, {
        indexingStatus: 'chunking_failed',
        error: error.message,
        stoppedAt: new Date(),
      });

      // Send notification that chunking failed
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'error',
          message: 'Document chunking failed',
          error: error.message,
        },
      );

      throw error;
    }
  }

  private updateProcessingMetadata(documentId: string): void {
    // This will be implemented when we add the processingMetadata column
    this.logger.debug(
      `[CHUNKING] Updating processing metadata for document ${documentId}`,
    );
  }
}
