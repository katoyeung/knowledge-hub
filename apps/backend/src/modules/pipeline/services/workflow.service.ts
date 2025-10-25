import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto/workflow.dto';
import { PipelineStepRegistry } from './pipeline-step-registry.service';

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
        version: '1.0.0',
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
   * Get all workflows with filters
   */
  async getWorkflows(
    userId: string,
    filters: WorkflowFilters = {},
  ): Promise<Workflow[]> {
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

    return await queryBuilder.orderBy('workflow.createdAt', 'DESC').getMany();
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

    // Validate workflow configuration
    await this.validateWorkflowConfiguration(updateDto);

    // Update workflow
    Object.assign(workflow, updateDto);
    workflow.metadata = {
      ...workflow.metadata,
      lastModifiedBy: userId,
      ...updateDto.metadata,
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
   */
  private optimizeExecutionData(
    execution: WorkflowExecution,
  ): WorkflowExecution {
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
        const config = this.getDefaultConfigForStepType(node.type, node.config);

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

    if (settings.maxRetries < 0 || settings.maxRetries > 10) {
      throw new Error('Max retries must be between 0 and 10');
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
          method: 'content_hash',
          action: 'skip',
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
          maxLength: 1000,
          minLength: 100,
          temperature: 0.7,
          batchSize: 5,
          preserveOriginal: false,
        };
        break;

      case 'embedding_generation':
        defaultConfig = {
          model: 'Xenova/bge-m3',
          provider: 'local',
          batchSize: 5,
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
          batchSize: 10,
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
          maxOutputItems: 10,
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
        version: '1.0.0',
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

      // Use provided input segments or empty array for data source steps
      const segmentsToProcess = inputSegments || [];
      this.logger.log(
        `Processing ${segmentsToProcess.length} input segments for step: ${stepType}`,
      );

      // Execute the step with input segments
      const result = await stepInstance.execute(
        segmentsToProcess,
        config,
        context,
      );

      // Return the result with additional metadata
      return {
        success: result.success,
        stepType,
        stepName: stepInstance.getMetadata().name,
        outputSegments:
          result.outputSegments?.map((segment: any) => ({
            id: segment.id,
            content:
              segment.content.substring(0, 200) +
              (segment.content.length > 200 ? '...' : ''),
            wordCount: segment.wordCount,
            tokens: segment.tokens,
            status: segment.status,
            enabled: segment.enabled,
            createdAt: segment.createdAt,
            documentId: segment.documentId,
            datasetId: segment.datasetId,
          })) || [],
        duplicates:
          result.duplicates?.map((segment: any) => ({
            id: segment.id,
            content:
              segment.content.substring(0, 200) +
              (segment.content.length > 200 ? '...' : ''),
            wordCount: segment.wordCount,
            tokens: segment.tokens,
            status: segment.status,
            enabled: segment.enabled,
            createdAt: segment.createdAt,
            documentId: segment.documentId,
            datasetId: segment.datasetId,
          })) || [],
        metrics: result.metrics,
        error: result.error,
        testMetadata: {
          executedAt: new Date().toISOString(),
          userId,
          stepType,
          config,
        },
      };
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
  ): Promise<{ success: boolean; message: string; deletedCount: number }> {
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

    // Check if any execution is currently running
    const runningExecutions = executions.filter((e) => e.status === 'running');
    if (runningExecutions.length > 0) {
      throw new Error(
        `Cannot delete ${runningExecutions.length} running execution(s). Please cancel them first.`,
      );
    }

    // Delete all executions
    await this.executionRepository.remove(executions);
    this.logger.log(`${executions.length} executions deleted`);

    return {
      success: true,
      message: `${executions.length} execution(s) deleted successfully`,
      deletedCount: executions.length,
    };
  }
}
