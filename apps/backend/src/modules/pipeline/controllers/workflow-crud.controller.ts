import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto/workflow.dto';

@Injectable()
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
  ) {}

  /**
   * Create a new workflow
   */
  async createWorkflow(
    createDto: CreateWorkflowDto,
    userId: string,
  ): Promise<Workflow> {
    this.logger.log(`Creating workflow: ${createDto.name}`);

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

    return await this.workflowRepository.save(workflow);
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
    filters: {
      datasetId?: string;
      isTemplate?: boolean;
      isActive?: boolean;
      tags?: string;
    } = {},
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

    Object.assign(workflow, updateDto);
    workflow.metadata = {
      ...workflow.metadata,
      lastModifiedBy: userId,
      ...updateDto.metadata,
    };

    return await this.workflowRepository.save(workflow);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting workflow: ${id}`);

    const workflow = await this.getWorkflow(id, userId);

    // Check if workflow has executions
    const executionCount = await this.executionRepository.count({
      where: { workflowId: id },
    });

    if (executionCount > 0) {
      throw new Error(
        `Cannot delete workflow with ${executionCount} executions. Please delete executions first.`,
      );
    }

    await this.workflowRepository.remove(workflow);
  }

  /**
   * Get workflow execution history
   */
  async getWorkflowExecutions(
    workflowId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ executions: WorkflowExecution[]; total: number }> {
    const [executions, total] = await this.executionRepository.findAndCount({
      where: { workflowId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { executions, total };
  }
}
