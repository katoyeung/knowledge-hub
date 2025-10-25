import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineConfig } from '../entities/pipeline-config.entity';
import { PipelineExecution } from '../entities/pipeline-execution.entity';
import {
  CreatePipelineConfigDto,
  UpdatePipelineConfigDto,
} from '../dto/create-pipeline-config.dto';
import { PipelineStepRegistry } from './pipeline-step-registry.service';

@Injectable()
export class PipelineConfigService {
  private readonly logger = new Logger(PipelineConfigService.name);

  constructor(
    @InjectRepository(PipelineConfig)
    private readonly pipelineConfigRepository: Repository<PipelineConfig>,
    @InjectRepository(PipelineExecution)
    private readonly executionRepository: Repository<PipelineExecution>,
    private readonly stepRegistry: PipelineStepRegistry,
  ) {}

  /**
   * Create a new pipeline configuration
   */
  async createPipelineConfig(
    createDto: CreatePipelineConfigDto,
    userId: string,
  ): Promise<PipelineConfig> {
    this.logger.log(`Creating pipeline configuration: ${createDto.name}`);

    // Validate pipeline steps
    await this.validatePipelineSteps(createDto.steps);

    // Create pipeline configuration
    const pipelineConfig = this.pipelineConfigRepository.create({
      ...createDto,
      userId,
      isActive: createDto.isActive !== false,
      isTemplate: createDto.isTemplate || false,
    });

    const savedConfig =
      await this.pipelineConfigRepository.save(pipelineConfig);
    this.logger.log(`Pipeline configuration created: ${savedConfig.id}`);

    return savedConfig;
  }

  /**
   * Get all pipeline configurations for a user
   */
  async getPipelineConfigs(
    userId: string,
    filters: {
      datasetId?: string;
      isTemplate?: boolean;
      isActive?: boolean;
    } = {},
  ): Promise<PipelineConfig[]> {
    const queryBuilder = this.pipelineConfigRepository
      .createQueryBuilder('config')
      .where('config.userId = :userId', { userId });

    if (filters.datasetId !== undefined) {
      queryBuilder.andWhere('config.datasetId = :datasetId', {
        datasetId: filters.datasetId,
      });
    }

    if (filters.isTemplate !== undefined) {
      queryBuilder.andWhere('config.isTemplate = :isTemplate', {
        isTemplate: filters.isTemplate,
      });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('config.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    return await queryBuilder.orderBy('config.createdAt', 'DESC').getMany();
  }

  /**
   * Get a pipeline configuration by ID
   */
  async getPipelineConfig(id: string, userId: string): Promise<PipelineConfig> {
    const config = await this.pipelineConfigRepository.findOne({
      where: { id, userId },
    });

    if (!config) {
      throw new NotFoundException(`Pipeline configuration not found: ${id}`);
    }

    return config;
  }

  /**
   * Update a pipeline configuration
   */
  async updatePipelineConfig(
    id: string,
    updateDto: UpdatePipelineConfigDto,
    userId: string,
  ): Promise<PipelineConfig> {
    this.logger.log(`Updating pipeline configuration: ${id}`);

    const config = await this.getPipelineConfig(id, userId);

    // Validate pipeline steps if provided
    if (updateDto.steps) {
      await this.validatePipelineSteps(updateDto.steps);
    }

    // Update configuration
    Object.assign(config, updateDto);
    const updatedConfig = await this.pipelineConfigRepository.save(config);

    this.logger.log(`Pipeline configuration updated: ${id}`);
    return updatedConfig;
  }

  /**
   * Delete a pipeline configuration
   */
  async deletePipelineConfig(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting pipeline configuration: ${id}`);

    const config = await this.getPipelineConfig(id, userId);

    // Check if there are any executions for this configuration
    const executionCount = await this.executionRepository.count({
      where: { pipelineConfigId: id },
    });

    if (executionCount > 0) {
      throw new BadRequestException(
        `Cannot delete pipeline configuration with ${executionCount} executions. Please delete executions first.`,
      );
    }

    await this.pipelineConfigRepository.remove(config);
    this.logger.log(`Pipeline configuration deleted: ${id}`);
  }

  /**
   * Get pipeline templates
   */
  async getPipelineTemplates(): Promise<PipelineConfig[]> {
    return await this.pipelineConfigRepository.find({
      where: { isTemplate: true, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create pipeline from template
   */
  async createFromTemplate(
    templateId: string,
    name: string,
    userId: string,
    datasetId?: string,
  ): Promise<PipelineConfig> {
    this.logger.log(`Creating pipeline from template: ${templateId}`);

    const template = await this.pipelineConfigRepository.findOne({
      where: { id: templateId, isTemplate: true },
    });

    if (!template) {
      throw new NotFoundException(`Pipeline template not found: ${templateId}`);
    }

    // Create new configuration based on template
    const newConfig = this.pipelineConfigRepository.create({
      name,
      description: template.description,
      datasetId,
      userId,
      steps: template.steps,
      settings: template.settings,
      isActive: true,
      isTemplate: false,
      tags: template.tags,
    });

    const savedConfig = await this.pipelineConfigRepository.save(newConfig);
    this.logger.log(`Pipeline created from template: ${savedConfig.id}`);

    return savedConfig;
  }

  /**
   * Validate pipeline steps configuration
   */
  private async validatePipelineSteps(steps: any[]): Promise<void> {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException('Pipeline must have at least one step');
    }

    // Check for duplicate step IDs
    const stepIds = steps.map((step) => step.id);
    const uniqueIds = new Set(stepIds);
    if (stepIds.length !== uniqueIds.size) {
      throw new BadRequestException('Step IDs must be unique');
    }

    // Validate each step
    for (const step of steps) {
      if (!step.type) {
        throw new BadRequestException('Step type is required');
      }

      if (!this.stepRegistry.hasStep(step.type)) {
        throw new BadRequestException(`Unknown step type: ${step.type}`);
      }

      // Validate step configuration
      const validation = await this.stepRegistry.validateStepConfig(
        step.type,
        step.config,
      );
      if (!validation.isValid) {
        throw new BadRequestException(
          `Invalid configuration for step ${step.name}: ${validation.errors.join(', ')}`,
        );
      }
    }

    // Validate step order
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedSteps.length; i++) {
      if (sortedSteps[i].order !== i) {
        throw new BadRequestException(
          'Step order must be sequential starting from 0',
        );
      }
    }
  }

  /**
   * Get pipeline execution statistics
   */
  async getPipelineStats(
    id: string,
    userId: string,
  ): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    lastExecution?: Date;
  }> {
    const config = await this.getPipelineConfig(id, userId);

    const executions = await this.executionRepository.find({
      where: { pipelineConfigId: id },
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
}
