import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Type } from '@nestjs/common';
import {
  IStep,
  IStepFactory,
  IStepConfig,
  ValidationResult,
} from '../interfaces/step.interfaces';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { StepMetadata } from '../interfaces/step.interfaces';

/**
 * Factory service for creating step instances
 * Provides controlled creation with validation support
 */
@Injectable()
export class StepFactory implements IStepFactory {
  private readonly logger = new Logger(StepFactory.name);

  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Create a step instance by type
   */
  create(type: string): IStep {
    const metadata = this.stepRegistry.getStep(type);
    if (!metadata) {
      throw new Error(`Step type not found: ${type}`);
    }

    const StepClass = this.getStepClass(type);
    const instance = this.moduleRef.get(StepClass, { strict: false });

    if (!instance) {
      throw new Error(`Step instance not found for type: ${type}`);
    }

    return instance as IStep;
  }

  /**
   * Create multiple steps by types
   */
  createMultiple(types: string[]): IStep[] {
    return types.map((type) => this.create(type));
  }

  /**
   * Create a step and validate its configuration
   */
  async createAndValidate(type: string, config: IStepConfig): Promise<IStep> {
    const step = this.create(type);

    // Check if step is configurable
    if (this.isConfigurable(step)) {
      const validation = await step.validate(config);

      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration for ${type}: ${validation.errors.join(', ')}`,
        );
      }

      if (validation.warnings && validation.warnings.length > 0) {
        this.logger.warn(
          `Configuration warnings for ${type}: ${validation.warnings.join(', ')}`,
        );
      }
    }

    this.logger.log(`Created and validated step: ${type}`);
    return step;
  }

  /**
   * Check if a step type exists
   */
  hasStepType(type: string): boolean {
    return this.stepRegistry.hasStep(type);
  }

  /**
   * Get metadata for a step type
   */
  getMetadata(type: string): StepMetadata | null {
    const step = this.stepRegistry.getStep(type);
    if (!step) return null;

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
  }

  /**
   * Get all available step types
   */
  getAvailableStepTypes(): string[] {
    return this.stepRegistry.getStepTypes();
  }

  /**
   * Get the step class constructor for a given type
   */
  private getStepClass(type: string): Type<any> {
    // Get from registry - it stores the step instance class
    const metadata = this.stepRegistry.getStep(type);
    if (!metadata) {
      throw new Error(`Unknown step type: ${type}`);
    }

    // Get the constructor from the instance
    return metadata.stepInstance.constructor as Type<any>;
  }

  /**
   * Check if step implements IConfigurable interface
   */
  private isConfigurable(step: any): step is {
    validate(config: any): Promise<ValidationResult>;
  } {
    return typeof step.validate === 'function';
  }
}
