import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import {
  WorkflowExecution,
  NodeExecutionSnapshot,
} from '../entities/workflow-execution.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  WorkflowExecutor,
  WorkflowExecutionContext,
} from './workflow-executor.service';
import { JobDispatcherService } from '../../queue/services/job-dispatcher.service';
import { EventBusService } from '../../event/services/event-bus.service';
import { EventTypes } from '../../event/constants/event-types';
import { NotificationService } from '../../notification/notification.service';
import { NodeOutputCacheService } from './node-output-cache.service';
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
    private readonly nodeOutputCache: NodeOutputCacheService,
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

      // Get input data (if provided)
      const inputData = await this.getInputData(request);

      // Note: Input validation is handled by each step during execution

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

    // Create minimal execution record immediately (no validation, no blocking)
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
        totalNodes: 0, // Will be updated by job
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

    // Save execution first, then dispatch job only if successful
    try {
      await this.executionRepository.save(execution);
      this.logger.log(`Execution record created successfully: ${executionId}`);

      // Dispatch workflow job only after successful execution record creation
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

      this.logger.log(`Workflow job dispatched successfully: ${executionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to create execution record or dispatch job: ${executionId}`,
        error,
      );
      // Update execution status to failed if save or dispatch fails
      try {
        await this.executionRepository.update(executionId, {
          status: 'failed',
          error: `Failed to queue job: ${error.message}`,
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to update execution status after error:`,
          updateError,
        );
      }
      throw error; // Re-throw to return error to client
    }

    // Return success response
    return {
      executionId,
      status: 'pending',
      message: 'Workflow execution queued successfully',
      workflowName: 'Loading...', // Will be updated by job
    };
  }

  /**
   * Optimize execution data by returning only basic node info for sequence listing
   * Large output data is excluded and fetched separately when needed
   */
  private optimizeExecutionData(
    execution: WorkflowExecution,
  ): WorkflowExecution {
    this.logger.log(`Optimizing execution data for execution: ${execution.id}`);
    if (!execution.nodeSnapshots) {
      return execution;
    }

    // Create lightweight node summaries for execution sequence (no previews)
    const lightweightSnapshots = execution.nodeSnapshots.map((snapshot) => {
      const lightweightSnapshot: NodeExecutionSnapshot = {
        nodeId: snapshot.nodeId,
        nodeName: snapshot.nodeName,
        timestamp: snapshot.timestamp,
        status: snapshot.status,
        metrics: snapshot.metrics,
        error: snapshot.error,
        progress: snapshot.progress,
        // Do not hardcode or inject meta into input/output shapes in summaries
        inputData: undefined as unknown as any,
        outputData: undefined as unknown as any,
      };

      return lightweightSnapshot;
    });

    const optimizedExecution = {
      ...execution,
      nodeSnapshots: lightweightSnapshots,
    };

    const originalSize = JSON.stringify(execution).length;
    const optimizedSize = JSON.stringify(optimizedExecution).length;
    this.logger.log(
      `Size reduction: ${originalSize} -> ${optimizedSize} bytes (${Math.round((1 - optimizedSize / originalSize) * 100)}% reduction)`,
    );

    return optimizedExecution;
  }

  /**
   * Get output data count from various output data formats
   */
  private getOutputDataCount(outputData: any): number {
    if (!outputData) return 0;

    // Handle structured format like { items: [], total: X, ... }
    if (typeof outputData === 'object') {
      if ('total' in outputData && typeof outputData.total === 'number') {
        return outputData.total;
      }
      if ('count' in outputData && typeof outputData.count === 'number') {
        return outputData.count;
      }
      if (Array.isArray(outputData.items)) {
        return outputData.items.length;
      }
      if (Array.isArray(outputData.data)) {
        return outputData.data.length;
      }
      if (Array.isArray(outputData)) {
        return outputData.length;
      }
    }

    // Handle array directly
    if (Array.isArray(outputData)) {
      return outputData.length;
    }

    return 0;
  }

  /**
   * Get input data count from various input data formats
   */
  private getInputDataCount(inputData: any): number {
    if (!inputData) return 0;

    if (typeof inputData === 'object') {
      if ('count' in inputData && typeof inputData.count === 'number') {
        return inputData.count;
      }
      if (Array.isArray(inputData)) {
        return inputData.length;
      }
      if (Array.isArray(inputData.sample)) {
        return inputData.sample.length;
      }
    }

    if (Array.isArray(inputData)) {
      return inputData.length;
    }

    return 0;
  }

  /**
   * Extract sample data from output (max items)
   * Also handles nested structures and limits their size
   * Ensures no large datasets are included in the sample
   */
  private getSampleData(outputData: any, maxItems: number = 3): any {
    if (!outputData) return null;

    // Handle structured format like { items: [], total: X, duplicates: [] }
    if (typeof outputData === 'object' && !Array.isArray(outputData)) {
      const limited: any = {};

      // Limit items array if present
      if (Array.isArray(outputData.items)) {
        limited.items = this.deepLimitArray(outputData.items, maxItems);
      }

      // Limit data array if present
      if (Array.isArray(outputData.data)) {
        limited.data = this.deepLimitArray(outputData.data, maxItems);
      }

      // Limit duplicates array if present
      if (Array.isArray(outputData.duplicates)) {
        limited.duplicates = this.deepLimitArray(
          outputData.duplicates,
          maxItems,
        );
      }

      // Keep metadata fields but don't include full arrays
      if (typeof outputData.total === 'number') {
        limited.total = outputData.total;
      }
      if (typeof outputData.duplicate_count === 'number') {
        limited.duplicate_count = outputData.duplicate_count;
      }
      if (typeof outputData.count === 'number') {
        limited.count = outputData.count;
      }

      // Keep other metadata fields (non-array, non-object) only
      Object.keys(outputData).forEach((key) => {
        if (
          ![
            'items',
            'data',
            'duplicates',
            'total',
            'duplicate_count',
            'count',
          ].includes(key) &&
          !Array.isArray(outputData[key]) &&
          (typeof outputData[key] !== 'object' || outputData[key] === null)
        ) {
          limited[key] = outputData[key];
        }
      });

      // Final safety check: ensure the limited object isn't too large
      const limitedStr = JSON.stringify(limited);
      if (limitedStr.length > 50000) {
        // If still too large, return just counts
        this.logger.warn(
          `Sample data still too large (${limitedStr.length} bytes), returning minimal structure`,
        );
        return {
          total: limited.total,
          count: limited.count,
          duplicate_count: limited.duplicate_count,
          items: limited.items ? limited.items.slice(0, 1) : [],
        };
      }

      return limited;
    }

    // Handle array directly
    if (Array.isArray(outputData)) {
      return this.deepLimitArray(outputData, maxItems);
    }

    // Return null for other types to indicate no sample available
    return null;
  }

  /**
   * Deep limit array items, also limiting nested arrays/objects
   */
  private deepLimitArray(arr: any[], maxItems: number): any[] {
    if (!Array.isArray(arr)) return [];

    const limited = arr.slice(0, maxItems).map((item) => {
      if (Array.isArray(item)) {
        // Limit nested arrays
        return item.slice(0, Math.min(10, maxItems));
      } else if (typeof item === 'object' && item !== null) {
        // Limit nested objects by keeping only a few key properties
        const keys = Object.keys(item);
        const limitedItem: any = {};
        keys.slice(0, 20).forEach((key) => {
          const value = item[key];
          if (Array.isArray(value)) {
            limitedItem[key] = value.slice(0, 5);
          } else if (typeof value !== 'object' || value === null) {
            limitedItem[key] = value;
          } else {
            // Nested object - just include a placeholder
            limitedItem[key] = { _truncated: true };
          }
        });
        return limitedItem;
      }
      return item;
    });

    return limited;
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
   * Get node execution snapshot with full output data
   * Fetches complete details including large datasets from cache if needed
   */
  async getNodeSnapshot(
    executionId: string,
    nodeId: string,
  ): Promise<NodeExecutionSnapshot | null> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution) {
      this.logger.warn(`Execution not found: ${executionId}`);
      return null;
    }

    // Find base snapshot
    const snapshot = execution.nodeSnapshots.find(
      (snapshot) => snapshot.nodeId === nodeId,
    );

    if (!snapshot) {
      this.logger.warn(
        `Node snapshot not found: ${nodeId} in execution ${executionId}`,
      );
      return null;
    }

    // Try to fetch full output data from cache
    try {
      const cachedOutput = await this.nodeOutputCache.getNodeOutput(
        executionId,
        nodeId,
      );

      if (cachedOutput) {
        // Return RAW output only (no extra fields)
        const outputData = cachedOutput; // pass-through

        const fullSnapshot: NodeExecutionSnapshot = {
          ...snapshot,
          outputData,
        };

        return fullSnapshot;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch from cache for node ${nodeId}: ${error.message}`,
      );
    }

    // Fallback to snapshot data (which might have limited data)
    return snapshot;
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
