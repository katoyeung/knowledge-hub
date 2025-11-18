import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { RegisterJob } from '../../decorators/register-job.decorator';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { GraphExtractionService } from '../../../graph/services/graph-extraction.service';
import { CreateGraphExtractionConfigDto } from '../../../graph/dto/create-graph-extraction-config.dto';
import { JobDispatcherService } from '../../services/job-dispatcher.service';

export interface GraphExtractionJobData {
  documentId: string;
  datasetId: string;
  segmentIds?: string[];
  extractionConfig: CreateGraphExtractionConfigDto;
  userId: string;
}

@RegisterJob('graph-extraction')
@Injectable()
export class GraphExtractionJob extends BaseJob<GraphExtractionJobData> {
  protected readonly logger = new Logger(GraphExtractionJob.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly graphExtractionService: GraphExtractionService,
    private readonly notificationService: NotificationService,
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);

    this.logger.log(
      `GraphExtractionJob initialized with jobType: ${this.jobType}`,
    );
  }

  async process(data: GraphExtractionJobData): Promise<void> {
    const { documentId, datasetId, segmentIds, extractionConfig, userId } =
      data;

    this.logger.log(
      `🚀 [GRAPH_EXTRACTION] Starting graph extraction for document ${documentId}`,
    );

    try {
      // Update document status to graph_extraction_processing
      await this.documentRepository.update(documentId, {
        indexingStatus: 'graph_extraction_processing',
      });

      // Send notification that graph extraction started
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'graph_extraction_processing',
          message: 'Starting graph extraction...',
        },
      );

      // Get segments to process
      let segmentsToProcess: string[];
      if (segmentIds && segmentIds.length > 0) {
        segmentsToProcess = segmentIds;
      } else {
        // Get all segments for the document
        const segments = await this.segmentRepository.find({
          where: { documentId },
          select: ['id'],
        });
        segmentsToProcess = segments.map((s) => s.id);
      }

      if (segmentsToProcess.length === 0) {
        this.logger.warn(`No segments found for document ${documentId}`);
        await this.documentRepository.update(documentId, {
          indexingStatus: 'completed',
        });
        return;
      }

      this.logger.log(
        `Processing ${segmentsToProcess.length} segments for graph extraction`,
      );

      // Perform graph extraction
      const result = await this.graphExtractionService.extractFromSegments(
        segmentsToProcess,
        datasetId,
        documentId,
        userId,
        extractionConfig,
      );

      this.logger.log(
        `✅ Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
      );

      // Update document status to completed
      await this.documentRepository.update(documentId, {
        indexingStatus: 'completed',
        completedAt: new Date(),
      });

      // Update processing metadata
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
      });

      if (document) {
        const updatedMetadata = {
          ...document.processingMetadata,
          graphExtraction: {
            startedAt: new Date(),
            completedAt: new Date(),
            nodesCreated: result.nodesCreated,
            edgesCreated: result.edgesCreated,
            segmentsProcessed: segmentsToProcess.length,
            enabled: true,
          },
        };

        await this.documentRepository.update(documentId, {
          processingMetadata: updatedMetadata,
        });
      }

      // Send success notification
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'completed',
          message: `Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
        },
      );

      // Also send graph extraction specific notification
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'completed',
          message: `Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
          nodesCreated: result.nodesCreated,
          edgesCreated: result.edgesCreated,
          segmentsProcessed: segmentsToProcess.length,
          segmentIds: segmentsToProcess, // Include segment IDs so frontend knows which segments to update
        },
      );

      this.logger.log(
        `[GRAPH_EXTRACTION] Successfully completed graph extraction for document ${documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `[GRAPH_EXTRACTION] Error processing graph extraction for document ${documentId}:`,
        error,
      );

      // Update document status to error
      await this.documentRepository.update(documentId, {
        indexingStatus: 'error',
        error: error instanceof Error ? error.message : String(error),
        stoppedAt: new Date(),
      });

      // Send error notification
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'error',
          message: `Graph extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      );

      // Also send graph extraction specific error notification
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'error',
          message: `Graph extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      throw error;
    }
  }
}
