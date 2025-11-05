import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
} from '../entities/workflow.entity';
import {
  WorkflowExecution,
  NodeExecutionSnapshot,
} from '../entities/workflow-execution.entity';
import { StepExecutionContext } from '../steps/base.step';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { NodeOutputCacheService } from './node-output-cache.service';
import { NotificationService } from '../../notification/notification.service';
import { WORKFLOW_CONSTANTS } from '../constants/workflow.constants';

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  logger: Logger;
  metadata?: Record<string, any>;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';
  inputData: any[];
  outputData: any[];
  metrics: Record<string, any>;
  error?: string;
  snapshot: NodeExecutionSnapshot;
}

@Injectable()
export class WorkflowExecutor {
  private readonly logger = new Logger(WorkflowExecutor.name);

  constructor(
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    @Inject(PipelineStepRegistry)
    @Optional()
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly nodeOutputCache: NodeOutputCacheService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Execute a workflow with node-based processing
   */
  async executeWorkflow(
    workflow: Workflow,
    inputData: any[],
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecution> {
    const executionId = context.executionId;
    this.logger.log(`Starting workflow execution: ${executionId}`);

    // Check if execution already exists (created by orchestrator)
    let execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (execution) {
      // Update existing execution to running status
      execution.status = 'running';
      execution.startedAt = new Date();
      execution.metrics = this.createInitialMetrics(workflow.nodes.length);
      execution.executionContext = {
        userId: context.userId,
        environment:
          process.env.NODE_ENV || WORKFLOW_CONSTANTS.DEFAULT_ENVIRONMENT,
        version: WORKFLOW_CONSTANTS.VERSION,
        parameters: context.metadata || {},
      };
      await this.executionRepository.save(execution);
    } else {
      // Create new execution record (for direct calls)
      execution = this.executionRepository.create({
        id: executionId,
        workflowId: workflow.id,
        documentId: context.documentId,
        datasetId: context.datasetId,
        userId: context.userId,
        status: 'running',
        startedAt: new Date(),
        nodeSnapshots: [],
        metrics: this.createInitialMetrics(workflow.nodes.length),
        executionContext: {
          userId: context.userId,
          environment:
            process.env.NODE_ENV || WORKFLOW_CONSTANTS.DEFAULT_ENVIRONMENT,
          version: WORKFLOW_CONSTANTS.VERSION,
          parameters: context.metadata || {},
        },
      });

      await this.executionRepository.save(execution);
    }

    try {
      // Build execution graph
      const executionGraph = this.buildExecutionGraph(
        workflow.nodes,
        workflow.edges,
      );

      // Check if workflow has data source nodes
      const dataSourceNodes = workflow.nodes.filter(
        (node) => node.type === 'datasource',
      );

      if (dataSourceNodes.length > 0) {
        this.logger.log(
          `Found ${dataSourceNodes.length} data source nodes, executing them first`,
        );

        // Execute data source nodes first to generate input data
        const dataSourceResults = await this.executeDataSourceNodes(
          dataSourceNodes,
          context,
        );

        // Merge data from all data source nodes
        const mergedData = this.mergeDataSourceResults(dataSourceResults);

        // Update input data with data source results
        inputData = [...inputData, ...mergedData];

        this.logger.log(
          `Data source nodes provided ${mergedData.length} segments`,
        );
      }

      // Execute nodes based on workflow settings
      const results = await this.executeNodes(
        executionGraph,
        inputData,
        context,
        workflow.settings,
        executionId,
      );

      // Update execution with results
      const finalMetrics = this.calculateFinalMetrics(results);

      await this.executionRepository.update(executionId, {
        status: 'completed',
        completedAt: new Date(),
        nodeSnapshots: results.map((r) => r.snapshot),
        metrics: finalMetrics,
      });

      this.logger.log(`Workflow execution completed: ${executionId}`);
      const result = await this.executionRepository.findOne({
        where: { id: executionId },
      });
      if (!result) {
        throw new Error(`Workflow execution not found: ${executionId}`);
      }

      // Send completion notification
      try {
        const duration = result.completedAt
          ? result.completedAt.getTime() - result.startedAt.getTime()
          : 0;

        this.notificationService.sendWorkflowExecutionCompleted(
          executionId,
          workflow.id,
          {
            status: 'completed',
            message: `Workflow execution completed successfully`,
            metrics: finalMetrics,
            duration,
            completedAt: result.completedAt,
          },
        );
      } catch (notificationError) {
        this.logger.warn(
          'Failed to send completion notification:',
          notificationError,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${executionId}`, error);

      await this.executionRepository.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      });

      // Send failure notification
      try {
        this.notificationService.sendWorkflowExecutionFailed(
          executionId,
          workflow.id,
          error.message,
        );
      } catch (notificationError) {
        this.logger.warn(
          'Failed to send failure notification:',
          notificationError,
        );
      }

      throw error;
    }
  }

  /**
   * Build execution graph from nodes and edges
   */
  private buildExecutionGraph(
    nodes: WorkflowNode[],
    edges: WorkflowConnection[],
  ): Map<
    string,
    { node: WorkflowNode; dependencies: string[]; dependents: string[] }
  > {
    const graph = new Map();

    // Initialize graph with nodes
    nodes.forEach((node) => {
      graph.set(node.id, {
        node,
        dependencies: [], // Simplified nodes don't have dependencies field
        dependents: [],
      });
    });

    // Add edges
    edges.forEach((edge) => {
      const source = graph.get(edge.source);
      const target = graph.get(edge.target);

      if (source && target) {
        source.dependents.push(edge.target);
        target.dependencies.push(edge.source);
      }
    });

    return graph;
  }

  /**
   * Execute nodes based on workflow execution mode
   */
  private async executeNodes(
    executionGraph: Map<string, any>,
    inputData: any[],
    context: WorkflowExecutionContext,
    settings: any,
    executionId: string,
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = [];
    const completedNodes = new Set<string>();
    const nodeData = new Map<string, any[]>();

    // Initialize with input data for root nodes
    const rootNodes = Array.from(executionGraph.values()).filter(
      (node) => node.dependencies.length === 0,
    );

    rootNodes.forEach((node) => {
      nodeData.set(node.node.id, inputData);
    });

    if (settings.executionMode === 'sequential') {
      // Execute nodes sequentially
      const executionOrder = this.getTopologicalOrder(executionGraph);

      for (const nodeId of executionOrder) {
        const nodeInfo = executionGraph.get(nodeId);
        if (!nodeInfo || !nodeInfo.node.enabled) continue;

        const nodeInputData = await this.getNodeInputData(
          nodeInfo,
          nodeData,
          executionGraph,
          executionId,
        );
        this.logger.log(
          `[executeNodes] Node ${nodeInfo.node.name} will receive input: type=${Array.isArray(nodeInputData) ? 'array' : typeof nodeInputData}, length=${Array.isArray(nodeInputData) ? nodeInputData.length : 'N/A'}`,
        );
        const result = await this.executeNode(
          nodeInfo.node,
          nodeInputData,
          context,
        );

        results.push(result);
        completedNodes.add(nodeId);

        // Store output data exactly as-is (no wrapping at all)
        // Previous node output: { data: [...] } → store as { data: [...] }
        // Previous node output: [...] → store as [...]
        this.logger.log(
          `[STORE] Node ${nodeInfo.node.name} (${nodeId}) outputData: type=${Array.isArray(result.outputData) ? 'array' : typeof result.outputData}, value=${JSON.stringify(result.outputData).substring(0, 200)}`,
        );
        await this.nodeOutputCache.storeNodeOutput(
          executionId,
          nodeId,
          result.outputData, // Store exactly as-is, no wrapping
          nodeInfo.node.type,
        );

        // Also store in memory map for immediate access during execution
        // Store the actual outputData (can be object or array) - this is what nodes use
        nodeData.set(nodeId, result.outputData);
        this.logger.log(
          `[STORE] Stored in memory for node ${nodeId}: type=${Array.isArray(result.outputData) ? 'array' : typeof result.outputData}`,
        );
      }
    } else if (settings.executionMode === 'parallel') {
      // Execute all nodes in parallel (where dependencies allow)
      const batches = this.getParallelBatches(executionGraph, completedNodes);

      for (const batch of batches) {
        const batchPromises = batch.map(async (nodeId) => {
          const nodeInfo = executionGraph.get(nodeId);
          if (!nodeInfo || !nodeInfo.node.enabled) return null;

          const nodeInputData = await this.getNodeInputData(
            nodeInfo,
            nodeData,
            executionGraph,
            executionId,
          );
          return this.executeNode(nodeInfo.node, nodeInputData, context);
        });

        const batchResults = await Promise.all(batchPromises.filter(Boolean));

        for (const result of batchResults) {
          if (result) {
            results.push(result);
            completedNodes.add(result.nodeId);

            // Get node type from execution graph
            const nodeInfo = executionGraph.get(result.nodeId);
            const nodeType = nodeInfo?.node?.type || 'unknown';

            // Store output data exactly as-is - no wrapping
            await this.nodeOutputCache.storeNodeOutput(
              executionId,
              result.nodeId,
              result.outputData, // Store exactly as-is
              nodeType,
            );

            // Also store in memory map for immediate access during execution
            // Store the actual outputData (can be object or array)
            nodeData.set(result.nodeId, result.outputData);
          }
        }
      }
    } else {
      // Hybrid mode - execute based on node execution mode
      const executionOrder = this.getTopologicalOrder(executionGraph);

      for (const nodeId of executionOrder) {
        const nodeInfo = executionGraph.get(nodeId);
        if (!nodeInfo || !nodeInfo.node.enabled) continue;

        const nodeInputData = await this.getNodeInputData(
          nodeInfo,
          nodeData,
          executionGraph,
          executionId,
        );

        if (nodeInfo.node.executionMode === 'parallel') {
          // Execute in parallel with other parallel nodes
          const parallelNodes = this.getParallelNodes(
            nodeId,
            executionGraph,
            completedNodes,
          );
          const parallelPromises = parallelNodes.map(async (nId) => {
            const nInfo = executionGraph.get(nId);
            const nInputData = await this.getNodeInputData(
              nInfo,
              nodeData,
              executionGraph,
              executionId,
            );
            return this.executeNode(nInfo.node, nInputData, context);
          });

          const parallelResults = await Promise.all(parallelPromises);
          for (const result of parallelResults) {
            results.push(result);
            completedNodes.add(result.nodeId);

            // Get node type from execution graph
            const nodeInfo = executionGraph.get(result.nodeId);
            const nodeType = nodeInfo?.node?.type || 'unknown';

            // Store output data exactly as-is - no wrapping
            await this.nodeOutputCache.storeNodeOutput(
              executionId,
              result.nodeId,
              result.outputData, // Store exactly as-is
              nodeType,
            );

            // Also store in memory map for immediate access during execution
            // Store the actual outputData (can be object or array)
            nodeData.set(result.nodeId, result.outputData);
          }
        } else {
          // Execute consecutively
          const result = await this.executeNode(
            nodeInfo.node,
            nodeInputData,
            context,
          );
          results.push(result);
          completedNodes.add(nodeId);

          // Store output data using hybrid cache (memory + database)
          // Wrap in array if it's an object (for steps that return structured output)
          // Store output data exactly as-is - no wrapping
          await this.nodeOutputCache.storeNodeOutput(
            executionId,
            nodeId,
            result.outputData, // Store exactly as-is
            nodeInfo.node.type,
          );

          // Also store in memory map for immediate access during execution
          // Store the actual outputData (can be object or array)
          nodeData.set(nodeId, result.outputData);
        }
      }
    }

    return results;
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowNode,
    inputData: any, // Can be array, object, or anything - no wrapping
    context: WorkflowExecutionContext,
  ): Promise<NodeExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing node: ${node.name} (${node.type})`);

    // Send notification that node started running
    try {
      this.notificationService.sendWorkflowExecutionUpdate(
        context.executionId,
        context.workflowId,
        {
          status: 'running',
          message: `Running node: ${node.name}`,
          currentNodeId: node.id,
          currentNodeStatus: 'running',
          progress: null,
        },
      );
    } catch (notificationError) {
      this.logger.warn(
        'Failed to send node start notification:',
        notificationError,
      );
    }

    try {
      // Get step instance
      this.logger.log(
        `Available step types: ${this.stepRegistry.getStepTypes().join(', ')}`,
      );
      this.logger.log(`Looking for step type: ${node.type}`);
      const stepInstance = this.stepRegistry.createStepInstance(node.type);
      if (!stepInstance) {
        this.logger.error(`Step type not found: ${node.type}`);
        this.logger.error(
          `Available step types: ${this.stepRegistry.getStepTypes().join(', ')}`,
        );
        throw new Error(`Step type not found: ${node.type}`);
      }

      // Create step execution context
      const stepContext: StepExecutionContext = {
        executionId: context.executionId,
        pipelineConfigId: context.workflowId,
        documentId: context.documentId,
        datasetId: context.datasetId,
        userId: context.userId,
        logger: this.logger,
        metadata: {
          nodeId: node.id,
          nodeName: node.name,
          ...context.metadata,
        },
      };

      // Generic debug logging for node execution (only when debug level is enabled)
      this.logger.debug(`Executing node: ${node.name} (${node.type})`);
      this.logger.debug(
        `Node ID: ${node.id}, Input data: type=${inputData ? (Array.isArray(inputData) ? 'array' : typeof inputData) : 'null'}, length=${inputData && Array.isArray(inputData) ? inputData.length : 'N/A'}`,
      );
      if (
        inputData &&
        Array.isArray(inputData) &&
        inputData.length > 0 &&
        typeof inputData[0] === 'object'
      ) {
        this.logger.debug(
          `First input item keys: ${Object.keys(inputData[0]).join(', ')}`,
        );
      }

      // Send notification that node started (allow UI to show node immediately)
      try {
        this.notificationService.sendWorkflowExecutionUpdate(
          context.executionId,
          context.workflowId,
          {
            status: 'running',
            message: `Starting node: ${node.name}`,
            currentNodeId: node.id,
            currentNodeStatus: 'running',
            progress: null,
          },
        );
      } catch (notificationError) {
        this.logger.warn(
          'Failed to send node start notification:',
          notificationError,
        );
      }

      // Execute step
      const result = await stepInstance.execute(
        inputData,
        node.config,
        stepContext,
      );

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Generic debug logging for result output
      if (result.success) {
        this.logger.debug(
          `Node ${node.name} completed. Output segments: ${result.outputSegments?.length || 0}`,
        );
        if (result.outputSegments && result.outputSegments.length > 0) {
          this.logger.debug(
            `First output keys: ${Object.keys(result.outputSegments[0]).join(', ')}`,
          );
        }
      }

      // Create snapshot - store inputData exactly as received (no extraction)
      // Store as-is: object stays object, array stays array
      const snapshotInputData: any = inputData;

      this.logger.log(
        `[executeNode] Input data for snapshot: type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}, value=${JSON.stringify(inputData).substring(0, 300)}`,
      );

      // Use step's formatOutput method to format the output
      const formattedOutputData = stepInstance.formatOutput(result, inputData);

      // Debug logging for post_deleter to see what formatOutput returns
      if (node.type === 'post_deleter') {
        this.logger.log(
          `[Post Deleter Debug] formattedOutputData type: ${Array.isArray(formattedOutputData) ? 'array' : typeof formattedOutputData}, value: ${JSON.stringify(formattedOutputData).substring(0, WORKFLOW_CONSTANTS.PREVIEW_LENGTH_MEDIUM)}`,
        );
        this.logger.log(
          `[Post Deleter Debug] result.outputSegments length: ${result.outputSegments?.length || 0}`,
        );
      }

      // Ensure we never store an empty array - always use formatted output
      // For post_deleter, formatOutput should always return an object
      let finalOutputData = formattedOutputData;
      if (
        node.type === 'post_deleter' &&
        Array.isArray(formattedOutputData) &&
        formattedOutputData.length === 0
      ) {
        this.logger.warn(
          `[Post Deleter] formatOutput returned empty array, using default structure`,
        );
        finalOutputData = {
          deleted: 0,
          requested: 0,
          failed: 0,
          postIds: [],
        };
      }

      const snapshot: NodeExecutionSnapshot = {
        nodeId: node.id,
        nodeName: node.name,
        timestamp: endTime,
        startedAt: startTime,
        completedAt: endTime,
        durationMs: duration,
        status: result.success ? 'completed' : 'failed',
        inputData: snapshotInputData,
        outputData: finalOutputData,
        metrics: {
          processingTime: duration,
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: 0, // Would need system monitoring
          dataSize: JSON.stringify(inputData).length,
        },
        error: result.error,
        progress: WORKFLOW_CONSTANTS.PROGRESS_COMPLETE,
      };

      // Persist snapshot incrementally so frontend can open node details immediately
      try {
        const exec = await this.executionRepository.findOne({
          where: { id: context.executionId },
        });
        if (exec) {
          exec.nodeSnapshots = [...(exec.nodeSnapshots || []), snapshot];
          await this.executionRepository.save(exec);
        }
      } catch (persistErr) {
        this.logger.warn(
          'Failed to persist node snapshot incrementally:',
          persistErr,
        );
      }

      // Send notification that node completed
      try {
        this.notificationService.sendWorkflowExecutionUpdate(
          context.executionId,
          context.workflowId,
          {
            status: 'running',
            message: `Completed node: ${node.name}`,
            currentNodeId: node.id,
            currentNodeStatus: result.success ? 'completed' : 'failed',
            progress: null,
          },
        );
      } catch (notificationError) {
        this.logger.warn(
          'Failed to send node completion notification:',
          notificationError,
        );
      }

      // Use the formatted output from snapshot for storage
      // Store the formatted output directly without wrapping
      let outputDataForStorage: any;

      // For post_deleter, always use formattedOutputData (should be an object, never array)
      if (node.type === 'post_deleter') {
        if (
          Array.isArray(formattedOutputData) &&
          formattedOutputData.length === 0
        ) {
          // Fallback if somehow formatOutput returned empty array
          this.logger.warn(
            `[Post Deleter] formatOutput returned empty array, using default structure`,
          );
          outputDataForStorage = {
            deleted: 0,
            requested: 0,
            failed: 0,
            postIds: [],
          };
        } else {
          // Use formatted output directly (should be object)
          outputDataForStorage = formattedOutputData;
        }
      } else if (Array.isArray(formattedOutputData)) {
        // Already an array - use as-is (for other step types)
        outputDataForStorage = formattedOutputData;
      } else if (
        formattedOutputData &&
        typeof formattedOutputData === 'object'
      ) {
        // Object structure (e.g., { items: [...], total: X, duplicates: [...] })
        // Store directly without wrapping
        outputDataForStorage = formattedOutputData;
      } else {
        // Fallback to raw segments (but never for post_deleter)
        outputDataForStorage = result.outputSegments || [];
      }

      return {
        nodeId: node.id,
        status: result.success ? 'completed' : 'failed',
        inputData,
        outputData: outputDataForStorage,
        metrics: result.metrics || {},
        error: result.error,
        snapshot,
      };
    } catch (error) {
      this.logger.error(`Node execution failed: ${node.name}`, error);

      // Store inputData exactly as-is (no extraction)
      const errorSnapshotInputData: any = inputData;

      const snapshot: NodeExecutionSnapshot = {
        nodeId: node.id,
        nodeName: node.name,
        timestamp: new Date(),
        startedAt: startTime,
        completedAt: new Date(),
        durationMs: new Date().getTime() - startTime.getTime(),
        status: 'failed',
        inputData: errorSnapshotInputData,
        outputData: [],
        metrics: {
          processingTime: new Date().getTime() - startTime.getTime(),
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: 0,
          dataSize: 0,
        },
        error: error.message,
        progress: 0,
      };

      // Persist failed snapshot incrementally
      try {
        const exec = await this.executionRepository.findOne({
          where: { id: context.executionId },
        });
        if (exec) {
          exec.nodeSnapshots = [...(exec.nodeSnapshots || []), snapshot];
          await this.executionRepository.save(exec);
        }
      } catch (persistErr) {
        this.logger.warn(
          'Failed to persist failed node snapshot incrementally:',
          persistErr,
        );
      }

      // Send notification that node failed
      try {
        this.notificationService.sendWorkflowExecutionUpdate(
          context.executionId,
          context.workflowId,
          {
            status: 'running',
            message: `Failed node: ${node.name}`,
            currentNodeId: node.id,
            currentNodeStatus: 'failed',
            progress: null,
          },
        );
      } catch (notificationError) {
        this.logger.warn(
          'Failed to send node failure notification:',
          notificationError,
        );
      }

      return {
        nodeId: node.id,
        status: 'failed',
        inputData,
        outputData: [],
        metrics: {},
        error: error.message,
        snapshot,
      };
    }
  }

  /**
   * Get input data for a node based on its input sources
   */
  private async getNodeInputData(
    nodeInfo: any,
    nodeData: Map<string, any>, // Changed to any to reflect direct storage
    executionGraph: Map<string, any>,
    executionId: string,
  ): Promise<any> {
    // Returns any type - array, object, or primitive - no wrapping
    const node = nodeInfo.node;
    let inputData: any = null; // Can be array, object, or anything - no default wrapping

    this.logger.log(
      `[getNodeInputData] Getting input data for node: ${node.name} (${node.id})`,
    );
    this.logger.log(
      `[getNodeInputData] Node inputSources:`,
      JSON.stringify(
        node.inputSources || [],
        null,
        WORKFLOW_CONSTANTS.JSON_INDENTATION,
      ),
    );
    this.logger.log(
      `[getNodeInputData] NodeInfo.dependencies:`,
      JSON.stringify(nodeInfo.dependencies || [], null, 2),
    );
    this.logger.log(
      `[getNodeInputData] Available nodeData keys:`,
      Array.from(nodeData.keys()),
    );

    // If node doesn't have inputSources configured, derive from execution graph dependencies
    let inputSources = node.inputSources || [];
    if (!inputSources || inputSources.length === 0) {
      const dependencies = nodeInfo.dependencies || [];
      this.logger.log(
        `[${node.name}] Node has no inputSources configured. Checking dependencies: ${dependencies.length} dependencies found`,
      );
      if (dependencies.length > 0) {
        this.logger.log(
          `[${node.name}] Dependencies: ${dependencies.join(', ')}`,
        );
        // Create inputSources from dependencies
        inputSources = dependencies.map((depNodeId: string) => ({
          type: 'previous_node' as const,
          nodeId: depNodeId,
        }));
        this.logger.log(
          `[${node.name}] Created ${inputSources.length} inputSources from dependencies`,
        );
      } else {
        this.logger.warn(
          `[${node.name}] No inputSources configured AND no dependencies found in execution graph. Node will receive empty input.`,
        );
      }
    } else {
      this.logger.log(
        `[${node.name}] Node has ${inputSources.length} inputSources configured`,
      );
    }

    // Process input sources
    if (inputSources && Array.isArray(inputSources)) {
      for (const inputSource of inputSources) {
        this.logger.log(
          `Processing input source:`,
          JSON.stringify(
            inputSource,
            null,
            WORKFLOW_CONSTANTS.JSON_INDENTATION,
          ),
        );
        switch (inputSource.type) {
          case 'previous_node':
            if (inputSource.nodeId) {
              this.logger.log(
                `[${node.name}] Looking for previous node output: ${inputSource.nodeId}`,
              );
              // Try memory cache first (stores outputData directly, not wrapped)
              let data = nodeData.get(inputSource.nodeId);
              this.logger.log(
                `[${node.name}] Memory cache check for ${inputSource.nodeId}: ${data ? 'found' : 'not found'}`,
              );
              if (data) {
                this.logger.log(
                  `[${node.name}] Memory cache data: type=${Array.isArray(data) ? 'array' : typeof data}, length=${Array.isArray(data) ? data.length : 'N/A'}, keys=${typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data).join(', ') : 'N/A'}, value=${JSON.stringify(data).substring(0, 200)}`,
                );
              }

              // If not in memory, try cache service (which includes database)
              if (!data) {
                this.logger.log(
                  `[${node.name}] Checking database cache for ${inputSource.nodeId}`,
                );
                data = await this.nodeOutputCache.getNodeOutput(
                  executionId,
                  inputSource.nodeId,
                );
                if (data) {
                  this.logger.log(
                    `[${node.name}] Database cache returned: type=${Array.isArray(data) ? 'array' : typeof data}, keys=${typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data).join(', ') : 'N/A'}, value=${JSON.stringify(data).substring(0, 200)}`,
                  );
                }
                this.logger.log(
                  `[${node.name}] Database cache check for ${inputSource.nodeId}: ${data ? 'found' : 'not found'}`,
                );
              }

              // NO EXTRACTION, NO WRAPPING - Just pass data exactly as-is
              // Previous output is object? Pass object. Array? Pass array. Store as-is, pass as-is.
              if (data) {
                this.logger.log(
                  `[${node.name}] Data from cache: type=${Array.isArray(data) ? 'array' : typeof data}, length=${Array.isArray(data) ? data.length : 'N/A'}`,
                );
                // Pass data exactly as-is - no wrapping at all
                // If this is the first input source, use data directly
                if (inputData === null || inputData === undefined) {
                  inputData = data;
                  this.logger.log(
                    `[${node.name}] First input source - using data directly: type=${Array.isArray(inputData) ? 'array' : typeof inputData}`,
                  );
                } else {
                  // Multiple input sources - need to combine them
                  // Strategy: Extract arrays from objects and concatenate, or merge objects
                  this.logger.log(
                    `[${node.name}] Multiple input sources - combining: existing type=${Array.isArray(inputData) ? 'array' : typeof inputData}, new type=${Array.isArray(data) ? 'array' : typeof data}`,
                  );

                  // Helper to extract array from object or return array as-is
                  const extractArray = (value: any): any[] => {
                    if (Array.isArray(value)) {
                      return value;
                    }
                    if (typeof value === 'object' && value !== null) {
                      // Look for common array properties
                      for (const key of [
                        'data',
                        'items',
                        'results',
                        'segments',
                      ]) {
                        if (Array.isArray(value[key])) {
                          return value[key];
                        }
                      }
                      // If no array found, return empty (object structure doesn't match)
                      return [];
                    }
                    return [];
                  };

                  const inputArray = extractArray(inputData);
                  const dataArray = extractArray(data);

                  if (inputArray.length > 0 || dataArray.length > 0) {
                    // Both have extractable arrays - concatenate them
                    inputData = inputArray.concat(dataArray);
                    this.logger.log(
                      `[${node.name}] Combined ${inputArray.length} + ${dataArray.length} = ${inputData.length} items from arrays`,
                    );
                  } else {
                    // Neither is an array or has extractable arrays - merge objects
                    if (
                      typeof inputData === 'object' &&
                      inputData !== null &&
                      typeof data === 'object' &&
                      data !== null
                    ) {
                      inputData = { ...inputData, ...data };
                      this.logger.log(
                        `[${node.name}] Merged objects (keys: ${Object.keys(inputData).join(', ')})`,
                      );
                    } else {
                      // Fallback: wrap in array (shouldn't happen often)
                      inputData = [inputData, data];
                      this.logger.warn(
                        `[${node.name}] Could not extract arrays or merge objects, wrapped in array`,
                      );
                    }
                  }
                }
                this.logger.log(
                  `[${node.name}] Passing to step: type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}, value=${JSON.stringify(inputData).substring(0, 200)}`,
                );
              } else {
                this.logger.warn(
                  `[${node.name}] No data found from previous node ${inputSource.nodeId}`,
                );
              }
            }
            break;
          case 'dataset':
            // Would fetch from dataset
            break;
          case 'document':
            // Would fetch from document
            break;
          case 'segment':
            // Would fetch segments
            break;
          case 'file':
            // Would read from file
            break;
          case 'api':
            // Would call API
            break;
        }
      }
    }

    // Apply data mapping if specified
    if (
      node.inputSources &&
      Array.isArray(node.inputSources) &&
      node.inputSources.some((s: any) => s.mapping)
    ) {
      inputData = this.applyDataMapping(inputData, node.inputSources);
    }

    // If inputData is still null, return empty array (steps expect input, even if empty)
    if (inputData === null || inputData === undefined) {
      this.logger.warn(
        `[getNodeInputData] WARNING: Node ${node.name} (${node.id}) received null/undefined input! Returning empty array. Check if previous node output exists and dependencies are correct.`,
      );
      return [];
    }

    this.logger.log(
      `[getNodeInputData] Final input data for node ${node.name}: type=${Array.isArray(inputData) ? 'array' : typeof inputData}, length=${Array.isArray(inputData) ? inputData.length : 'N/A'}`,
    );
    if (Array.isArray(inputData) && inputData.length === 0) {
      this.logger.warn(
        `[getNodeInputData] WARNING: Node ${node.name} (${node.id}) received empty array! Check if previous node output exists and dependencies are correct.`,
      );
    }
    return inputData;
  }

  /**
   * Get topological order of nodes
   */
  private getTopologicalOrder(executionGraph: Map<string, any>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: string[] = [];

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) {
        throw new Error(`Circular dependency detected: ${nodeId}`);
      }
      if (visited.has(nodeId)) return;

      temp.add(nodeId);
      const nodeInfo = executionGraph.get(nodeId);
      if (nodeInfo) {
        nodeInfo.dependencies.forEach((depId: string) => visit(depId));
      }
      temp.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    Array.from(executionGraph.keys()).forEach((nodeId) => visit(nodeId));
    return result;
  }

  /**
   * Get parallel execution batches
   */
  private getParallelBatches(
    executionGraph: Map<string, any>,
    completedNodes: Set<string>,
  ): string[][] {
    const batches: string[][] = [];
    const remaining = new Set(
      Array.from(executionGraph.keys()).filter((id) => !completedNodes.has(id)),
    );

    while (remaining.size > 0) {
      const batch: string[] = [];

      for (const nodeId of remaining) {
        const nodeInfo = executionGraph.get(nodeId);
        if (
          nodeInfo &&
          nodeInfo.dependencies.every((dep: string) => completedNodes.has(dep))
        ) {
          batch.push(nodeId);
        }
      }

      if (batch.length === 0) {
        throw new Error('Circular dependency or missing dependencies detected');
      }

      batch.forEach((id) => {
        remaining.delete(id);
        completedNodes.add(id);
      });

      batches.push(batch);
    }

    return batches;
  }

  /**
   * Get parallel nodes for hybrid execution
   */
  private getParallelNodes(
    nodeId: string,
    executionGraph: Map<string, any>,
    completedNodes: Set<string>,
  ): string[] {
    const nodeInfo = executionGraph.get(nodeId);
    if (!nodeInfo || nodeInfo.node.executionMode !== 'parallel') {
      return [nodeId];
    }

    // Find all parallel nodes that can be executed together
    const parallelNodes: string[] = [];
    const visited = new Set<string>();

    const findParallel = (currentNodeId: string) => {
      if (visited.has(currentNodeId) || completedNodes.has(currentNodeId))
        return;

      visited.add(currentNodeId);
      const currentInfo = executionGraph.get(currentNodeId);

      if (
        currentInfo &&
        currentInfo.node.executionMode === 'parallel' &&
        currentInfo.dependencies.every((dep: string) => completedNodes.has(dep))
      ) {
        parallelNodes.push(currentNodeId);

        // Check dependents
        currentInfo.dependents.forEach((depId: string) => findParallel(depId));
      }
    };

    findParallel(nodeId);
    return parallelNodes;
  }

  /**
   * Apply filters to data
   */
  private applyFilters(data: any[], filters: Record<string, any>): any[] {
    return data.filter((item) => {
      return Object.entries(filters).every(([key, value]) => {
        return item[key] === value;
      });
    });
  }

  /**
   * Apply data mapping
   */
  private applyDataMapping(data: any[], inputSources: any[]): any[] {
    return data.map((item) => {
      const mappedItem: any = {};

      inputSources.forEach((source) => {
        if (source.mapping) {
          Object.entries(source.mapping).forEach(([targetKey, sourceKey]) => {
            mappedItem[targetKey] = item[sourceKey as string];
          });
        }
      });

      return mappedItem;
    });
  }

  /**
   * Infer data schema
   */
  private inferSchema(data: any[]): Record<string, any> {
    if (data.length === 0) return {};

    const sample = data[0];
    const schema: Record<string, any> = {};

    Object.keys(sample).forEach((key) => {
      schema[key] = typeof sample[key];
    });

    return schema;
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(totalNodes: number): any {
    return {
      totalNodes,
      completedNodes: 0,
      failedNodes: 0,
      skippedNodes: 0,
      totalDuration: 0,
      averageNodeDuration: 0,
      totalDataProcessed: 0,
      peakMemoryUsage: 0,
      averageCpuUsage: 0,
      dataThroughput: 0,
    };
  }

  /**
   * Calculate final metrics
   */
  private calculateFinalMetrics(results: NodeExecutionResult[]): any {
    const completedNodes = results.filter(
      (r) => r.status === 'completed',
    ).length;
    const failedNodes = results.filter((r) => r.status === 'failed').length;
    const skippedNodes = results.filter((r) => r.status === 'skipped').length;

    const totalDuration = results.reduce(
      (sum, r) => sum + (r.snapshot.metrics.processingTime || 0),
      0,
    );
    const averageNodeDuration =
      results.length > 0 ? totalDuration / results.length : 0;

    const totalDataProcessed = results.reduce(
      (sum, r) =>
        sum +
        (Array.isArray(r.inputData) ? r.inputData.length : r.inputData ? 1 : 0),
      0,
    );
    const peakMemoryUsage = Math.max(
      ...results.map((r) => r.snapshot.metrics.memoryUsage || 0),
    );
    const dataThroughput =
      totalDuration > 0
        ? totalDataProcessed /
          (totalDuration / WORKFLOW_CONSTANTS.MS_TO_SECONDS)
        : 0;

    return {
      totalNodes: results.length,
      completedNodes,
      failedNodes,
      skippedNodes,
      totalDuration,
      averageNodeDuration,
      totalDataProcessed,
      peakMemoryUsage,
      averageCpuUsage: 0, // Would need system monitoring
      dataThroughput,
    };
  }

  /**
   * Execute data source nodes to generate input data
   */
  private async executeDataSourceNodes(
    dataSourceNodes: WorkflowNode[],
    context: WorkflowExecutionContext,
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = [];

    for (const node of dataSourceNodes) {
      try {
        this.logger.log(`Executing data source node: ${node.name}`);

        // Data source nodes don't have input data, they generate it
        const result = await this.executeNode(node, [], context);
        results.push(result);

        this.logger.log(
          `Data source node ${node.name} generated ${result.outputData.length} segments`,
        );
      } catch (error) {
        this.logger.error(`Data source node ${node.name} failed:`, error);

        // Create a failed result
        const failedResult: NodeExecutionResult = {
          nodeId: node.id,
          status: 'failed',
          inputData: [],
          outputData: [],
          metrics: {},
          error: error.message,
          snapshot: {
            nodeId: node.id,
            nodeName: node.name,
            timestamp: new Date(),
            status: 'failed',
            inputData: [],
            outputData: [],
            metrics: {
              processingTime: 0,
              memoryUsage: 0,
              cpuUsage: 0,
              dataSize: 0,
            },
            error: error.message,
            progress: 0,
          },
        };
        results.push(failedResult);
      }
    }

    return results;
  }

  /**
   * Merge results from multiple data source nodes
   */
  private mergeDataSourceResults(results: NodeExecutionResult[]): any[] {
    const mergedData: any[] = [];

    for (const result of results) {
      if (result.status === 'completed' && result.outputData) {
        mergedData.push(...result.outputData);
      }
    }

    return mergedData;
  }
}
