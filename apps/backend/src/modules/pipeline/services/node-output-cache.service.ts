import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { WORKFLOW_CONSTANTS } from '../constants/workflow.constants';

export interface NodeOutputData {
  executionId: string;
  nodeId: string;
  outputData: any; // Can be array, object, or anything - store as-is
  metadata: {
    count: number;
    size: number;
    timestamp: Date;
    nodeType: string;
  };
}

@Injectable()
export class NodeOutputCacheService {
  private readonly logger = new Logger(NodeOutputCacheService.name);

  // In-memory cache for active executions - stores data as-is (array, object, anything)
  private readonly memoryCache = new Map<string, Map<string, any>>();

  // Configuration
  private readonly CACHE_THRESHOLD = WORKFLOW_CONSTANTS.CACHE_THRESHOLD; // Items per node
  private readonly MAX_MEMORY_NODES = WORKFLOW_CONSTANTS.MAX_MEMORY_NODES; // Max nodes in memory per execution

  constructor(
    @InjectRepository(WorkflowExecution)
    private readonly executionRepo: Repository<WorkflowExecution>,
  ) {}

  /**
   * Store node output data
   * Uses memory cache for small datasets, database for large ones
   */
  async storeNodeOutput(
    executionId: string,
    nodeId: string,
    outputData: any, // Accept anything - array, object, etc. Store as-is
    nodeType: string,
  ): Promise<void> {
    const dataSize = JSON.stringify(outputData).length;
    const itemCount = Array.isArray(outputData) ? outputData.length : 1;

    this.logger.log(
      `Storing output for node ${nodeId}: ${itemCount} items, ${Math.round(dataSize / WORKFLOW_CONSTANTS.BYTES_TO_KB)}KB`,
    );

    // Decide storage strategy based on data size
    if (itemCount <= this.CACHE_THRESHOLD) {
      // Store in memory cache
      await this.storeInMemory(executionId, nodeId, outputData);
    } else {
      // Store in database
      await this.storeInDatabase(executionId, nodeId, outputData, nodeType);
    }
  }

  /**
   * Retrieve node output data
   * Checks memory cache first, then database
   */
  async getNodeOutput(executionId: string, nodeId: string): Promise<any> {
    // Try memory cache first
    const memoryData = this.getFromMemory(executionId, nodeId);
    if (memoryData !== null && memoryData !== undefined) {
      const itemCount = Array.isArray(memoryData) ? memoryData.length : 1;
      this.logger.log(
        `Retrieved ${itemCount} item(s) from memory cache for node ${nodeId} (type: ${Array.isArray(memoryData) ? 'array' : typeof memoryData})`,
      );
      return memoryData; // Return exactly as stored - no wrapping
    }

    // Fallback to database
    const dbData = await this.getFromDatabase(executionId, nodeId);
    if (dbData !== null && dbData !== undefined) {
      const itemCount = Array.isArray(dbData) ? dbData.length : 1;
      this.logger.log(
        `Retrieved ${itemCount} item(s) from database for node ${nodeId} (type: ${Array.isArray(dbData) ? 'array' : typeof dbData})`,
      );
      return dbData; // Return exactly as stored - no wrapping
    }

    this.logger.warn(
      `No output data found for node ${nodeId} in execution ${executionId}`,
    );
    return null; // Return null instead of empty array
  }

  /**
   * Store in memory cache
   */
  private async storeInMemory(
    executionId: string,
    nodeId: string,
    outputData: any, // Store as-is - can be array, object, anything
  ): Promise<void> {
    if (!this.memoryCache.has(executionId)) {
      this.memoryCache.set(executionId, new Map());
    }

    const executionCache = this.memoryCache.get(executionId)!;
    executionCache.set(nodeId, outputData);

    // Cleanup if too many nodes in memory
    if (executionCache.size > this.MAX_MEMORY_NODES) {
      const firstNode = executionCache.keys().next().value;
      executionCache.delete(firstNode);
      this.logger.log(`Cleaned up memory cache for node ${firstNode}`);
    }
  }

