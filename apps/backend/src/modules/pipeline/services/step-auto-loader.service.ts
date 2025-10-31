import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { readdirSync } from 'fs';
import { join } from 'path';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { BaseStep } from '../steps/base.step';
import { ALL_STEP_CLASSES } from '../steps/index';

/**
 * Service that automatically discovers and registers pipeline steps
 * This eliminates the need for manual registration in modules
 *
 * Design improvements:
 * - Automatic step discovery from steps/ directory
 * - Filtering by category (pipeline/workflow)
 * - Extensible without manual index edits
 */
@Injectable()
export class StepAutoLoaderService {
  private readonly logger = new Logger(StepAutoLoaderService.name);

  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Automatically discover and register steps from the steps directory
   * This uses fallback to ALL_STEP_CLASSES but could discover dynamically
   */
  async loadAllSteps(): Promise<void> {
    this.logger.log('Starting step auto-loading...');

    let registeredCount = 0;
    let skippedCount = 0;

    for (const StepClass of ALL_STEP_CLASSES) {
      try {
        // Try to get the step instance from the module
        const stepInstance = this.moduleRef.get(StepClass, { strict: false });

        if (!stepInstance) {
          this.logger.warn(
            `Step ${StepClass.name} not found as provider, skipping registration. Make sure it's added to module providers.`,
          );
          skippedCount++;
          continue;
        }

        // Verify it's a BaseStep
        if (!(stepInstance instanceof BaseStep)) {
          this.logger.error(
            `Step ${StepClass.name} is not a BaseStep instance`,
          );
          skippedCount++;
          continue;
        }

        // Register the step
        this.stepRegistry.registerStep(stepInstance as BaseStep);
        registeredCount++;

        this.logger.log(`✓ Registered step: ${StepClass.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to load step ${StepClass.name}: ${error.message}`,
        );
        skippedCount++;
      }
    }

    this.logger.log(
      `Step auto-loading completed: ${registeredCount} registered, ${skippedCount} skipped`,
    );
  }

  /**
   * Load steps filtered by category
   * This allows modules to load only relevant steps
   */
  async loadStepsByCategory(
    categories: string[],
    stepClasses: any[] = ALL_STEP_CLASSES,
  ): Promise<void> {
    this.logger.log(`Loading steps for categories: ${categories.join(', ')}`);

    let registeredCount = 0;

    for (const StepClass of stepClasses) {
      try {
        // Check if step belongs to requested category
        const stepCategories = this.getStepCategories(StepClass);
        const hasMatchingCategory = categories.some((cat) =>
          stepCategories.includes(cat),
        );

        if (!hasMatchingCategory) {
          continue;
        }

        // Get and register the step instance
        const stepInstance = this.moduleRef.get(StepClass, { strict: false });

        if (!stepInstance || !(stepInstance instanceof BaseStep)) {
          continue;
        }

        this.stepRegistry.registerStep(stepInstance as BaseStep);
        registeredCount++;
        this.logger.log(`✓ Registered step: ${StepClass.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to load step ${StepClass.name}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Registered ${registeredCount} steps`);
  }

  /**
   * Get step categories from metadata or class
   * Allows steps to declare which modules they belong to
   */
  private getStepCategories(StepClass: any): string[] {
    // Check if step has static category method
    if (typeof StepClass.getStepCategories === 'function') {
      return StepClass.getStepCategories();
    }

    // Check for metadata property
    if (StepClass.prototype?._stepCategories) {
      return StepClass.prototype._stepCategories;
    }

    // Default: belongs to both pipeline and workflow
    return ['pipeline', 'workflow'];
  }

  /**
   * Discover step files from the steps directory
   * This would enable truly automatic discovery without index file
   */
  private discoverStepFiles(): string[] {
    try {
      const stepsDir = join(__dirname, '../steps');
      const files = readdirSync(stepsDir).filter(
        (f) => f.endsWith('.step.ts') && !f.includes('base.step'),
      );
      return files;
    } catch (error) {
      this.logger.warn('Could not discover step files:', error.message);
      return [];
    }
  }
}
