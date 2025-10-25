import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  WorkflowExecutor,
  WorkflowExecutionContext,
} from './workflow-executor.service';
import { JobDispatcherService } from '../../queue/services/job-dispatcher.service';
import { EventBusService } from '../../event/services/event-bus.service';
import { EventTypes } from '../../event/constants/event-types';
import { NotificationService } from '../../notification/notification.service';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowExecutionRequest {
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

export interface WorkflowExecutionResponse {
  executionId: string;
  status: string;
  message: string;
  workflowName?: string;
}

@Injectable()
export class WorkflowOrchestrator {
  private readonly logger = new Logger(WorkflowOrchestrator.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly workflowExecutor: WorkflowExecutor,
    private readonly jobDispatcher: JobDispatcherService,
    private readonly eventBus: EventBusService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Execute a workflow synchronously
   */
  async executeWorkflowSync(
    request: WorkflowExecutionRequest,
  ): Promise<WorkflowExecutionResponse> {
    const executionId = uuidv4();
    this.logger.log(`Starting synchronous workflow execution: ${executionId}`);

    try {
      // Get workflow configuration
      const workflow = await this.workflowRepository.findOne({
        where: { id: request.workflowId },
      });

      if (!workflow) {
        throw new Error(`Workflow not found: ${request.workflowId}`);
      }

      if (!workflow.isActive) {
        throw new Error(`Workflow is not active: ${request.workflowId}`);
      }

      // Get input data
      const inputData = await this.getInputData(request);
      if (inputData.length === 0) {
        throw new Error('No input data found for workflow execution');
      }

      // Create execution context
      const context: WorkflowExecutionContext = {
        executionId,
        workflowId: request.workflowId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        userId: request.userId,
        logger: this.logger,
        metadata: {
          triggerSource: request.triggerSource || 'manual',
          triggerData: request.triggerData,
          options: request.options,
        },
      };

      // Execute workflow
      const execution = await this.workflowExecutor.executeWorkflow(
        workflow,
        inputData,
        context,
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
            workflowId: workflow.id,
            status: execution.status,
            metrics: execution.metrics,
          },
        },
      });

      return {
        executionId: execution.id,
        status: execution.status,
        message: `Workflow execution ${execution.status}`,
        workflowName: workflow.name,
      };
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${executionId}`, error);

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
   * Execute a workflow asynchronously via queue
   */
  async executeWorkflowAsync(
    request: WorkflowExecutionRequest,
  ): Promise<WorkflowExecutionResponse> {
    const executionId = uuidv4();
    this.logger.log(`Starting asynchronous workflow execution: ${executionId}`);

    try {
      // Validate workflow configuration
      const workflow = await this.workflowRepository.findOne({
        where: { id: request.workflowId },
      });

      if (!workflow) {
        throw new Error(`Workflow not found: ${request.workflowId}`);
      }

      if (!workflow.isActive) {
        throw new Error(`Workflow is not active: ${request.workflowId}`);
      }

      // Create execution record
      const execution = this.executionRepository.create({
        id: executionId,
        workflowId: request.workflowId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        userId: request.userId,
        status: 'pending',
        startedAt: new Date(),
        nodeSnapshots: [],
        metrics: {
          totalNodes: workflow.nodes.length,
          completedNodes: 0,
          failedNodes: 0,
          skippedNodes: 0,
          totalDuration: 0,
          averageNodeDuration: 0,
          totalDataProcessed: 0,
          peakMemoryUsage: 0,
          averageCpuUsage: 0,
          dataThroughput: 0,
        },
        triggerSource: request.triggerSource || 'manual',
        triggerData: request.triggerData,
        executionContext: {
          userId: request.userId,
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0',
          parameters: request.options || {},
        },
      });

      await this.executionRepository.save(execution);

      // Dispatch workflow job
      await this.jobDispatcher.dispatch('workflow', {
        executionId,
        workflowId: request.workflowId,
        documentId: request.documentId,
        datasetId: request.datasetId,
        userId: request.userId,
        inputData: request.inputData,
        options: request.options,
        triggerSource: request.triggerSource,
        triggerData: request.triggerData,
      });

      return {
        executionId,
        status: 'pending',
        message: 'Workflow execution queued successfully',
        workflowName: workflow.name,
      };
    } catch (error) {
      this.logger.error(
        `Failed to queue workflow execution: ${executionId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Optimize execution data by limiting large datasets
   */
  private optimizeExecutionData(
    execution: WorkflowExecution,
  ): WorkflowExecution {
    console.log('🔧 Optimizing execution data for execution:', execution.id);
    if (!execution.nodeSnapshots) {
      return execution;
    }

    const optimizedSnapshots = execution.nodeSnapshots.map((snapshot) => {
      const optimizedSnapshot = { ...snapshot };

      // Optimize outputData - remove large items array, keep only sample
      if (
        optimizedSnapshot.outputData?.items &&
        Array.isArray(optimizedSnapshot.outputData.items)
      ) {
        if (optimizedSnapshot.outputData.items.length > 10) {
          const { items, ...restOutputData } = optimizedSnapshot.outputData;
          optimizedSnapshot.outputData = {
            ...restOutputData,
            meta: {
              ...optimizedSnapshot.outputData.meta,
              totalCount: items.length,
              sampleCount: optimizedSnapshot.outputData.sample?.length || 10,
              hasMoreData: true,
              lastUpdated: new Date().toISOString(),
            },
          };
        }
      }

      return optimizedSnapshot;
    });

    const optimizedExecution = {
      ...execution,
      nodeSnapshots: optimizedSnapshots,
    };

    const originalSize = JSON.stringify(execution).length;
    const optimizedSize = JSON.stringify(optimizedExecution).length;
    console.log(
      `📊 Size reduction: ${originalSize} -> ${optimizedSize} bytes (${Math.round((1 - optimizedSize / originalSize) * 100)}% reduction)`,
    );

    return optimizedExecution;
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(
    executionId: string,
  ): Promise<WorkflowExecution | null> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['workflow'],
    });

    if (!execution) {
      return null;
    }

    // Optimize the execution data to reduce response size
    return this.optimizeExecutionData(execution);
  }

  /**
   * Get node execution snapshot for preview
   */
  async getNodeSnapshot(
    executionId: string,
    nodeId: string,
  ): Promise<any | null> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution) return null;

    return (
      execution.nodeSnapshots.find((snapshot) => snapshot.nodeId === nodeId) ||
      null
    );
  }

  /**
   * Get all node snapshots for an execution
   */
  async getExecutionSnapshots(executionId: string): Promise<any[]> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    return execution?.nodeSnapshots || [];
  }

  /**
   * Cancel workflow execution
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
   * Get input data for workflow execution
   */
  private async getInputData(
    request: WorkflowExecutionRequest,
  ): Promise<any[]> {
    if (request.inputData && request.inputData.length > 0) {
      return request.inputData;
    }

    if (request.documentId) {
      // Get segments from document
      const segments = await this.segmentRepository.find({
        where: { documentId: request.documentId },
        order: { position: 'ASC' },
      });
      return segments;
    }

    if (request.datasetId) {
      // Get segments from dataset
      const segments = await this.segmentRepository.find({
        where: { datasetId: request.datasetId },
        order: { position: 'ASC' },
      });
      return segments;
    }

    return [];
  }

  /**
   * Send execution notifications
   */
  private async sendExecutionNotifications(
    execution: WorkflowExecution,
    userId: string,
  ): Promise<void> {
    try {
      if (execution.status === 'completed') {
        const duration = execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : 0;

        await this.notificationService.sendWorkflowExecutionCompleted(
          execution.id,
          execution.workflowId,
          {
            status: 'completed',
            message: `Workflow execution completed successfully`,
            metrics: execution.metrics,
            duration,
            completedAt: execution.completedAt,
          },
        );
      } else if (execution.status === 'failed') {
        await this.notificationService.sendWorkflowExecutionFailed(
          execution.id,
          execution.workflowId,
          execution.error || 'Unknown error',
        );
      } else if (execution.status === 'running') {
        // Calculate progress from metrics
        const progress = execution.metrics
          ? {
              completedNodes: execution.metrics.completedNodes,
              totalNodes: execution.metrics.totalNodes,
              percentage:
                execution.metrics.totalNodes > 0
                  ? Math.round(
                      (execution.metrics.completedNodes /
                        execution.metrics.totalNodes) *
                        100,
                    )
                  : 0,
            }
          : null;

        // Get current node from the latest snapshot
        const currentNode =
          execution.nodeSnapshots && execution.nodeSnapshots.length > 0
            ? execution.nodeSnapshots[execution.nodeSnapshots.length - 1]
                ?.nodeName
            : null;

        await this.notificationService.sendWorkflowExecutionUpdate(
          execution.id,
          execution.workflowId,
          {
            status: 'running',
            message: `Workflow execution is running`,
            progress,
            currentNode,
          },
        );
      }
    } catch (error) {
      this.logger.warn('Failed to send execution notifications:', error);
    }
  }
}
