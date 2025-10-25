import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowExecution } from '../../../pipeline/entities/workflow-execution.entity';
import { Workflow } from '../../../pipeline/entities/workflow.entity';
import {
  WorkflowExecutor,
  WorkflowExecutionContext,
} from '../../../pipeline/services/workflow-executor.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { EventTypes } from '../../../event/constants/event-types';
import { NotificationService } from '../../../notification/notification.service';
import { BaseJob } from '../base/base.job';
import { JobDispatcherService } from '../../services/job-dispatcher.service';

export interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  inputData?: any[];
  options?: {
    maxConcurrency?: number;
    timeout?: number;
    enableSnapshots?: boolean;
    snapshotInterval?: number;
  };
  triggerSource?: string;
  triggerData?: Record<string, any>;
}

@Injectable()
export class WorkflowJob extends BaseJob<WorkflowJobData> {
  protected static readonly jobType = 'workflow';

  constructor(
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    private readonly workflowExecutor: WorkflowExecutor,
    private readonly notificationService: NotificationService,
    eventBus: EventBusService,
    jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);
  }

  async process(data: WorkflowJobData): Promise<void> {
    const {
      executionId,
      workflowId,
      documentId,
      datasetId,
      userId,
      inputData,
      options,
      triggerSource,
      triggerData,
    } = data;

    this.logger.log(
      `[WORKFLOW_JOB] Starting workflow job execution: ${executionId}`,
    );

    try {
      // Get workflow configuration
      const workflow = await this.workflowRepository.findOne({
        where: { id: workflowId },
      });

      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      if (!workflow.isActive) {
        throw new Error(`Workflow is not active: ${workflowId}`);
      }

      // Update execution status to running
      await this.executionRepository.update(executionId, {
        status: 'running',
      });

      // Publish start event
      this.eventBus.publish({
        type: EventTypes.PIPELINE_EXECUTION_STARTED,
        timestamp: Date.now(),
        payload: {
          executionId,
          data: {
            workflowId,
            documentId,
            datasetId,
            userId,
          },
        },
      });

      // Get input data
      const workflowInputData = inputData || (await this.getInputData(data));

      // Create execution context
      const context: WorkflowExecutionContext = {
        executionId,
        workflowId,
        documentId,
        datasetId,
        userId,
        logger: this.logger,
        metadata: {
          triggerSource: triggerSource || 'queue',
          triggerData,
          options,
        },
      };

      // Execute workflow
      const result = await this.workflowExecutor.executeWorkflow(
        workflow,
        workflowInputData,
        context,
      );

      this.logger.log(
        `[WORKFLOW_JOB] Workflow execution completed: ${executionId}`,
      );

      // Send completion notification
      this.eventBus.publish({
        type: EventTypes.PIPELINE_EXECUTION_COMPLETED,
        timestamp: Date.now(),
        payload: {
          executionId,
          data: {
            workflowId,
            status: result.status,
            metrics: result.metrics,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `[WORKFLOW_JOB] Workflow execution failed: ${executionId}`,
        error,
      );

      // Update execution status to failed
      await this.executionRepository.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      });

      // Publish failure event
      this.eventBus.publish({
        type: EventTypes.PIPELINE_EXECUTION_FAILED,
        timestamp: Date.now(),
        payload: {
          executionId,
          data: {
            workflowId,
            error: error.message,
          },
        },
      });

      throw error;
    }
  }

  private async getInputData(data: WorkflowJobData): Promise<any[]> {
    // This would implement the same logic as WorkflowOrchestrator.getInputData
    // For now, return empty array
    return [];
  }
}
