import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { EventBusService } from '../../../event/services/event-bus.service';
import { EventTypes } from '../../../event/constants/event-types';
import { NotificationService } from '../../../notification/notification.service';
import { NerProcessingService } from '../../../dataset/services/ner-processing.service';

export interface NerJobData {
  documentId: string;
  datasetId: string;
}

@Injectable()
export class NerJob extends BaseJob<NerJobData> {
  protected readonly logger = new Logger(NerJob.name);
  static readonly jobType = 'ner';

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly nerProcessingService: NerProcessingService,
    private readonly notificationService: NotificationService,
    protected readonly eventBus: EventBusService,
  ) {
    super(eventBus, null as any); // NerJob doesn't need jobDispatcher
  }

  async process(data: NerJobData): Promise<void> {
    const { documentId, datasetId } = data;

    this.logger.log(`[NER] Starting NER processing for document ${documentId}`);

    try {
      // Update document status to ner_processing
      await this.documentRepository.update(documentId, {
        indexingStatus: 'ner_processing',
      });

      // Send notification that NER started
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'ner_processing',
          message: 'Document NER processing started',
        },
      );

      // Process segments using NerProcessingService
      const result = await this.nerProcessingService.processDocumentSegments(
        documentId,
        {
          batchSize: 10,
          maxConcurrency: 5,
        },
      );

      const processedCount = result.processedCount;
      this.logger.log(
        `[NER] Completed NER processing for document ${documentId}: ${processedCount} segments processed`,
      );

      // Complete NER stage
      await this.completeNerStage(documentId, datasetId);
    } catch (error) {
      this.logger.error(
        `[NER] Failed to process document ${documentId}:`,
        error,
      );

      // Update document status to ner_failed
      await this.documentRepository.update(documentId, {
        indexingStatus: 'ner_failed',
        error: error.message,
        stoppedAt: new Date(),
      });

      // Send notification that NER failed
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'error',
          message: 'Document NER processing failed',
          error: error.message,
        },
      );

      throw error;
    }
  }

  private async completeNerStage(
    documentId: string,
    datasetId: string,
  ): Promise<void> {
    // Update document status to completed
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

    // Update processing metadata
    await this.updateProcessingMetadata(documentId, {
      currentStage: 'completed',
      ner: {
        startedAt: new Date(),
        completedAt: new Date(),
        processedCount: 0, // Will be updated with actual count
        totalCount: 0,
        enabled: true,
      },
    });

    // Emit NER completed event
    this.eventBus.publish({
      type: EventTypes.DOCUMENT_NER_COMPLETED,
      timestamp: Date.now(),
      payload: {
        documentId,
        datasetId,
      },
    });

    // Emit overall processing completed event
    this.eventBus.publish({
      type: EventTypes.DOCUMENT_PROCESSING_COMPLETED,
      timestamp: Date.now(),
      payload: {
        documentId,
        datasetId,
      },
    });

    this.logger.log(`[NER] Document ${documentId} processing completed`);
  }

  private async updateProcessingMetadata(
    documentId: string,
    metadata: any,
  ): Promise<void> {
    // This will be implemented when we add the processingMetadata column
    this.logger.debug(
      `[NER] Updating processing metadata for document ${documentId}`,
    );
  }
}
