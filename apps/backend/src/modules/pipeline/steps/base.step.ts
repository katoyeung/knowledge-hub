import { Logger } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface StepExecutionContext {
  executionId: string;
  pipelineConfigId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  logger: Logger;
  metadata?: Record<string, any>;
}

export interface StepExecutionResult {
  success: boolean;
  outputSegments: DocumentSegment[];
  metrics: Record<string, any>;
  error?: string;
  rollbackData?: any;
  duplicates?: DocumentSegment[]; // Optional property for duplicate detection results
}

export interface StepConfig {
  [key: string]: any;
}

export abstract class BaseStep {
  protected readonly logger: Logger;
  protected readonly stepType: string;
  protected readonly stepName: string;

  constructor(stepType: string, stepName: string) {
    this.stepType = stepType;
    this.stepName = stepName;
    this.logger = new Logger(`${this.constructor.name}`);
  }

  /**
   * Execute the step with given input segments and configuration
   */
  abstract execute(
    inputSegments: DocumentSegment[],
    config: StepConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult>;

  /**
   * Validate the step configuration before execution
   */
  abstract validate(
    config: StepConfig,
  ): Promise<{ isValid: boolean; errors: string[] }>;

  /**
   * Rollback the step if execution fails
   */
  abstract rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Get step metadata and capabilities
   */
  abstract getMetadata(): {
    type: string;
    name: string;
    description: string;
    version: string;
    inputTypes: string[];
    outputTypes: string[];
    configSchema: Record<string, any>;
  };

  /**
   * Check if step should be executed based on condition
   */
  async shouldExecute(
    inputSegments: DocumentSegment[],
    config: StepConfig,
    context: StepExecutionContext,
  ): Promise<boolean> {
    // Default implementation - always execute
    // Override in subclasses for conditional logic
    return true;
  }

  /**
   * Pre-process segments before main execution
   */
  async preProcess(
    inputSegments: DocumentSegment[],
    config: StepConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    // Default implementation - return segments as-is
    return inputSegments;
  }

  /**
   * Post-process segments after main execution
   */
  async postProcess(
    outputSegments: DocumentSegment[],
    config: StepConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    // Default implementation - return segments as-is
    return outputSegments;
  }

  /**
   * Calculate execution metrics
   */
  protected calculateMetrics(
    inputSegments: DocumentSegment[],
    outputSegments: DocumentSegment[],
    startTime: Date,
    endTime: Date,
  ): Record<string, any> {
    const duration = endTime.getTime() - startTime.getTime();
    const inputCount = inputSegments.length;
    const outputCount = outputSegments.length;
    const filteredCount = inputCount - outputCount;

    return {
      inputCount,
      outputCount,
      filteredCount,
      duration,
      averageProcessingTime: inputCount > 0 ? duration / inputCount : 0,
      stepType: this.stepType,
      stepName: this.stepName,
    };
  }

  /**
   * Create rollback data for potential rollback
   */
  protected createRollbackData(
    inputSegments: DocumentSegment[],
    config: StepConfig,
  ): any {
    return {
      inputSegments: inputSegments.map((segment) => ({
        id: segment.id,
        content: segment.content,
        status: segment.status,
        position: segment.position,
      })),
      config,
      timestamp: new Date(),
    };
  }
}