  /**
   * Store in database
   */
  private async storeInDatabase(
    executionId: string,
    nodeId: string,
    outputData: any, // Store as-is - can be array, object, anything
    nodeType: string,
  ): Promise<void> {
    try {
      // Update the execution's node snapshots with the output data
      const execution = await this.executionRepo.findOne({
        where: { id: executionId },
      });

      if (execution && execution.nodeSnapshots) {
        const snapshot = execution.nodeSnapshots.find(
          (s) => s.nodeId === nodeId,
        );
        if (snapshot) {
          // If snapshot.outputData is already set (from transformOutputData), preserve it
          // This ensures raw structures are not wrapped
          if (snapshot.outputData && typeof snapshot.outputData === 'object') {
            // Check if it's already a raw structure (not wrapped)
            if (
              !(
                'count' in snapshot.outputData &&
                'sample' in snapshot.outputData &&
                'items' in snapshot.outputData
              )
            ) {
              // It's already a raw structure, don't overwrite it
              this.logger.log(
                `Preserving existing outputData structure for node ${nodeId}`,
              );
              await this.executionRepo.save(execution);
              return;
            }
          }

          // Use the existing snapshot.outputData (formatted by step) instead of overwriting
          // The snapshot.outputData is already in the correct format from the step's formatOutput method
          // Don't overwrite it with the raw outputData parameter

          await this.executionRepo.save(execution);
          const itemCount = Array.isArray(outputData)
            ? outputData.length
            : (outputData as any)?.total || (outputData as any)?.count || 0;
          this.logger.log(
            `Stored ${itemCount} items in database for node ${nodeId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to store in database for node ${nodeId}:`,
        error,
      );
      // Fallback to memory storage
      await this.storeInMemory(executionId, nodeId, outputData);
    }
  }

  /**
   * Get from memory cache
   */
  private getFromMemory(executionId: string, nodeId: string): any | null {
    const executionCache = this.memoryCache.get(executionId);
    if (executionCache) {
      return executionCache.get(nodeId) || null;
    }
    return null;
  }

  /**
   * Get from database
   */
  private async getFromDatabase(
    executionId: string,
    nodeId: string,
  ): Promise<any | null> {
    try {
      const execution = await this.executionRepo.findOne({
        where: { id: executionId },
      });

      if (execution && execution.nodeSnapshots) {
        const snapshot = execution.nodeSnapshots.find(
          (s) => s.nodeId === nodeId,
        );
        if (snapshot && snapshot.outputData) {
          // Special handling for post_deleter - never return empty array
          // Infer node type from snapshot structure (outputData shape)
          const isPostDeleter =
            typeof snapshot.outputData === 'object' &&
            snapshot.outputData !== null &&
            ('deleted' in snapshot.outputData ||
              'requested' in snapshot.outputData ||
              'postIds' in snapshot.outputData);

          // If outputData is an array (raw data)
          if (Array.isArray(snapshot.outputData)) {
            // For post_deleter, empty array should be converted to structured object
            if (isPostDeleter && snapshot.outputData.length === 0) {
              this.logger.warn(
                `[Post Deleter Cache] Found empty array in stored output, converting to structured object`,
              );
              return {
                deleted: 0,
                requested: 0,
                failed: 0,
                postIds: [],
              };
            }
            return snapshot.outputData;
          }
          // If outputData has items (structured object), return the structure as-is
          if (
            typeof snapshot.outputData === 'object' &&
            'items' in snapshot.outputData &&
            Array.isArray(snapshot.outputData.items)
          ) {
            return snapshot.outputData;
          }
          // If outputData is a single object (like {total, data, ...}), return it directly
          if (
            typeof snapshot.outputData === 'object' &&
            snapshot.outputData !== null
          ) {
            // Check if it's a raw structure like {total, data, ...}
            if (
              'data' in snapshot.outputData ||
              'total' in snapshot.outputData
            ) {
              return snapshot.outputData;
            }

            // Check if it's post_deleter structure
            if (
              'deleted' in snapshot.outputData ||
              'requested' in snapshot.outputData ||
              'postIds' in snapshot.outputData
            ) {
              return snapshot.outputData;
            }

            // Handle wrapped structure like {"0": {total, data, ...}, "meta": {...}}
            const keys = Object.keys(snapshot.outputData);
            if (
              keys.length > 0 &&
              keys[0] === '0' &&
              typeof (snapshot.outputData as any)[keys[0]] === 'object'
            ) {
              // Return the unwrapped data
              return (snapshot.outputData as any)[keys[0]];
            }
          }
        }
      }
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get from database for node ${nodeId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Clean up memory cache for completed execution
   */
  async cleanupExecution(executionId: string): Promise<void> {
    this.memoryCache.delete(executionId);
    this.logger.log(`Cleaned up memory cache for execution ${executionId}`);
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(executionId: string): Promise<{
    memoryNodes: number;
    totalDataSize: number;
    nodeCounts: Record<string, number>;
  }> {
    const executionCache = this.memoryCache.get(executionId);
    const memoryNodes = executionCache ? executionCache.size : 0;

    let totalDataSize = 0;
    const nodeCounts: Record<string, number> = {};

    if (executionCache) {
      for (const [nodeId, data] of executionCache.entries()) {
        nodeCounts[nodeId] = data.length;
        totalDataSize += JSON.stringify(data).length;
      }
    }

    return {
      memoryNodes,
      totalDataSize: Math.round(totalDataSize / WORKFLOW_CONSTANTS.BYTES_TO_KB), // KB
      nodeCounts,
    };
  }
}
