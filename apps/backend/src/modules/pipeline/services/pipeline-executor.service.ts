import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  PipelineExecution,
  StepExecutionResult,
  ExecutionMetrics,
} from '../entities/pipeline-execution.entity';
import {
  PipelineConfig,
  PipelineStepConfig,
} from '../entities/pipeline-config.entity';
import {
  BaseStep,
  StepExecutionContext,
  StepExecutionResult as StepResult,
} from '../steps/base.step';
import { PipelineStepRegistry } from './pipeline-step-registry.service';

export interface ExecutionOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  parallelExecution?: boolean;
  notifyOnProgress?: boolean;
}

@Injectable()
export class PipelineExecutor {
  private readonly logger = new Logger(PipelineExecutor.name);

  constructor(
    @InjectRepository(PipelineExecution)
    private readonly executionRepository: Repository<PipelineExecution>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly stepRegistry: PipelineStepRegistry,
  ) {}

  /**
   * Execute a pipeline with given segments
   */
  async executePipeline(
    pipelineConfig: PipelineConfig,
    inputSegments: DocumentSegment[],
    context: StepExecutionContext,
    options: ExecutionOptions = {},
  ): Promise<PipelineExecution> {
    const executionId = context.executionId;
    this.logger.log(`Starting pipeline execution: ${executionId}`);

    // Create execution record
    const execution = this.executionRepository.create({
      id: executionId,
      pipelineConfigId: pipelineConfig.id,
      documentId: context.documentId,
      datasetId: context.datasetId,
      status: 'running',
      startedAt: new Date(),
      stepResults: [],
      metrics: this.createInitialMetrics(
        pipelineConfig.steps.length,
        inputSegments.length,
      ),
    });

    await this.executionRepository.save(execution);

    try {
      let currentSegments = [...inputSegments];
      const stepResults: StepExecutionResult[] = [];

      // Execute steps in order
      for (const stepConfig of pipelineConfig.steps) {
        if (!stepConfig.enabled) {
          this.logger.log(`Skipping disabled step: ${stepConfig.name}`);
          continue;
        }

        const stepResult = await this.executeStep(
          stepConfig,
          currentSegments,
          context,
          options,
        );

        stepResults.push(stepResult);

        if (stepResult.status === 'failed') {
          if (pipelineConfig.settings.errorHandling === 'stop') {
            throw new Error(
              `Step ${stepConfig.name} failed: ${stepResult.error}`,
            );
          } else if (pipelineConfig.settings.errorHandling === 'continue') {
            this.logger.warn(
              `Step ${stepConfig.name} failed, continuing with next step`,
            );
            continue;
          }
        }

        // Update segments for next step
        if (stepResult.status === 'completed') {
          currentSegments = await this.segmentRepository.findByIds(
            stepResult.outputCount > 0
              ? currentSegments
                  .slice(0, stepResult.outputCount)
                  .map((s) => s.id)
              : [],
          );
        }

        // Update execution progress
        await this.updateExecutionProgress(executionId, stepResults);
      }

      // Complete execution
      const finalMetrics = this.calculateFinalMetrics(
        stepResults,
        inputSegments.length,
      );

      await this.executionRepository.update(executionId, {
        status: 'completed',
        completedAt: new Date(),
        stepResults,
        metrics: finalMetrics,
      });

      this.logger.log(`Pipeline execution completed: ${executionId}`);
      const result = await this.executionRepository.findOne({
        where: { id: executionId },
      });
      if (!result) {
        throw new Error(`Pipeline execution not found: ${executionId}`);
      }
      return result;
    } catch (error) {
      this.logger.error(`Pipeline execution failed: ${executionId}`, error);

      await this.executionRepository.update(executionId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    stepConfig: PipelineStepConfig,
    inputSegments: DocumentSegment[],
    context: StepExecutionContext,
    options: ExecutionOptions,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing step: ${stepConfig.name} (${stepConfig.type})`);

    const stepInstance = this.stepRegistry.createStepInstance(stepConfig.type);
    if (!stepInstance) {
      return {
        stepId: stepConfig.id,
        stepType: stepConfig.type,
        stepName: stepConfig.name,
        status: 'failed',
        startedAt: startTime,
        completedAt: new Date(),
        duration: 0,
        inputCount: inputSegments.length,
        outputCount: 0,
        error: `Step type ${stepConfig.type} not found`,
      };
    }

    try {
      // Check if step should execute
      const shouldExecute = await stepInstance.shouldExecute(
        inputSegments,
        stepConfig.config,
        context,
      );
      if (!shouldExecute) {
        return {
          stepId: stepConfig.id,
          stepType: stepConfig.type,
          stepName: stepConfig.name,
          status: 'skipped',
          startedAt: startTime,
          completedAt: new Date(),
          duration: 0,
          inputCount: inputSegments.length,
          outputCount: inputSegments.length,
        };
      }

      // Pre-process segments
      const preProcessedSegments = await stepInstance.preProcess(
        inputSegments,
        stepConfig.config,
        context,
      );

      // Execute step
      const result: StepResult = await stepInstance.execute(
        preProcessedSegments,
        stepConfig.config,
        context,
      );

      // Post-process segments
      const finalSegments = await stepInstance.postProcess(
        result.outputSegments,
        stepConfig.config,
        context,
      );

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        stepId: stepConfig.id,
        stepType: stepConfig.type,
        stepName: stepConfig.name,
        status: result.success ? 'completed' : 'failed',
        startedAt: startTime,
        completedAt: endTime,
        duration,
        inputCount: inputSegments.length,
        outputCount: finalSegments.length,
        error: result.error,
        metrics: result.metrics,
        rollbackData: result.rollbackData,
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error(`Step execution failed: ${stepConfig.name}`, error);

      return {
        stepId: stepConfig.id,
        stepType: stepConfig.type,
        stepName: stepConfig.name,
        status: 'failed',
        startedAt: startTime,
        completedAt: endTime,
        duration,
        inputCount: inputSegments.length,
        outputCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Update execution progress
   */
  private async updateExecutionProgress(
    executionId: string,
    stepResults: StepExecutionResult[],
  ): Promise<void> {
    const completedSteps = stepResults.filter(
      (r) => r.status === 'completed',
    ).length;
    const failedSteps = stepResults.filter((r) => r.status === 'failed').length;
    const skippedSteps = stepResults.filter(
      (r) => r.status === 'skipped',
    ).length;

    await this.executionRepository.update(executionId, {
      metrics: {
        completedSteps,
        failedSteps,
        skippedSteps,
        totalSteps: stepResults.length,
      },
    });
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(
    totalSteps: number,
    inputSegments: number,
  ): ExecutionMetrics {
    return {
      totalSteps,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalDuration: 0,
      averageStepDuration: 0,
      inputSegments,
      outputSegments: 0,
      segmentsProcessed: 0,
      segmentsFiltered: 0,
      segmentsSummarized: 0,
      embeddingsGenerated: 0,
      graphNodesCreated: 0,
      graphEdgesCreated: 0,
    };
  }

  /**
   * Calculate final metrics
   */
  private calculateFinalMetrics(
    stepResults: StepExecutionResult[],
    initialInputCount: number,
  ): ExecutionMetrics {
    const completedSteps = stepResults.filter(
      (r) => r.status === 'completed',
    ).length;
    const failedSteps = stepResults.filter((r) => r.status === 'failed').length;
    const skippedSteps = stepResults.filter(
      (r) => r.status === 'skipped',
    ).length;
    const totalDuration = stepResults.reduce(
      (sum, r) => sum + (r.duration || 0),
      0,
    );
    const averageStepDuration =
      stepResults.length > 0 ? totalDuration / stepResults.length : 0;

    // Calculate specific metrics from step results
    let segmentsProcessed = 0;
    let segmentsFiltered = 0;
    let segmentsSummarized = 0;
    let embeddingsGenerated = 0;
    let graphNodesCreated = 0;
    let graphEdgesCreated = 0;

    stepResults.forEach((result) => {
      if (result.metrics) {
        segmentsProcessed += result.metrics.segmentsProcessed || 0;
        segmentsFiltered += result.metrics.segmentsFiltered || 0;
        segmentsSummarized += result.metrics.segmentsSummarized || 0;
        embeddingsGenerated += result.metrics.embeddingsGenerated || 0;
        graphNodesCreated += result.metrics.graphNodesCreated || 0;
        graphEdgesCreated += result.metrics.graphEdgesCreated || 0;
      }
    });

    const finalOutputCount =
      stepResults.length > 0
        ? stepResults[stepResults.length - 1].outputCount
        : initialInputCount;

    return {
      totalSteps: stepResults.length,
      completedSteps,
      failedSteps,
      skippedSteps,
      totalDuration,
      averageStepDuration,
      inputSegments: initialInputCount,
      outputSegments: finalOutputCount,
      segmentsProcessed,
      segmentsFiltered,
      segmentsSummarized,
      embeddingsGenerated,
      graphNodesCreated,
      graphEdgesCreated,
    };
  }
}
