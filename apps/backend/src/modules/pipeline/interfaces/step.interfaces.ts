import { Logger } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

/**
 * Step execution context
 */
export interface StepExecutionContext {
  executionId: string;
  pipelineConfigId: string;
  documentId?: string;
  datasetId?: string;
  userId: string;
  logger: Logger;
  metadata?: Record<string, any>;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
  success: boolean;
  outputSegments: DocumentSegment[];
  metrics: ExecutionMetrics;
  error?: string;
  warnings?: string[];
  rollbackData?: any;
  duplicates?: DocumentSegment[];
  metadata?: Record<string, any>;
  // Count information for frontend display
  count?: number;
  totalCount?: number;
  duplicateCount?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  error?: string;
}

/**
 * Step metadata
 */
export interface StepMetadata {
  type: string;
  name: string;
  description: string;
  version: string;
  inputTypes: string[];
  outputTypes: string[];
  configSchema?: ConfigSchema;
  categories?: string[];
}

/**
 * Configuration schema
 */
export interface ConfigSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  inputCount: number;
  outputCount: number;
  filteredCount?: number;
  duration: number;
  throughput?: number;
  memoryUsage?: number;
  averageProcessingTime?: number;
  stepType?: string;
  stepName?: string;
  [key: string]: any;
}

/**
 * Basic step configuration interface
 */
export interface IStepConfig {
  [key: string]: any;
}

/**
 * Core step contract
 */
export interface IStep {
  readonly type: string;
  readonly name: string;
  readonly version: string;

  /**
   * Execute the step with given input
   * Input can be any type - array, object, primitive - stored and passed as-is
   */
  execute(
    input: any,
    config: IStepConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult>;

  /**
   * Get step metadata
   */
  getMetadata(): StepMetadata;

  /**
   * Format output for storage/display
   * This allows each step to control how its output is formatted
   * @param result The execution result from execute()
   * @param originalInput The original input segments (before execution)
   * @returns Formatted output data for storage/display
   */
  formatOutput(
    result: StepExecutionResult,
    originalInput?: DocumentSegment[],
  ): any;
}

/**
 * Configuration validation contract
 */
export interface IConfigurable<T extends IStepConfig> {
  /**
   * Validate configuration
   */
  validate(config: T): Promise<ValidationResult>;

  /**
   * Get configuration schema
   */
  getConfigSchema(): ConfigSchema;
}

/**
 * Rollback contract
 */
export interface IRollbackable {
  /**
   * Rollback the step execution
   */
  rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<RollbackResult>;

  /**
   * Create rollback data
   */
  createRollbackData(input: DocumentSegment[], config: IStepConfig): any;
}

/**
 * Validation contract for data validation
 */
export interface IValidatable<T> {
  /**
   * Validate data
   */
  validate(data: T): Promise<ValidationResult>;
}

/**
 * Step factory interface
 */
export interface IStepFactory {
  /**
   * Create a step by type
   */
  create(type: string): IStep;

  /**
   * Create multiple steps
   */
  createMultiple(types: string[]): IStep[];

  /**
   * Create and validate step
   */
  createAndValidate(type: string, config: IStepConfig): Promise<IStep>;
}

/**
 * Category declaration for steps
 */
export interface IStepCategorized {
  /**
   * Get categories this step belongs to
   */
  getStepCategories(): string[];
}
