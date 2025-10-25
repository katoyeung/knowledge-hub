import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineConfig } from '../../../pipeline/entities/pipeline-config.entity';
import { PipelineExecution } from '../../../pipeline/entities/pipeline-execution.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { PipelineOrchestrator } from '../../../pipeline/services/pipeline-orchestrator.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';

export interface PipelineJobData {
  executionId: string;
  pipelineConfigId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  segmentIds?: string[];
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    parallelExecution?: boolean;
    notifyOnProgress?: boolean;
  };
  triggerSource?: string;
  triggerData?: Record<string, any>;
}

@Injectable()
export class PipelineJob {
  protected readonly logger = new Logger(PipelineJob.name);
  static readonly jobType = 'pipeline';

  constructor(
    @InjectRepository(PipelineConfig)
    private readonly pipelineConfigRepository: Repository<PipelineConfig>,
    @InjectRepository(PipelineExecution)
    private readonly executionRepository: Repository<PipelineExecution>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly pipelineOrchestrator: PipelineOrchestrator,
    private readonly notificationService: NotificationService,
    protected readonly jobDispatcher: JobDispatcherService,
    protected readonly eventBus: EventBusService,
  ) {}

  async process(data: PipelineJobData): Promise<void> {
    const {
      executionId,
      pipelineConfigId,
      documentId,
      datasetId,
      userId,
      segmentIds,
      options,
      triggerSource,
      triggerData,
    } = data;

    this.logger.log(
      `[PIPELINE] Starting pipeline job execution: ${executionId}`,
    );

    try {
      // Update execution status to running
      await this.executionRepository.update(executionId, {
        status: 'running',
      });

      // Send notification that pipeline started
      await this.notificationService.sendDocumentProcessingUpdate(
        documentId || '',
        datasetId || '',
        {
          status: 'running',
          message: 'Pipeline execution started',
          executionId,
        },
      );

      // Execute pipeline synchronously
      const result = await this.pipelineOrchestrator.executePipelineSync({
        pipelineConfigId,
        documentId,
        datasetId,
        userId,
        segmentIds,
        options,
        triggerSource,
        triggerData,
      });

      this.logger.log(
        `[PIPELINE] Pipeline execution completed: ${executionId}`,
      );

      // Send completion notification
      await this.notificationService.sendDocumentProcessingUpdate(
        documentId || '',
        datasetId || '',
        {
          status: 'completed',
          message: 'Pipeline execution completed successfully',
          executionId,
          metrics: result,
        },
      );
    } catch (error) {
      this.logger.error(
        `[PIPELINE] Pipeline execution failed: ${executionId}`,
        error,
      );

      // Update execution status to failed
      await this.executionRepository.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      });

      // Send failure notification
      await this.notificationService.sendDocumentProcessingUpdate(
        documentId || '',
        datasetId || '',
        {
          status: 'error',
          message: `Pipeline execution failed: ${error.message}`,
          executionId,
          error: error.message,
        },
      );

      throw error;
    }
  }
}
