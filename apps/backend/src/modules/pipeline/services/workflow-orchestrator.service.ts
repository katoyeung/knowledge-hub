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
import { WORKFLOW_CONSTANTS } from '../constants/workflow.constants';

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
          triggerSource:
            request.triggerSource || WORKFLOW_CONSTANTS.DEFAULT_TRIGGER_SOURCE,
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
      triggerSource:
        request.triggerSource || WORKFLOW_CONSTANTS.DEFAULT_TRIGGER_SOURCE,
      triggerData: request.triggerData,
      executionContext: {
        userId: request.userId,
        environment:
          process.env.NODE_ENV || WORKFLOW_CONSTANTS.DEFAULT_ENVIRONMENT,
        version: WORKFLOW_CONSTANTS.VERSION,
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
      `Size reduction: ${originalSize} -> ${optimizedSize} bytes (${Math.round((1 - optimizedSize / originalSize) * WORKFLOW_CONSTANTS.PROGRESS_COMPLETE)}% reduction)`,
    );

    return optimizedExecution;
  }

  /**
   * Get output data count from various output data formats
   * Recursively searches for count fields or arrays
   */
  private getOutputDataCount(outputData: any): number {
    if (!outputData) return 0;

    // Handle array directly
    if (Array.isArray(outputData)) {
      return outputData.length;
    }

    // Handle object - look for count fields or arrays
    if (typeof outputData === 'object' && outputData !== null) {
      // First, check for common count field names (total, count, etc.)
      for (const key in outputData) {
        if (
          outputData.hasOwnProperty(key) &&
          (key === 'total' ||
            key === 'count' ||
            key.endsWith('_count') ||
            key.endsWith('Count'))
        ) {
          const value = outputData[key];
          if (typeof value === 'number' && value >= 0) {
            return value;
          }
        }
      }

      // If no count field found, find first array and return its length
      for (const key in outputData) {
        if (outputData.hasOwnProperty(key)) {
          const value = outputData[key];
          if (Array.isArray(value)) {
            return value.length;
          }
        }
      }
    }

    return 0;
  }

  /**
   * Get input data count from various input data formats
   * Recursively searches for count fields or arrays
   */
  private getInputDataCount(inputData: any): number {
    if (!inputData) return 0;

    // Handle array directly
    if (Array.isArray(inputData)) {
      return inputData.length;
    }

    // Handle object - look for count fields or arrays
    if (typeof inputData === 'object' && inputData !== null) {
      // First, check for common count field names
      for (const key in inputData) {
        if (
          inputData.hasOwnProperty(key) &&
          (key === 'count' ||
            key === 'total' ||
            key.endsWith('_count') ||
            key.endsWith('Count'))
        ) {
          const value = inputData[key];
          if (typeof value === 'number' && value >= 0) {
            return value;
          }
        }
      }

      // If no count field found, find first array and return its length
      for (const key in inputData) {
        if (inputData.hasOwnProperty(key)) {
          const value = inputData[key];
          if (Array.isArray(value)) {
            return value.length;
          }
        }
      }
    }

    return 0;
  }

  /**
   * Extract sample data from output (max items)
   * Recursively handles nested structures and limits their size
   * Ensures no large datasets are included in the sample
   */
  private getSampleData(outputData: any, maxItems: number = 3): any {
    if (!outputData) return null;

    // Use the recursive limitDataArray method which handles all structures dynamically
    const limited = this.limitDataArray(outputData, maxItems);

    // Final safety check: ensure the limited object isn't too large
    const limitedStr = JSON.stringify(limited);
    if (limitedStr.length > WORKFLOW_CONSTANTS.MAX_STRING_LENGTH) {
      // If still too large, return minimal structure with just counts
      this.logger.warn(
        `Sample data still too large (${limitedStr.length} bytes), returning minimal structure`,
      );
      // Extract only numeric fields and first array sample
      const minimal: any = {};
      if (typeof limited === 'object' && limited !== null) {
        for (const key in limited) {
          if (limited.hasOwnProperty(key)) {
            const value = limited[key];
            if (typeof value === 'number') {
              minimal[key] = value;
            } else if (Array.isArray(value) && value.length > 0) {
              minimal[key] = value.slice(0, 1);
            }
          }
        }
      }
      return minimal;
    }

    return limited;
  }

  /**
   * Deep limit array items, also limiting nested arrays/objects
   */
  private deepLimitArray(arr: any[], maxItems: number): any[] {
    if (!Array.isArray(arr)) return [];

    const limited = arr.slice(0, maxItems).map((item) => {
      if (Array.isArray(item)) {
        // Limit nested arrays
        return item.slice(
          0,
          Math.min(WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS, maxItems),
        );
      } else if (typeof item === 'object' && item !== null) {
        // Limit nested objects by keeping only a few key properties
        const keys = Object.keys(item);
        const limitedItem: any = {};
        keys.slice(0, WORKFLOW_CONSTANTS.MAX_KEYS_TO_PROCESS).forEach((key) => {
          const value = item[key];
          if (Array.isArray(value)) {
            limitedItem[key] = value.slice(
              0,
              WORKFLOW_CONSTANTS.MAX_VALUE_LENGTH,
            );
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
   * Limits input/output arrays to max 10 items while preserving total count
   */
  async getNodeSnapshot(
    executionId: string,
    nodeId: string,
  ): Promise<NodeExecutionSnapshot | null> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      relations: ['workflow'],
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
    let outputData = snapshot.outputData;
    try {
      const cachedOutput = await this.nodeOutputCache.getNodeOutput(
        executionId,
        nodeId,
      );

      if (cachedOutput) {
        outputData = cachedOutput;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch from cache for node ${nodeId}: ${error.message}`,
      );
    }

    // Try to reconstruct inputData from previous nodes if it's empty
    let inputData = snapshot.inputData;
    if (
      !inputData ||
      (Array.isArray(inputData) && inputData.length === 0) ||
      (typeof inputData === 'object' &&
        inputData !== null &&
        'items' in inputData &&
        Array.isArray(inputData.items) &&
        inputData.items.length === 0)
    ) {
      this.logger.log(
        `InputData is empty for node ${nodeId}, trying to reconstruct from previous nodes`,
      );

      // Get workflow to find node connections
      const workflow = execution.workflow;
      this.logger.log(
        `Workflow loaded: ${workflow ? 'yes' : 'no'}, edges: ${workflow?.edges?.length || 0}, nodes: ${workflow?.nodes?.length || 0}`,
      );

      if (workflow && workflow.edges && workflow.nodes) {
        // Find edges that connect to this node (target = nodeId)
        const incomingEdges = workflow.edges.filter(
          (edge) => edge.target === nodeId,
        );

        this.logger.log(
          `Found ${incomingEdges.length} incoming edges for node ${nodeId}`,
        );

        if (incomingEdges.length === 0) {
          // Try to find based on node.inputSources if edges aren't configured
          const currentNode = workflow.nodes.find((n) => n.id === nodeId);
          if (currentNode && currentNode.inputSources) {
            this.logger.log(
              `No edges found, checking node.inputSources: ${currentNode.inputSources.length} sources`,
            );
            for (const inputSource of currentNode.inputSources) {
              if (inputSource.type === 'previous_node' && inputSource.nodeId) {
                const previousNodeId = inputSource.nodeId;
                this.logger.log(
                  `Trying to get input data from previous node ${previousNodeId} (from inputSources)`,
                );

                try {
                  const previousOutput =
                    await this.nodeOutputCache.getNodeOutput(
                      executionId,
                      previousNodeId,
                    );

                  if (previousOutput) {
                    // NO WRAPPING - Pass exactly as-is (object stays object, array stays array)
                    inputData = previousOutput;
                    this.logger.log(
                      `Reconstructed inputData from previous node ${previousNodeId}: type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}`,
                    );
                    break;
                  } else {
                    this.logger.warn(
                      `No output found for previous node ${previousNodeId}`,
                    );
                  }
                } catch (error) {
                  this.logger.warn(
                    `Failed to get output from previous node ${previousNodeId}: ${error.message}`,
                  );
                }
              }
            }
          }

          // If still no inputData, try to find any previous node by checking all snapshots
          if (
            (!inputData ||
              (Array.isArray(inputData) && inputData.length === 0)) &&
            execution.nodeSnapshots
          ) {
            this.logger.log(
              `Still no inputData, checking all node snapshots to find previous nodes`,
            );
            // Find all completed nodes that executed before this node
            const currentNodeSnapshot = execution.nodeSnapshots.find(
              (s) => s.nodeId === nodeId,
            );
            if (currentNodeSnapshot) {
              const currentNodeTimestamp =
                currentNodeSnapshot.startedAt || currentNodeSnapshot.timestamp;
              // Find all nodes that completed before this node started
              const previousSnapshots = execution.nodeSnapshots.filter(
                (s) =>
                  s.nodeId !== nodeId &&
                  s.status === 'completed' &&
                  (s.completedAt || s.timestamp) < currentNodeTimestamp,
              );
              // Sort by completion time (most recent first)
              previousSnapshots.sort(
                (a, b) =>
                  (b.completedAt || b.timestamp).getTime() -
                  (a.completedAt || a.timestamp).getTime(),
              );

              this.logger.log(
                `Found ${previousSnapshots.length} potential previous nodes`,
              );

              // Try the most recent previous node
              for (const prevSnapshot of previousSnapshots.slice(0, 1)) {
                try {
                  const previousOutput =
                    await this.nodeOutputCache.getNodeOutput(
                      executionId,
                      prevSnapshot.nodeId,
                    );

                  if (previousOutput) {
                    // NO WRAPPING - Pass exactly as-is (object stays object, array stays array)
                    inputData = previousOutput;
                    this.logger.log(
                      `Reconstructed inputData from previous node ${prevSnapshot.nodeId} (from snapshots): type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}`,
                    );
                    break;
                  }
                } catch (error) {
                  this.logger.warn(
                    `Failed to get output from previous node ${prevSnapshot.nodeId}: ${error.message}`,
                  );
                }
              }
            }
          }
        }

        // Try to get input data from each previous node (from edges)
        for (const edge of incomingEdges) {
          const previousNodeId = edge.source;
          this.logger.log(
            `Trying to get input data from previous node ${previousNodeId} (from edge)`,
          );

          try {
            const previousOutput = await this.nodeOutputCache.getNodeOutput(
              executionId,
              previousNodeId,
            );

            if (previousOutput) {
              // NO WRAPPING - Pass exactly as-is (object stays object, array stays array)
              inputData = previousOutput;
              this.logger.log(
                `Reconstructed inputData from previous node ${previousNodeId}: type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}`,
              );
              break; // Use first available previous node output
            }
          } catch (error) {
            this.logger.warn(
              `Failed to get output from previous node ${previousNodeId}: ${error.message}`,
            );
          }
        }
      }
    }

    // Helper to count items in any structure
    const countItems = (data: any): number => {
      if (Array.isArray(data)) return data.length;
      if (typeof data === 'object' && data !== null) {
        // Find first array property
        for (const key in data) {
          if (data.hasOwnProperty(key) && Array.isArray(data[key])) {
            return data[key].length;
          }
        }
      }
      return 0;
    };

    // Log before limiting for debugging
    const outputItemsCount = countItems(outputData);
    if (outputItemsCount > WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS) {
      this.logger.log(
        `[Limit Data] Before limiting - outputData has ${outputItemsCount} items`,
      );
    }

    // Limit input and output data to max items while preserving total count
    // Use reconstructed inputData if available, otherwise use snapshot.inputData
    // NO LIMITING for inputData - pass as-is (object stays object, array stays array)
    const finalInputData = inputData || snapshot.inputData;
    const limitedOutputData = this.limitDataArray(
      outputData,
      WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
    );

    // Log after limiting for debugging
    const limitedItemsCount = countItems(limitedOutputData);
    const totalCount =
      (limitedOutputData &&
        typeof limitedOutputData === 'object' &&
        'total' in limitedOutputData &&
        limitedOutputData.total) ||
      outputItemsCount;
    if (outputItemsCount > 10) {
      this.logger.log(
        `[Limit Data] After limiting - outputData has ${limitedItemsCount} items, total: ${totalCount || 'N/A'}`,
      );
    }

    const optimizedSnapshot: NodeExecutionSnapshot = {
      ...snapshot,
      inputData: finalInputData, // Use reconstructed inputData if available (no limiting - pass as-is)
      outputData: limitedOutputData,
    };

    // Final verification - ensure outputData is actually limited
    const finalOutputItemsCount = countItems(optimizedSnapshot.outputData);

    if (finalOutputItemsCount > WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS) {
      this.logger.error(
        `[Limit Data] ERROR: Output data still has ${finalOutputItemsCount} items after limiting! Forcing limit...`,
      );
      // Force limit using recursive method
      optimizedSnapshot.outputData = this.limitDataArray(
        optimizedSnapshot.outputData,
        WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
      );
    }

    return optimizedSnapshot;
  }

  /**
   * Recursively limit arrays to max items while preserving total count
   * Similar to workflow.service.ts limitArraySizes but preserves totals
   * Walks through entire data structure and limits ANY array it finds
   */
  private limitDataArray(
    data: any,
    maxItems: number = WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
  ): any {
    if (!data) {
      return data;
    }

    // If it's an array
    if (Array.isArray(data)) {
      const originalLength = data.length;
      if (originalLength <= maxItems) {
        // Array is small enough, but recursively process each item
        return data.map((item) => this.limitDataArray(item, maxItems));
      }
      // Array is too large - limit it and preserve total
      const limited = data
        .slice(0, maxItems)
        .map((item) => this.limitDataArray(item, maxItems));
      this.logger.log(
        `[Limit Data] Limited array from ${originalLength} to ${maxItems} items`,
      );
      return {
        items: limited,
        total: originalLength,
        _limited: true,
      };
    }

    // If it's an object
    if (typeof data === 'object' && data !== null) {
      // Process object properties recursively
      // Preserve all metadata properties (total, duplicate_count, etc.)
      const limited: any = {};
      let foundLargeArray = false;

      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          const value = data[key];
          if (Array.isArray(value) && value.length > maxItems) {
            // Found a large array - limit it but keep in same key
            const originalLength = value.length;
            limited[key] = value
              .slice(0, maxItems)
              .map((item: any) => this.limitDataArray(item, maxItems));
            foundLargeArray = true;
            // If object doesn't have a total/count field, add it for this array
            // Check for common count field names (total, count, {key}_count, etc.)
            const hasCountField =
              'total' in data ||
              'count' in data ||
              `${key}_count` in data ||
              Object.keys(data).some(
                (k) =>
                  (k.endsWith('_count') || k.endsWith('Count')) &&
                  typeof data[k] === 'number',
              );
            if (!hasCountField) {
              // Use 'total' as default count field name
              limited.total = originalLength;
            }
            this.logger.log(
              `[Limit Data] Limited ${key} array from ${originalLength} to ${maxItems} items`,
            );
          } else {
            // Recursively process non-array values or small arrays
            limited[key] = this.limitDataArray(value, maxItems);
          }
        }
      }

      // If we found a large array, mark as limited
      if (foundLargeArray && !('_limited' in limited)) {
        limited._limited = true;
      }

      // Preserve existing metadata fields (any numeric fields that might be counts)
      // These are already copied above, but ensure they're preserved
      for (const key in data) {
        if (
          data.hasOwnProperty(key) &&
          typeof data[key] === 'number' &&
          !(key in limited)
        ) {
          // Preserve numeric fields that might be counts or metadata
          limited[key] = data[key];
        }
      }

      return limited;
    }

    // Primitive values or null/undefined - return as-is
    return data;
  }

  /**
   * Get all node snapshots for an execution
   * Limits input/output arrays to max 10 items while preserving total count
   */
  async getExecutionSnapshots(executionId: string): Promise<any[]> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution?.nodeSnapshots) {
      return [];
    }

    // Limit input and output data for each snapshot
    return execution.nodeSnapshots.map((snapshot) => ({
      ...snapshot,
      inputData: this.limitDataArray(
        snapshot.inputData,
        WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
      ),
      outputData: this.limitDataArray(
        snapshot.outputData,
        WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
      ),
    }));
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
                        WORKFLOW_CONSTANTS.PROGRESS_COMPLETE,
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
