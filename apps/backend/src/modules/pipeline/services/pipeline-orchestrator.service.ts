import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineConfig } from '../entities/pipeline-config.entity';
import { PipelineExecution } from '../entities/pipeline-execution.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  PipelineExecutor,
  ExecutionOptions,
} from './pipeline-executor.service';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { JobDispatcherService } from '../../queue/services/job-dispatcher.service';
import { EventBusService } from '../../event/services/event-bus.service';
import { EventTypes } from '../../event/constants/event-types';
import { NotificationService } from '../../notification/notification.service';
import { v4 as uuidv4 } from 'uuid';

export interface PipelineExecutionRequest {
  pipelineConfigId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  segmentIds?: string[];
  options?: ExecutionOptions;
  triggerSource?: string;
  triggerData?: Record<string, any>;
}

export interface PipelineExecutionResponse {
  executionId: string;
  status: string;
  message: string;
}

@Injectable()
export class PipelineOrchestrator {
  private readonly logger = new Logger(PipelineOrchestrator.name);

  constructor(
    @InjectRepository(PipelineConfig)
    private readonly pipelineConfigRepository: Repository<PipelineConfig>,
    @InjectRepository(PipelineExecution)
    private readonly executionRepository: Repository<PipelineExecution>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly pipelineExecutor: PipelineExecutor,
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly jobDispatcher: JobDispatcherService,
    private readonly eventBus: EventBusService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Execute a pipeline synchronously
   */
  async executePipelineSync(
    request: PipelineExecutionRequest,
  ): Promise<PipelineExecutionResponse> {
    const executionId = uuidv4();
    this.logger.log(`Starting synchronous pipeline execution: ${executionId}`);

    try {
      // Get pipeline configuration
      const pipelineConfig = await this.pipelineConfigRepository.findOne({
        where: { id: request.pipelineConfigId },
      });

      if (!pipelineConfig) {
        throw new Error(
          `Pipeline configuration not found: ${request.pipelineConfigId}`,
        );
      }

      if (!pipelineConfig.isActive) {
        throw new Error(
          `Pipeline configuration is not active: ${request.pipelineConfigId}`,
        );
      }

      // Get input segments
      const inputSegments = await this.getInputSegments(request);
      if (inputSegments.length === 0) {
        throw new Error('No input segments found for pipeline execution');
      }

      // Create execution context
      const context = {
        executionId,
        pipelineConfigId: request.pipelineConfigId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        userId: request.userId,
        logger: this.logger,
        metadata: {
          triggerSource: request.triggerSource || 'manual',
          triggerData: request.triggerData,
        },
      };

      // Execute pipeline
      const execution = await this.pipelineExecutor.executePipeline(
        pipelineConfig,
        inputSegments,
        context,
        request.options || {},
      );

      // Send notifications
      await this.sendExecutionNotifications(execution, request.userId);

      // Publish event
      this.eventBus.publish({
        type: EventTypes.PIPELINE_EXECUTION_COMPLETED,
        timestamp: Date.now(),
        payload: {
          executionId: execution.id,
          data: {
            pipelineConfigId: pipelineConfig.id,
            status: execution.status,
            metrics: execution.metrics,
          },
        },
      });

      return {
        executionId: execution.id,
        status: execution.status,
        message: `Pipeline execution ${execution.status}`,
      };
    } catch (error) {
      this.logger.error(`Pipeline execution failed: ${executionId}`, error);

      // Update execution status if it exists
      await this.executionRepository.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute a pipeline asynchronously via queue
   */
  async executePipelineAsync(
    request: PipelineExecutionRequest,
  ): Promise<PipelineExecutionResponse> {
    const executionId = uuidv4();
    this.logger.log(`Starting asynchronous pipeline execution: ${executionId}`);

    try {
      // Validate pipeline configuration
      const pipelineConfig = await this.pipelineConfigRepository.findOne({
        where: { id: request.pipelineConfigId },
      });

      if (!pipelineConfig) {
        throw new Error(
          `Pipeline configuration not found: ${request.pipelineConfigId}`,
        );
      }

      if (!pipelineConfig.isActive) {
        throw new Error(
          `Pipeline configuration is not active: ${request.pipelineConfigId}`,
        );
      }

      // Create execution record
      const execution = this.executionRepository.create({
        id: executionId,
        pipelineConfigId: request.pipelineConfigId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        status: 'pending',
        startedAt: new Date(),
        stepResults: [],
        metrics: {
          totalSteps: pipelineConfig.steps.length,
          completedSteps: 0,
          failedSteps: 0,
          skippedSteps: 0,
          totalDuration: 0,
          averageStepDuration: 0,
          inputSegments: 0,
          outputSegments: 0,
          segmentsProcessed: 0,
          segmentsFiltered: 0,
          segmentsSummarized: 0,
          embeddingsGenerated: 0,
          graphNodesCreated: 0,
          graphEdgesCreated: 0,
        },
        triggerSource: request.triggerSource || 'manual',
        triggerData: request.triggerData,
      });

      await this.executionRepository.save(execution);

      // Dispatch pipeline job
      await this.jobDispatcher.dispatch('pipeline', {
        executionId,
        pipelineConfigId: request.pipelineConfigId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        userId: request.userId,
        segmentIds: request.segmentIds,
        options: request.options,
        triggerSource: request.triggerSource,
        triggerData: request.triggerData,
      });

      return {
        executionId,
        status: 'pending',
        message: 'Pipeline execution queued successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to queue pipeline execution: ${executionId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Cancel a pipeline execution
   */
  async cancelExecution(
    executionId: string,
    userId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const execution = await this.executionRepository.findOne({
        where: { id: executionId },
      });

      if (!execution) {
        return { success: false, message: 'Execution not found' };
      }

      if (execution.status === 'completed' || execution.status === 'failed') {
        return { success: false, message: 'Execution is already finished' };
      }

      await this.executionRepository.update(executionId, {
        status: 'cancelled',
        completedAt: new Date(),
        cancellationReason: reason || 'Cancelled by user',
        cancelledBy: userId,
        cancelledAt: new Date(),
      });

      // Publish cancellation event
      this.eventBus.publish({
        type: EventTypes.PIPELINE_EXECUTION_CANCELLED,
        timestamp: Date.now(),
        payload: {
          executionId,
          data: {
            reason,
            cancelledBy: userId,
          },
        },
      });

      return { success: true, message: 'Execution cancelled successfully' };
    } catch (error) {
      this.logger.error(`Failed to cancel execution: ${executionId}`, error);
      return { success: false, message: 'Failed to cancel execution' };
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(
    executionId: string,
  ): Promise<PipelineExecution | null> {
    return await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['pipelineConfig'],
    });
  }

  /**
   * Get execution history for a pipeline configuration
   */
  async getExecutionHistory(
    pipelineConfigId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ executions: PipelineExecution[]; total: number }> {
    const [executions, total] = await this.executionRepository.findAndCount({
      where: { pipelineConfigId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { executions, total };
  }

  /**
   * Get input segments for pipeline execution
   */
  private async getInputSegments(
    request: PipelineExecutionRequest,
  ): Promise<DocumentSegment[]> {
    if (request.segmentIds && request.segmentIds.length > 0) {
      // Use specific segment IDs
      return await this.segmentRepository.findByIds(request.segmentIds);
    } else if (request.documentId) {
      // Get all segments for a document
      return await this.segmentRepository.find({
        where: { documentId: request.documentId },
        order: { position: 'ASC' },
      });
    } else if (request.datasetId) {
      // Get all segments for a dataset
      return await this.segmentRepository.find({
        where: { datasetId: request.datasetId },
        order: { position: 'ASC' },
      });
    } else {
      throw new Error('No input segments specified for pipeline execution');
    }
  }

  /**
   * Send execution notifications
   */
  private async sendExecutionNotifications(
    execution: PipelineExecution,
    userId: string,
  ): Promise<void> {
    try {
      if (execution.status === 'completed') {
        await this.notificationService.sendDocumentProcessingUpdate(
          execution.documentId || '',
          execution.datasetId || '',
          {
            status: 'completed',
            message: `Pipeline execution completed successfully`,
            metrics: execution.metrics,
          },
        );
      } else if (execution.status === 'failed') {
        await this.notificationService.sendDocumentProcessingUpdate(
          execution.documentId || '',
          execution.datasetId || '',
          {
            status: 'error',
            message: `Pipeline execution failed: ${execution.error}`,
            error: execution.error,
          },
        );
      }
    } catch (error) {
      this.logger.warn('Failed to send execution notifications:', error);
    }
  }
}
