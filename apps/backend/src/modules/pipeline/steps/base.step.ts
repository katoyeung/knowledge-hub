import { Logger } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  IStep,
  IStepConfig,
  StepExecutionContext,
  StepExecutionResult,
  StepMetadata,
  ValidationResult,
  IRollbackable,
  IConfigurable,
  ExecutionMetrics,
  ConfigSchema,
} from '../interfaces/step.interfaces';

// Re-export interfaces for backward compatibility
export type {
  StepExecutionContext,
  StepExecutionResult,
  IStepConfig as StepConfig,
};

export abstract class BaseStep
  implements IStep, IRollbackable, IConfigurable<IStepConfig>
{
  protected readonly logger: Logger;
  protected readonly stepType: string;
  protected readonly stepName: string;
  public readonly version: string;

  constructor(stepType: string, stepName: string, version: string = '1.0.0') {
    this.stepType = stepType;
    this.stepName = stepName;
    this.version = version;
    this.logger = new Logger(`${this.constructor.name}`);
  }

  // IStep interface implementation
  get type(): string {
    return this.stepType;
  }

  get name(): string {
    return this.stepName;
  }

  /**
   * Template method - standard execution flow
   * Subclasses only need to implement executeStep()
   */
  async execute(
    inputSegments: DocumentSegment[],
    config: IStepConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();

    try {
      // 1. Pre-execution validation
      const validation = await this.validate(config);
      if (!validation.isValid) {
        return this.createErrorResult(
          inputSegments,
          startTime,
          validation.errors.join(', '),
        );
      }

      if (validation.warnings && validation.warnings.length > 0) {
        this.logger.warn(
          `Configuration warnings: ${validation.warnings.join(', ')}`,
        );
      }

      // 2. Check if should execute
      if (!this.shouldExecute(inputSegments, config, context)) {
        return this.createSkipResult(inputSegments, startTime);
      }

      // 3. Pre-processing
      const preprocessed = this.preProcess(inputSegments, config, context);

      // 4. Main execution (override in subclasses)
      const output = await this.executeStep(preprocessed, config, context);

      // 5. Post-processing
      const postprocessed = this.postProcess(output, config, context);

      // 6. Calculate metrics
      const metrics = this.calculateMetrics(
        inputSegments,
        postprocessed,
        startTime,
        new Date(),
      );

      return {
        success: true,
        outputSegments: postprocessed,
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      return this.createErrorResult(
        inputSegments,
        startTime,
        error.message,
        error,
      );
    }
  }

  /**
   * Main execution logic (override in subclasses)
   * This is where the actual step work happens
   */
  protected abstract executeStep(
    inputSegments: DocumentSegment[],
    config: IStepConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]>;

  // IConfigurable interface
  abstract validate(config: IStepConfig): Promise<ValidationResult>;

  // IRollbackable interface
  abstract rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }>;

  createRollbackData(input: DocumentSegment[], config: IStepConfig): any {
    return this.createRollbackDataInternal(input, config);
  }

  // IStep interface
  abstract getMetadata(): StepMetadata;

  // IConfigurable interface
  getConfigSchema(): ConfigSchema {
    // Get schema from step's getMetadata method
    const metadata = this.getMetadata();
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  /**
   * Check if step should be executed based on condition
   */
  shouldExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _inputSegments: DocumentSegment[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: IStepConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: StepExecutionContext,
  ): boolean {
    // Default implementation - always execute
    // Override in subclasses for conditional logic
    return true;
  }

  /**
   * Pre-process segments before main execution
   */
  preProcess(
    inputSegments: DocumentSegment[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: IStepConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: StepExecutionContext,
  ): DocumentSegment[] {
    // Default implementation - return segments as-is
    return inputSegments;
  }

  /**
   * Post-process segments after main execution
   */
  postProcess(
    outputSegments: DocumentSegment[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: IStepConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: StepExecutionContext,
  ): DocumentSegment[] {
    // Default implementation - return segments as-is
    return outputSegments;
  }

  /**
   * Standard error result
   */
  protected createErrorResult(
    inputSegments: DocumentSegment[],
    startTime: Date,
    error: string,
    exception?: Error,
  ): StepExecutionResult {
    this.logger.error(`Step execution failed: ${error}`, exception?.stack);

    return {
      success: false,
      outputSegments: inputSegments, // Return original on error
      metrics: this.calculateMetrics(inputSegments, [], startTime, new Date()),
      error,
      rollbackData: this.createRollbackData(inputSegments, {}),
    };
  }

  /**
   * Standard skip result
   */
  protected createSkipResult(
    inputSegments: DocumentSegment[],
    startTime: Date,
  ): StepExecutionResult {
    return {
      success: true,
      outputSegments: inputSegments,
      metrics: this.calculateMetrics(
        inputSegments,
        inputSegments,
        startTime,
        new Date(),
      ),
      warnings: ['Step execution skipped by condition'],
    };
  }

  /**
   * Calculate execution metrics
   */
  protected calculateMetrics(
    inputSegments: DocumentSegment[],
    outputSegments: DocumentSegment[],
    startTime: Date,
    endTime: Date,
  ): ExecutionMetrics {
    const duration = endTime.getTime() - startTime.getTime();
    const inputCount = inputSegments.length;
    const outputCount = outputSegments.length;
    const filteredCount = inputCount - outputCount;

    return {
      inputCount,
      outputCount,
      filteredCount,
      duration,
      throughput: duration > 0 ? inputCount / (duration / 1000) : 0,
      memoryUsage: process.memoryUsage().heapUsed,
      averageProcessingTime: inputCount > 0 ? duration / inputCount : 0,
      stepType: this.stepType,
      stepName: this.stepName,
    };
  }

  /**
   * Create rollback data for potential rollback (internal implementation)
   */
  protected createRollbackDataInternal(
    inputSegments: DocumentSegment[],
    config: IStepConfig,
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

  /**
   * Format output for storage/display
   * Default implementation returns outputSegments as-is
   * Override in subclasses for custom formatting
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    // Default: return output segments directly
    // If duplicates exist, include them in a structured format
    if (result.duplicates && result.duplicates.length > 0) {
      return {
        data: result.outputSegments,
        duplicates: result.duplicates,
      };
    }
    return result.outputSegments;
  }
}
