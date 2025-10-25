import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowExecution } from '../entities/workflow-execution.entity';

export interface NodeOutputData {
  executionId: string;
  nodeId: string;
  outputData: any[];
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

  // In-memory cache for active executions
  private readonly memoryCache = new Map<string, Map<string, any[]>>();

  // Configuration
  private readonly CACHE_THRESHOLD = 1000; // Items per node
  private readonly MAX_MEMORY_NODES = 10; // Max nodes in memory per execution

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
    outputData: any[],
    nodeType: string,
  ): Promise<void> {
    const dataSize = JSON.stringify(outputData).length;
    const itemCount = outputData.length;

    this.logger.log(
      `Storing output for node ${nodeId}: ${itemCount} items, ${Math.round(dataSize / 1024)}KB`,
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
  async getNodeOutput(executionId: string, nodeId: string): Promise<any[]> {
    // Try memory cache first
    const memoryData = this.getFromMemory(executionId, nodeId);
    if (memoryData) {
      this.logger.log(
        `Retrieved ${memoryData.length} items from memory cache for node ${nodeId}`,
      );
      return memoryData;
    }

    // Fallback to database
    const dbData = await this.getFromDatabase(executionId, nodeId);
    if (dbData) {
      this.logger.log(
        `Retrieved ${dbData.length} items from database for node ${nodeId}`,
      );
      return dbData;
    }

    this.logger.warn(
      `No output data found for node ${nodeId} in execution ${executionId}`,
    );
    return [];
  }

  /**
   * Store in memory cache
   */
  private async storeInMemory(
    executionId: string,
    nodeId: string,
    outputData: any[],
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
    outputData: any[],
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
          // Store in the snapshot's outputData
          snapshot.outputData = {
            count: outputData.length,
            sample: outputData.slice(0, 5),
            schema: this.inferSchema(outputData),
            items: outputData, // Full data for processing
            meta: {
              total: outputData.length,
              storedIn: 'database',
              timestamp: new Date().toISOString(),
            },
          };

          await this.executionRepo.save(execution);
          this.logger.log(
            `Stored ${outputData.length} items in database for node ${nodeId}`,
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
  private getFromMemory(executionId: string, nodeId: string): any[] | null {
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
  ): Promise<any[] | null> {
    try {
      const execution = await this.executionRepo.findOne({
        where: { id: executionId },
        relations: ['nodeSnapshots'],
      });

      if (execution && execution.nodeSnapshots) {
        const snapshot = execution.nodeSnapshots.find(
          (s) => s.nodeId === nodeId,
        );
        if (snapshot && snapshot.outputData && snapshot.outputData.items) {
          return snapshot.outputData.items;
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
      totalDataSize: Math.round(totalDataSize / 1024), // KB
      nodeCounts,
    };
  }

  /**
   * Infer schema from data
   */
  private inferSchema(data: any[]): any {
    if (data.length === 0) return {};

    const sample = data[0];
    const schema: any = {};

    for (const key in sample) {
      if (typeof sample[key] === 'string') {
        schema[key] = 'string';
      } else if (typeof sample[key] === 'number') {
        schema[key] = 'number';
      } else if (typeof sample[key] === 'boolean') {
        schema[key] = 'boolean';
      } else if (Array.isArray(sample[key])) {
        schema[key] = 'array';
      } else if (typeof sample[key] === 'object') {
        schema[key] = 'object';
      }
    }

    return schema;
  }
}
