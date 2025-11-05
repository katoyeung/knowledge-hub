import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto/workflow.dto';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { WORKFLOW_CONSTANTS } from '../constants/workflow.constants';

export interface WorkflowFilters {
  datasetId?: string;
  isTemplate?: boolean;
  isActive?: boolean;
  tags?: string;
  userId?: string;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    private readonly stepRegistry: PipelineStepRegistry,
  ) {}

  /**
   * Create a new workflow
   */
  async createWorkflow(
    createDto: CreateWorkflowDto,
    userId: string,
  ): Promise<Workflow> {
    this.logger.log(`Creating workflow: ${createDto.name}`);

    // Validate workflow configuration
    await this.validateWorkflowConfiguration(createDto);

    const workflow = this.workflowRepository.create({
      name: createDto.name,
      description: createDto.description,
      datasetId: createDto.datasetId,
      nodes: createDto.nodes as any,
      edges: createDto.edges as any,
      settings: createDto.settings as any,
      isActive: createDto.isActive ?? true,
      isTemplate: createDto.isTemplate ?? false,
      tags: createDto.tags,
      userId,
      metadata: {
        version: WORKFLOW_CONSTANTS.VERSION,
        createdBy: userId,
        lastModifiedBy: userId,
        ...createDto.metadata,
      },
    });

    const savedWorkflow = await this.workflowRepository.save(workflow);
    this.logger.log(`Workflow created: ${savedWorkflow.id}`);

    return savedWorkflow;
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: string, userId: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id, userId },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    return workflow;
  }

  /**
   * Get all workflows with filters and pagination
   */
  async getWorkflows(
    userId: string,
    filters: WorkflowFilters = {},
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ workflows: Workflow[]; total: number }> {
    const queryBuilder = this.workflowRepository
      .createQueryBuilder('workflow')
      .where('workflow.userId = :userId', { userId });

    if (filters.datasetId !== undefined) {
      queryBuilder.andWhere('workflow.datasetId = :datasetId', {
        datasetId: filters.datasetId,
      });
    }

    if (filters.isTemplate !== undefined) {
      queryBuilder.andWhere('workflow.isTemplate = :isTemplate', {
        isTemplate: filters.isTemplate,
      });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('workflow.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    if (filters.tags) {
      queryBuilder.andWhere('workflow.tags ILIKE :tags', {
        tags: `%${filters.tags}%`,
      });
    }

    const [workflows, total] = await queryBuilder
      .orderBy('workflow.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { workflows, total };
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    id: string,
    updateDto: UpdateWorkflowDto,
    userId: string,
  ): Promise<Workflow> {
    this.logger.log(`Updating workflow: ${id}`);

    const workflow = await this.getWorkflow(id, userId);

    // Only validate workflow configuration if nodes/edges are being updated
    if (updateDto.nodes !== undefined || updateDto.edges !== undefined) {
      // Create a temporary DTO with existing workflow data + updates for validation
      const validationDto: CreateWorkflowDto = {
        name: updateDto.name ?? workflow.name,
        description: updateDto.description ?? workflow.description,
        datasetId: updateDto.datasetId ?? workflow.datasetId,
        nodes: updateDto.nodes ?? workflow.nodes,
        edges: updateDto.edges ?? workflow.edges,
        settings: updateDto.settings ?? workflow.settings,
        isActive: updateDto.isActive ?? workflow.isActive,
        isTemplate: updateDto.isTemplate ?? workflow.isTemplate,
        tags: updateDto.tags ?? workflow.tags,
        metadata: updateDto.metadata ?? workflow.metadata,
      };
      await this.validateWorkflowConfiguration(validationDto);
    }

    // Update only provided fields
    if (updateDto.name !== undefined) workflow.name = updateDto.name;
    if (updateDto.description !== undefined)
      workflow.description = updateDto.description;
    if (updateDto.datasetId !== undefined)
      workflow.datasetId = updateDto.datasetId;
    if (updateDto.nodes !== undefined) workflow.nodes = updateDto.nodes;
    if (updateDto.edges !== undefined) workflow.edges = updateDto.edges;
    if (updateDto.settings !== undefined)
      workflow.settings = updateDto.settings;
    if (updateDto.isActive !== undefined)
      workflow.isActive = updateDto.isActive;
    if (updateDto.isTemplate !== undefined)
      workflow.isTemplate = updateDto.isTemplate;
    if (updateDto.tags !== undefined) workflow.tags = updateDto.tags;
    if (updateDto.metadata !== undefined) {
      workflow.metadata = {
        ...workflow.metadata,
        ...updateDto.metadata,
      };
    }

    // Always update lastModifiedBy
    workflow.metadata = {
      ...workflow.metadata,
      lastModifiedBy: userId,
    };

    const updatedWorkflow = await this.workflowRepository.save(workflow);
    this.logger.log(`Workflow updated: ${updatedWorkflow.id}`);

    return updatedWorkflow;
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting workflow: ${id}`);

    const workflow = await this.getWorkflow(id, userId);

    // Delete all executions first (cascade delete)
    const executions = await this.executionRepository.find({
      where: { workflowId: id },
    });

    if (executions.length > 0) {
      this.logger.log(
        `Deleting ${executions.length} executions for workflow: ${id}`,
      );
      await this.executionRepository.remove(executions);
    }

    // Delete the workflow
    await this.workflowRepository.remove(workflow);
    this.logger.log(`Workflow deleted: ${id}`);
  }

  /**
   * Optimize execution data by limiting large datasets
   * Uses generic array limiting function to handle any data structure
   */
  private optimizeExecutionData(
    execution: WorkflowExecution,
  ): WorkflowExecution {
    if (!execution.nodeSnapshots) {
      return execution;
    }

    const optimizedSnapshots = execution.nodeSnapshots.map((snapshot) => {
      const optimizedSnapshot = { ...snapshot };

      // Optimize outputData and inputData using generic array limiting
      if (optimizedSnapshot.outputData) {
        optimizedSnapshot.outputData = this.limitArraySizes(
          optimizedSnapshot.outputData,
          WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
        );
      }

      if (optimizedSnapshot.inputData) {
        optimizedSnapshot.inputData = this.limitArraySizes(
          optimizedSnapshot.inputData,
          WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
        );
      }

      return optimizedSnapshot;
    });

    const optimizedExecution = {
      ...execution,
      nodeSnapshots: optimizedSnapshots,
    };

    return optimizedExecution;
  }

  /**
   * Create lightweight execution summary for list view
   */
  private createExecutionSummary(execution: WorkflowExecution) {
    const duration = execution.completedAt
      ? execution.completedAt.getTime() - execution.startedAt.getTime()
      : null;

    return {
      id: execution.id,
      workflowId: execution.workflowId,
      documentId: execution.documentId,
      datasetId: execution.datasetId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      duration,
      error: execution.error,
      cancellationReason: execution.cancellationReason,
      cancelledBy: execution.cancelledBy,
      cancelledAt: execution.cancelledAt,
      triggerSource: execution.triggerSource,
      // Only include essential metrics for list view
      metrics: execution.metrics
        ? {
            totalNodes: execution.metrics.totalNodes,
            completedNodes: execution.metrics.completedNodes,
            failedNodes: execution.metrics.failedNodes,
            totalDuration: execution.metrics.totalDuration,
            totalDataProcessed: execution.metrics.totalDataProcessed,
          }
        : null,
      // Only include node count, not full snapshots
      nodeCount: execution.nodeSnapshots?.length || 0,
    };
  }

  /**
   * Get workflow execution history
   */
  async getWorkflowExecutions(
    workflowId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ executions: any[]; total: number }> {
    const [executions, total] = await this.executionRepository.findAndCount({
      where: { workflowId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Create lightweight summaries for list view
    const executionSummaries = executions.map((execution) =>
      this.createExecutionSummary(execution),
    );

    return { executions: executionSummaries, total };
  }

  /**
   * Get all executions for a user across all workflows
   */
  async getAllExecutions(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ executions: any[]; total: number }> {
    const [executions, total] = await this.executionRepository.findAndCount({
      where: { userId },
      relations: ['workflow'],
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Create lightweight summaries with workflow info
    const executionSummaries = executions.map((execution) => ({
      ...this.createExecutionSummary(execution),
      workflow: execution.workflow
        ? {
            id: execution.workflow.id,
            name: execution.workflow.name,
            nodes: execution.workflow.nodes || [],
          }
        : null,
    }));

    return { executions: executionSummaries, total };
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(
    workflowId: string,
    userId: string,
  ): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    lastExecution?: Date;
  }> {
    const executions = await this.executionRepository.find({
      where: { workflowId },
      order: { startedAt: 'DESC' },
    });

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(
      (e) => e.status === 'completed',
    ).length;
    const failedExecutions = executions.filter(
      (e) => e.status === 'failed',
    ).length;

    const completedExecutions = executions.filter((e) => e.completedAt);
    const averageDuration =
      completedExecutions.length > 0
        ? completedExecutions.reduce((sum, e) => {
            const duration = e.completedAt.getTime() - e.startedAt.getTime();
            return sum + duration;
          }, 0) / completedExecutions.length
        : 0;

    const lastExecution =
      executions.length > 0 ? executions[0].startedAt : undefined;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageDuration,
      lastExecution,
    };
  }

  /**
   * Create workflow from template
   */
  async createWorkflowFromTemplate(
    templateId: string,
    name: string,
    userId: string,
  ): Promise<Workflow> {
    const template = await this.getWorkflow(templateId, userId);

    if (!template.isTemplate) {
      throw new Error(`Workflow ${templateId} is not a template`);
    }

    const workflow = this.workflowRepository.create({
      name,
      description: template.description,
      datasetId: template.datasetId,
      nodes: template.nodes,
      edges: template.edges,
      settings: template.settings,
      isActive: true,
      isTemplate: false,
      tags: template.tags,
      userId,
      metadata: {
        ...template.metadata,
        createdBy: userId,
        lastModifiedBy: userId,
        templateId: template.id,
      },
    });

    return await this.workflowRepository.save(workflow);
  }

  /**
   * Validate workflow configuration
   */
  private async validateWorkflowConfiguration(
    workflowDto: CreateWorkflowDto | UpdateWorkflowDto,
  ): Promise<void> {
    const { nodes, edges, settings } = workflowDto;

    // Validate nodes - allow empty workflows for initial creation
    if (!nodes) {
      throw new Error('Nodes array is required');
    }

    // Check for duplicate node IDs (only if nodes exist)
    if (nodes.length > 0) {
      const nodeIds = nodes.map((node) => node.id);
      const uniqueNodeIds = new Set(nodeIds);
      if (nodeIds.length !== uniqueNodeIds.size) {
        throw new Error('Duplicate node IDs found');
      }
    }

    // Validate each node (only if nodes exist)
    if (nodes.length > 0) {
      for (const node of nodes) {
        // Validate step type
        const stepInstance = this.stepRegistry.createStepInstance(node.type);
        if (!stepInstance) {
          throw new Error(`Invalid node type: ${node.type}`);
        }

        // Provide default configuration if empty
        let config = this.getDefaultConfigForStepType(node.type, node.config);

        // Validate node configuration
        const validation = await this.stepRegistry.validateStepConfig(
          node.type,
          config,
        );
        if (!validation.isValid) {
          throw new Error(
            `Invalid configuration for node ${node.name}: ${validation.errors.join(', ')}`,
          );
        }

        // Update node config with defaults
        node.config = config;

        // Basic node validation - simplified nodes don't require input/output validation
      }
    }

    // Validate edges
    if (edges) {
      for (const edge of edges) {
        // Check if source and target nodes exist
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);

        if (!sourceNode) {
          throw new Error(
            `Edge references non-existent source node: ${edge.source}`,
          );
        }

        if (!targetNode) {
          throw new Error(
            `Edge references non-existent target node: ${edge.target}`,
          );
        }
      }
    }

    // Validate settings
    if (!settings) {
      throw new Error('Workflow settings are required');
    }

    if (!settings.errorHandling) {
      throw new Error('Error handling strategy is required');
    }

    if (!['stop', 'continue', 'retry'].includes(settings.errorHandling)) {
      throw new Error('Error handling must be one of: stop, continue, retry');
    }

    if (
      settings.maxRetries < 0 ||
      settings.maxRetries > WORKFLOW_CONSTANTS.MAX_RETRIES
    ) {
      throw new Error(
        `Max retries must be between 0 and ${WORKFLOW_CONSTANTS.MAX_RETRIES}`,
      );
    }
  }

  /**
   * Get default configuration for a step type
   */
  private getDefaultConfigForStepType(
    stepType: string,
    existingConfig: any,
  ): any {
    // Get default configuration for the step type
    let defaultConfig = {};
    switch (stepType) {
      case 'duplicate_segment':
        defaultConfig = {
          method: 'hash',
          similarityThreshold: 0.8,
          contentField: 'content',
          caseSensitive: false,
          ignoreWhitespace: true,
          normalizeText: true,
        };
        break;

      case 'rule_based_filter':
        defaultConfig = {
          rules: [],
          defaultAction: 'keep',
          caseSensitive: false,
          wholeWord: false,
          preserveEmptySegments: false,
        };
        break;

      case 'ai_summarization':
        defaultConfig = {
          maxLength: WORKFLOW_CONSTANTS.MAX_LENGTH,
          minLength: WORKFLOW_CONSTANTS.MIN_LENGTH,
          temperature: 0.7,
          batchSize: WORKFLOW_CONSTANTS.BATCH_SIZE_SMALL,
          preserveOriginal: false,
        };
        break;

      case 'embedding_generation':
        defaultConfig = {
          model: 'Xenova/bge-m3',
          provider: 'local',
          batchSize: WORKFLOW_CONSTANTS.BATCH_SIZE_SMALL,
          useWorkerPool: true,
          maxConcurrency: 3,
          skipExisting: true,
          updateExisting: false,
        };
        break;

      case 'graph_extraction':
        defaultConfig = {
          temperature: 0.7,
          enableDeduplication: true,
          batchSize: WORKFLOW_CONSTANTS.BATCH_SIZE_MEDIUM,
          confidenceThreshold: 0.7,
          extractRelations: true,
          extractEntities: true,
        };
        break;

      case 'test':
        defaultConfig = {
          testName: 'Test Output',
          description: 'Testing workflow output',
          enabled: true,
          showJsonOutput: true,
          maxOutputItems: WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
        };
        break;

      case 'trigger_manual':
        defaultConfig = {
          triggerName: 'Manual Trigger',
          description: 'Manually triggered workflow execution',
          enabled: true,
        };
        break;

      case 'trigger_schedule':
        defaultConfig = {
          schedule: '0 9 * * *', // Daily at 9 AM
          timezone: 'UTC',
          enabled: true,
          description: 'Scheduled workflow execution',
        };
        break;

      case 'datasource':
        defaultConfig = {
          sourceType: 'dataset',
          datasetId: '',
          documentIds: [],
          segmentIds: [],
          enabled: true,
        };
        break;

      case 'lenx_api_datasource':
        defaultConfig = {
          apiUrl: 'https://prod-searcher.fasta.ai/api/raw/all',
          authToken: '',
          dateMode: 'dynamic',
          query: '',
          intervalMinutes: 30,
          timeout: 30000,
          maxRetries: 3,
        };
        break;

      case 'post_upserter':
        // Default config: map hash field from input data
        // If hash exists in input, use it; otherwise user must provide hashConfig
        defaultConfig = {
          fieldMappings: {
            hash: 'hash', // Default to 'hash' field in input data
          },
        };
        break;

      default:
        defaultConfig = {};
    }

    // Merge existing config with defaults, with existing config taking precedence
    return {
      ...defaultConfig,
      ...(existingConfig || {}),
    };
  }

  /**
   * Duplicate a workflow
   */
  async duplicateWorkflow(
    workflowId: string,
    userId: string,
  ): Promise<Workflow> {
    this.logger.log(`Duplicating workflow: ${workflowId}`);

    // Get the original workflow
    const originalWorkflow = await this.getWorkflow(workflowId, userId);
    if (!originalWorkflow) {
      throw new Error('Workflow not found');
    }

    // Create a new workflow with duplicated data
    const duplicatedWorkflow = this.workflowRepository.create({
      name: `${originalWorkflow.name} (Copy)`,
      description: originalWorkflow.description,
      datasetId: originalWorkflow.datasetId,
      nodes: originalWorkflow.nodes,
      edges: originalWorkflow.edges,
      settings: originalWorkflow.settings,
      isActive: false, // Duplicated workflows start as inactive
      isTemplate: false, // Duplicated workflows are not templates
      tags: originalWorkflow.tags,
      userId,
      metadata: {
        ...originalWorkflow.metadata,
        version: WORKFLOW_CONSTANTS.VERSION,
        createdBy: userId,
        lastModifiedBy: userId,
        duplicatedFrom: workflowId,
        duplicatedAt: new Date().toISOString(),
      },
    });

    const savedWorkflow =
      await this.workflowRepository.save(duplicatedWorkflow);
    this.logger.log(`Workflow duplicated: ${savedWorkflow.id}`);

    return savedWorkflow;
  }

  /**
   * Recursively limit arrays to maxItems (default MAX_ARRAY_ITEMS) for preview
   * This prevents large arrays from being returned in test output
   */
  private limitArraySizes(
    data: any,
    maxItems: number = WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
  ): any {
    if (Array.isArray(data)) {
      // Limit array size
      const limited = data.slice(0, maxItems);
      // Recursively process each item in the array
      return limited.map((item) => this.limitArraySizes(item, maxItems));
    } else if (data && typeof data === 'object') {
      // Process object properties recursively
      const limited: any = {};
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          limited[key] = this.limitArraySizes(data[key], maxItems);
        }
      }
      return limited;
    }
    // Primitive values or null/undefined - return as-is
    return data;
  }

  /**
   * Test a workflow step with actual data
   */
  async testStep(
    stepType: string,
    config: any,
    userId: string,
    inputSegments?: any[],
    previousOutput?: any,
  ): Promise<any> {
    this.logger.log(
      `Testing step: ${stepType} with ${inputSegments?.length || 0} input segments`,
    );

    try {
      // Get the step instance from the registry
      const stepInstance = this.stepRegistry.createStepInstance(stepType);
      if (!stepInstance) {
        throw new Error(`Step type not found: ${stepType}`);
      }

      // Validate the configuration
      const validation = await stepInstance.validate(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(', ')}`,
        );
      }

      // Create a mock execution context
      const context = {
        executionId: `test_${Date.now()}`,
        pipelineConfigId: 'test',
        userId,
        logger: this.logger,
      };

      // Convert previousOutput to inputSegments if needed
      let segmentsToProcess = inputSegments || [];

      if (segmentsToProcess.length === 0 && previousOutput) {
        this.logger.debug(
          `Converting previousOutput to inputSegments for ${stepType}`,
        );
        segmentsToProcess =
          this.convertPreviousOutputToSegments(previousOutput);
        this.logger.debug(
          `Converted ${segmentsToProcess.length} segments from previousOutput`,
        );
      }

      // Generic warning if step expects input but none provided
      if (segmentsToProcess.length === 0) {
        this.logger.warn(
          `No input segments provided for ${stepType}. Please test the previous node first to provide input data.`,
        );
      }

      this.logger.log(
        `Processing ${segmentsToProcess.length} input segments for step: ${stepType}`,
      );

      // Log the first input segment for debugging
      if (segmentsToProcess.length > 0) {
        this.logger.debug(
          `First input segment structure: ${JSON.stringify(Object.keys(segmentsToProcess[0]))}`,
        );
      }

      // Execute the step with input segments
      const result = await stepInstance.execute(
        segmentsToProcess,
        config,
        context,
      );

      // Use step's formatOutput method to format the output
      const formattedOutput = stepInstance.formatOutput(
        result,
        segmentsToProcess,
      );

      // Debug logging for post_deleter
      if (stepType === 'post_deleter') {
        this.logger.log(
          `[Post Deleter Test Debug] formattedOutput type: ${Array.isArray(formattedOutput) ? 'array' : typeof formattedOutput}, value: ${JSON.stringify(formattedOutput).substring(0, 300)}`,
        );
        this.logger.log(
          `[Post Deleter Test Debug] result.outputSegments length: ${result.outputSegments?.length || 0}`,
        );

        // Ensure post_deleter never returns empty array
        if (Array.isArray(formattedOutput) && formattedOutput.length === 0) {
          this.logger.warn(
            `[Post Deleter Test] formatOutput returned empty array, using default structure`,
          );
          const defaultOutput = {
            deleted: 0,
            requested: 0,
            failed: 0,
            postIds: [],
          };
          return this.limitArraySizes(
            defaultOutput,
            WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
          );
        }
      }

      // Apply generic array size limiting to all step types (recursively limits arrays > MAX_ARRAY_ITEMS items)
      return this.limitArraySizes(
        formattedOutput,
        WORKFLOW_CONSTANTS.MAX_ARRAY_ITEMS,
      );
    } catch (error) {
      this.logger.error(`Step test failed: ${error.message}`, error.stack);
      return {
        success: false,
        stepType,
        error: error.message,
        testMetadata: {
          executedAt: new Date().toISOString(),
          userId,
          stepType,
          config,
        },
      };
    }
  }

  /**
   * Convert previousOutput (from previous node's testOutput) to inputSegments format
   * Handles various output formats: { data: [] }, { items: [] }, or array directly
   */
  private convertPreviousOutputToSegments(previousOutput: any): any[] {
    this.logger.debug(
      `Converting previousOutput to segments. Type: ${typeof previousOutput}, isArray: ${Array.isArray(previousOutput)}`,
    );

    let items: any[] = [];

    // Handle different output structures
    if (Array.isArray(previousOutput)) {
      // Direct array
      items = previousOutput;
    } else if (previousOutput && typeof previousOutput === 'object') {
      // Try common structures
      if (Array.isArray(previousOutput.data)) {
        items = previousOutput.data;
        this.logger.debug(`Found ${items.length} items in previousOutput.data`);
      } else if (Array.isArray(previousOutput.items)) {
        items = previousOutput.items;
        this.logger.debug(
          `Found ${items.length} items in previousOutput.items`,
        );
      } else if (Array.isArray(previousOutput.results)) {
        items = previousOutput.results;
        this.logger.debug(
          `Found ${items.length} items in previousOutput.results`,
        );
      } else {
        // Single object - wrap in array
        items = [previousOutput];
        this.logger.debug(`Treating previousOutput as single object`);
      }
    } else {
      this.logger.warn(
        `Unexpected previousOutput type: ${typeof previousOutput}`,
      );
      return [];
    }

    // Convert items to DocumentSegment format
    const segments = items.map((item, index) => {
      // If item is already a DocumentSegment-like object, use it as-is
      if (item.content !== undefined || item.id !== undefined) {
        return {
          id: item.id || `segment-${index}`,
          content:
            typeof item.content === 'string'
              ? item.content
              : JSON.stringify(item),
          wordCount: item.wordCount || 0,
          tokens: item.tokens || 0,
          status: item.status || 'pending',
          position: item.position ?? index,
          createdAt: item.createdAt || new Date(),
          updatedAt: item.updatedAt || new Date(),
        };
      }

      // Otherwise, stringify the item as content
      return {
        id: `segment-${index}`,
        content: JSON.stringify(item),
        wordCount: 0,
        tokens: 0,
        status: 'pending',
        position: index,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    this.logger.debug(
      `Converted ${segments.length} segments. First segment keys: ${Object.keys(segments[0] || {}).join(', ')}`,
    );

    return segments;
  }

  /**
   * Delete a single workflow execution
   */
  async deleteExecution(
    executionId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Deleting execution: ${executionId}`);

    const execution = await this.executionRepository.findOne({
      where: {
        id: executionId,
        userId,
      },
      relations: ['workflow'],
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    // Check if execution is currently running or pending
    if (execution.status === 'running' || execution.status === 'pending') {
      throw new Error(
        'Cannot delete a running or pending execution. Please cancel it first.',
      );
    }

    await this.executionRepository.remove(execution);
    this.logger.log(`Execution deleted: ${executionId}`);

    return {
      success: true,
      message: 'Execution deleted successfully',
    };
  }

  /**
   * Delete multiple workflow executions
   */
  async deleteExecutions(
    executionIds: string[],
    userId: string,
  ): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
    cancelledCount?: number;
  }> {
    this.logger.log(`Deleting ${executionIds.length} executions`);

    if (!executionIds || executionIds.length === 0) {
      throw new Error('No execution IDs provided');
    }

    // Find all executions that belong to the user
    const executions = await this.executionRepository.find({
      where: {
        id: In(executionIds),
        userId,
      },
    });

    if (executions.length === 0) {
      throw new Error('No executions found');
    }

    // Cancel running executions first, then delete all
    const runningExecutions = executions.filter((e) => e.status === 'running');

    // Cancel running executions before deleting
    if (runningExecutions.length > 0) {
      const runningIds = runningExecutions.map((e) => e.id);
      await this.executionRepository.update(
        { id: In(runningIds) },
        {
          status: 'cancelled',
          completedAt: new Date(),
          cancellationReason: 'Cancelled before batch deletion',
          cancelledBy: userId,
          cancelledAt: new Date(),
        },
      );
      this.logger.log(
        `Cancelled ${runningExecutions.length} running execution(s) before deletion`,
      );
    }

    // Delete all executions (now all are cancellable/deletable)
    await this.executionRepository.remove(executions);
    this.logger.log(`${executions.length} executions deleted`);

    const message =
      runningExecutions.length > 0
        ? `${executions.length} execution(s) deleted successfully (${runningExecutions.length} were cancelled first).`
        : `${executions.length} execution(s) deleted successfully`;

    return {
      success: true,
      message,
      deletedCount: executions.length,
      cancelledCount: runningExecutions.length,
    };
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
}
