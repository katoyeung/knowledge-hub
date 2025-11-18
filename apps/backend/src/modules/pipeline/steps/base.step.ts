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

export interface UnwrapResult {
  segments: any[];
  extractedKey: string | null;
  adjustedFieldPath?: string;
}

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

  /**
   * Shared utility to unwrap input data structures
   * Handles: arrays, objects with array properties, wrapped arrays
   * Returns the array of items to process and metadata about extraction
   *
   * @param input - Can be array, object, or anything
   * @param fieldPath - Optional field path to adjust (e.g., "data.post_message")
   * @returns UnwrapResult with segments array and extraction metadata
   */
  protected unwrapInput(input: any, fieldPath?: string): UnwrapResult {
    let segments: any[] = [];
    let extractedKey: string | null = null;
    let adjustedFieldPath = fieldPath;

    // Case 1: Input is already an array
    if (Array.isArray(input)) {
      // Check if it's a wrapped array: [{ data: [...] }]
      if (
        input.length === 1 &&
        input[0] &&
        typeof input[0] === 'object' &&
        input[0] !== null
      ) {
        const wrapper = input[0];

        // Look for any array property in the wrapper (items, data, results, etc.)
        for (const [key, value] of Object.entries(wrapper)) {
          if (Array.isArray(value) && value.length > 0) {
            // Check if this array contains objects (not primitives)
            if (
              value.length > 0 &&
              typeof value[0] === 'object' &&
              value[0] !== null
            ) {
              // Special case: if array[0] has a 'data' array, extract that (nested structure)
              if (
                'data' in value[0] &&
                Array.isArray(value[0].data) &&
                value[0].data.length > 0
              ) {
                segments = value[0].data;
                extractedKey = key;

                // Adjust field path if it starts with "data."
                if (
                  adjustedFieldPath &&
                  adjustedFieldPath.startsWith('data.')
                ) {
                  adjustedFieldPath = adjustedFieldPath.substring(5);
                }
                break;
              }

              // Regular array property extraction
              segments = value;
              extractedKey = key;

              // Adjust field path by removing the array property prefix
              if (
                adjustedFieldPath &&
                adjustedFieldPath.startsWith(`${key}.`)
              ) {
                adjustedFieldPath = adjustedFieldPath.substring(key.length + 1);
              }
              break;
            }
          }
        }
      } else {
        // Already an array of items - use directly
        segments = input;
      }
    } else if (typeof input === 'object' && input !== null) {
      // Case 2: Input is an object (not array) - look for array property like { data: [...] }
      for (const [key, value] of Object.entries(input)) {
        if (Array.isArray(value) && value.length > 0) {
          segments = value;
          extractedKey = key;

          // Adjust field path by removing the array property prefix
          if (adjustedFieldPath && adjustedFieldPath.startsWith(`${key}.`)) {
            adjustedFieldPath = adjustedFieldPath.substring(key.length + 1);
          }
          break;
        }
      }

      if (segments.length === 0) {
        this.logger.warn(
          `No array property found in input object. Keys: ${Object.keys(input).join(', ')}`,
        );
      }
    } else {
      // Case 3: Primitive or null - can't process
      this.logger.warn(`Input is not an array or object: ${typeof input}`);
      segments = [];
    }

    return {
      segments,
      extractedKey,
      adjustedFieldPath,
    };
  }

  /**
   * Convert unwrapped segments to DocumentSegment[] format
   * Useful for steps that need DocumentSegment[] internally
   */
  protected segmentsToDocumentSegments(segments: any[]): DocumentSegment[] {
    // Defensive check: ensure segments is an array
    if (!Array.isArray(segments)) {
      this.logger.warn(
        `segmentsToDocumentSegments received non-array input. Type: ${typeof segments}, converting to array.`,
      );
      segments = segments ? [segments] : [];
    }

    return segments.map((item, index) => {
      if (item instanceof DocumentSegment) {
        return item;
      }
      // Convert object/primitive to DocumentSegment
      // Note: This creates a minimal DocumentSegment-like object
      // Full DocumentSegment requires more fields, but this is sufficient for step processing
      const segment = {
        id: item.id || `seg-${index}`,
        content: typeof item === 'string' ? item : JSON.stringify(item),
        wordCount: item.wordCount || 0,
        tokens: item.tokens || 0,
        keywords: item.keywords || {},
        status: item.status || 'waiting',
        position: item.position || index + 1,
        metadata: item.metadata || {},
        ...item, // Spread to preserve any additional fields
      };
      return segment as unknown as DocumentSegment;
    });
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
   * Accepts any input type (array, object, etc.) and unwraps it internally
   * Subclasses can override execute() for custom handling or use executeStep()
   */
  async execute(
    input: any,
    config: IStepConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();

    try {
      // 1. Unwrap input to get array of segments
      const unwrapResult = this.unwrapInput(input);
      const inputSegments = this.segmentsToDocumentSegments(
        unwrapResult.segments,
      );

      // 2. Pre-execution validation
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

      // 3. Check if should execute
      if (!this.shouldExecute(inputSegments, config, context)) {
        return this.createSkipResult(inputSegments, startTime);
      }

      // 4. Pre-processing
      const preprocessed = this.preProcess(inputSegments, config, context);

      // 5. Main execution (override in subclasses)
      const output = await this.executeStep(preprocessed, config, context);

      // 6. Post-processing
      const postprocessed = this.postProcess(output, config, context);

      // 7. Calculate metrics
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
      // Fallback: try to create segments from input for error reporting
      const unwrapResult = this.unwrapInput(input);
      // Ensure segments is an array before passing to segmentsToDocumentSegments
      let segments = unwrapResult.segments;
      if (!Array.isArray(segments)) {
        this.logger.warn(
          `Error handler: unwrapInput returned non-array segments. Type: ${typeof segments}, converting to array.`,
        );
        segments = segments ? [segments] : [];
      }
      const inputSegments = this.segmentsToDocumentSegments(segments);
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
    // Defensive check: ensure inputSegments is an array
    if (!Array.isArray(inputSegments)) {
      this.logger.warn(
        `createRollbackDataInternal received non-array input. Type: ${typeof inputSegments}, converting to array.`,
      );
      inputSegments = inputSegments ? [inputSegments] : [];
    }

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
