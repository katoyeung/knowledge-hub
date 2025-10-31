import { Injectable } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { BaseStep } from './base.step';
import {
  ConfigSchema,
  IStep,
  IStepConfig,
  StepExecutionContext,
  StepMetadata,
  ValidationResult,
} from '../interfaces/step.interfaces';

/**
 * Configuration for composite step
 */
export interface CompositeConfig extends IStepConfig {
  steps: string[]; // Types of steps to chain
  stepConfigs?: Record<string, IStepConfig>; // Config for each step
  stopOnError?: boolean; // Stop on first error or continue
}

/**
 * Composite step that chains multiple steps together
 * Allows creating complex workflows from simple steps
 */
@Injectable()
export class CompositeStep extends BaseStep {
  private readonly subSteps: IStep[];

  constructor(name: string, steps: IStep[], version: string = '1.0.0') {
    super(
      `composite_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      version,
    );
    this.subSteps = steps;
  }

  /**
   * Get sub-steps
   */
  getSubSteps(): IStep[] {
    return this.subSteps;
  }

  /**
   * Main execution - chain sub-steps
   */
  protected async executeStep(
    inputSegments: DocumentSegment[],
    config: CompositeConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    let current = inputSegments;
    const stopOnError = config.stopOnError ?? true;

    for (let i = 0; i < this.subSteps.length; i++) {
      const step = this.subSteps[i];
      const stepConfig = config.stepConfigs?.[step.type] || {};

      this.logger.log(
        `Executing sub-step ${i + 1}/${this.subSteps.length}: ${step.name} (${step.type})`,
      );

      try {
        const result = await step.execute(current, stepConfig, context);

        if (!result.success) {
          const errorMsg = `Composite step failed at ${step.name} (step ${
            i + 1
          }/${this.subSteps.length}): ${result.error}`;

          if (stopOnError) {
            throw new Error(errorMsg);
          } else {
            this.logger.warn(errorMsg);
            // Continue with original input
            current = current;
          }
        } else {
          current = result.outputSegments;

          if (result.warnings && result.warnings.length > 0) {
            this.logger.warn(
              `Sub-step ${step.name} had warnings: ${result.warnings.join(', ')}`,
            );
          }
        }
      } catch (error) {
        if (stopOnError) {
          throw new Error(
            `Composite step failed at ${step.name}: ${error.message}`,
          );
        } else {
          this.logger.error(
            `Sub-step ${step.name} failed but continuing: ${error.message}`,
          );
        }
      }
    }

    this.logger.log(
      `Composite step completed: ${current.length} output segments`,
    );
    return current;
  }

  /**
   * Validate composite step configuration
   */
  async validate(config: CompositeConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate that at least one step is provided
    if (!config.steps || config.steps.length === 0) {
      errors.push('At least one step must be specified');
    }

    // Validate each sub-step
    if (config.steps) {
      for (const stepType of config.steps) {
        const step = this.subSteps.find((s) => s.type === stepType);

        if (!step) {
          errors.push(`Unknown step type: ${stepType}`);
          continue;
        }

        // Validate step's own configuration if provided
        const stepConfig = config.stepConfigs?.[stepType];
        if (stepConfig && this.isConfigurable(step)) {
          try {
            const stepValidation = await step.validate(stepConfig);
            if (!stepValidation.isValid) {
              errors.push(`${step.name}: ${stepValidation.errors.join(', ')}`);
            }
            if (stepValidation.warnings) {
              warnings.push(
                ...stepValidation.warnings.map(
                  (w: string) => `${step.name}: ${w}`,
                ),
              );
            }
          } catch (error: any) {
            warnings.push(`Could not validate ${step.name}: ${error.message}`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Rollback composite step
   */
  async rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    if (!rollbackData || !rollbackData.subStepRollbacks) {
      this.logger.warn('No rollback data available');
      return { success: false, error: 'No rollback data available' };
    }

    // Roll back steps in reverse order
    for (let i = this.subSteps.length - 1; i >= 0; i--) {
      const step = this.subSteps[i];
      const stepRollback = rollbackData.subStepRollbacks[i];

      if (stepRollback && this.isRollbackable(step)) {
        try {
          const result = await step.rollback(stepRollback, context);
          if (!result.success) {
            this.logger.error(
              `Rollback failed for ${step.name}: ${result.error}`,
            );
          }
        } catch (error: any) {
          this.logger.error(
            `Rollback error for ${step.name}: ${error.message}`,
          );
        }
      }
    }

    return { success: true };
  }

  /**
   * Check if step is configurable
   */
  private isConfigurable(step: any): step is {
    validate(config: any): Promise<ValidationResult>;
  } {
    return typeof step.validate === 'function';
  }

  /**
   * Check if step is rollbackable
   */
  private isRollbackable(step: any): step is {
    rollback(
      data: any,
      context: any,
    ): Promise<{ success: boolean; error?: string }>;
  } {
    return typeof step.rollback === 'function';
  }

  /**
   * Create rollback data for composite step (public interface)
   */
  createRollbackData(input: DocumentSegment[], config: IStepConfig): any {
    return this.createRollbackDataInternal(input, config as CompositeConfig);
  }

  /**
   * Create rollback data for composite step (internal implementation)
   */
  protected createRollbackDataInternal(
    inputSegments: DocumentSegment[],
    config: CompositeConfig,
  ): any {
    return {
      inputSegments: inputSegments.map((segment) => ({
        id: segment.id,
        content: segment.content,
        status: segment.status,
        position: segment.position,
      })),
      config,
      subStepCount: this.subSteps.length,
      timestamp: new Date(),
    };
  }

  /**
   * Get composite step metadata
   */
  getMetadata(): StepMetadata {
    const subStepNames = this.subSteps.map((s) => s.name).join(' → ');

    return {
      type: this.stepType,
      name: this.stepName,
      description: `Composite step executing: ${subStepNames}`,
      version: this.version,
      inputTypes: ['document_segments'],
      outputTypes: ['document_segments'],
      categories: ['composite', 'workflow'],
    };
  }

  /**
   * Get configuration schema for composite step
   */
  getConfigSchema(): ConfigSchema {
    return {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of steps to chain together',
        },
        stepConfigs: {
          type: 'object',
          description: 'Configuration for each sub-step',
          additionalProperties: true,
        },
        stopOnError: {
          type: 'boolean',
          description: 'Stop execution on first error or continue',
          default: true,
        },
      },
      required: ['steps'],
    };
  }
}
