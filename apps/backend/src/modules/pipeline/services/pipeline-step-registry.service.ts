import { Injectable, Logger, Global } from '@nestjs/common';
import { BaseStep } from '../steps/base.step';

export interface StepMetadata {
  type: string;
  name: string;
  description: string;
  version: string;
  inputTypes: string[];
  outputTypes: string[];
  stepInstance: BaseStep;
}

@Global()
@Injectable()
export class PipelineStepRegistry {
  private readonly logger: Logger;
  private static readonly sharedSteps = (() => {
    const map = new Map<string, StepMetadata>();
    return map;
  })();
  private static instanceCount = 0;

  constructor() {
    PipelineStepRegistry.instanceCount++;
    this.logger = new Logger(
      `${PipelineStepRegistry.name}#${PipelineStepRegistry.instanceCount}`,
    );
    this.logger.log(
      `Creating PipelineStepRegistry instance #${PipelineStepRegistry.instanceCount}`,
    );
  }

  /**
   * Register a pipeline step
   */
  registerStep(stepInstance: BaseStep): void {
    const metadata = stepInstance.getMetadata();

    PipelineStepRegistry.sharedSteps.set(metadata.type, {
      type: metadata.type,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      inputTypes: metadata.inputTypes,
      outputTypes: metadata.outputTypes,
      // configSchema is now part of getMetadata() method
      stepInstance,
    });

    this.logger.log(
      `Registered pipeline step: ${metadata.type} - ${metadata.name}`,
    );
  }

  /**
   * Get a step by type
   */
  getStep(type: string): StepMetadata | undefined {
    return PipelineStepRegistry.sharedSteps.get(type);
  }

  /**
   * Get all registered steps
   */
  getAllSteps(): Omit<StepMetadata, 'stepInstance'>[] {
    return Array.from(PipelineStepRegistry.sharedSteps.values()).map((step) => {
      const metadata = step.stepInstance.getMetadata();
      return {
        type: metadata.type,
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        inputTypes: metadata.inputTypes,
        outputTypes: metadata.outputTypes,
        configSchema: metadata.configSchema,
      };
    });
  }

  /**
   * Get step types
   */
  getStepTypes(): string[] {
    return Array.from(PipelineStepRegistry.sharedSteps.keys());
  }

  /**
   * Create a step instance
   */
  createStepInstance(type: string): BaseStep | null {
    const stepMetadata = this.getStep(type);
    if (!stepMetadata) {
      this.logger.error(`Step type not found: ${type}`);
      return null;
    }

    try {
      return stepMetadata.stepInstance;
    } catch (error) {
      this.logger.error(
        `Failed to create step instance for type ${type}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Validate step configuration
   */
  async validateStepConfig(
    type: string,
    config: any,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const stepInstance = this.createStepInstance(type);
    if (!stepInstance) {
      return { isValid: false, errors: [`Step type ${type} not found`] };
    }

    try {
      return await stepInstance.validate(config);
    } catch (error) {
      this.logger.error(`Error validating step config for ${type}:`, error);
      return { isValid: false, errors: [error.message] };
    }
  }

  /**
   * Check if step type is registered
   */
  hasStep(type: string): boolean {
    return PipelineStepRegistry.sharedSteps.has(type);
  }

  /**
   * Get steps by category or tags
   */
  getStepsByCategory(category: string): Omit<StepMetadata, 'stepInstance'>[] {
    return this.getAllSteps().filter(
      (step) =>
        step.name.toLowerCase().includes(category.toLowerCase()) ||
        step.description.toLowerCase().includes(category.toLowerCase()),
    );
  }

  /**
   * Get step configuration schema
   */
  getStepConfigSchema(type: string): Record<string, any> | null {
    const stepMetadata = this.getStep(type);
    return stepMetadata?.stepInstance.getConfigSchema() || null;
  }
}
