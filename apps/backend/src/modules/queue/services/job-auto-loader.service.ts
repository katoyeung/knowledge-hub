import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JobRegistryService } from './job-registry.service';
import { BaseJob } from '../jobs/base/base.job';
import {
  getJobType,
  isRegisteredJob,
} from '../decorators/register-job.decorator';
import { ALL_JOB_CLASSES } from '../jobs/index';

/**
 * Service that automatically discovers and registers jobs
 * This eliminates the need for manual registration in modules
 *
 * Design improvements:
 * - Automatic job discovery from jobs/ directory
 * - Uses @RegisterJob decorator for metadata
 * - Extensible without manual module edits
 * - Supports dynamic job type resolution
 */
@Injectable()
export class JobAutoLoaderService {
  private readonly logger = new Logger(JobAutoLoaderService.name);

  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Automatically discover and register all jobs
   * This uses ALL_JOB_CLASSES but could discover dynamically
   */
  async loadAllJobs(): Promise<void> {
    this.logger.log('🚀 Starting job auto-loading...');

    let registeredCount = 0;
    let skippedCount = 0;
    const registeredJobs: string[] = [];

    for (const JobClass of ALL_JOB_CLASSES) {
      try {
        // Check if job is marked for registration
        if (!isRegisteredJob(JobClass)) {
          this.logger.debug(
            `Job ${JobClass.name} is not marked with @RegisterJob decorator, skipping`,
          );
          skippedCount++;
          continue;
        }

        // Try to get the job instance from the module
        const jobInstance = this.moduleRef.get(JobClass, { strict: false });

        if (!jobInstance) {
          this.logger.warn(
            `Job ${JobClass.name} not found as provider, skipping registration. Make sure it's added to module providers.`,
          );
          skippedCount++;
          continue;
        }

        // Verify it's a BaseJob (or has handle method)
        const hasHandleMethod =
          typeof (jobInstance as any).handle === 'function';
        if (!(jobInstance instanceof BaseJob) && !hasHandleMethod) {
          this.logger.warn(
            `Job ${JobClass.name} does not extend BaseJob or implement handle method`,
          );
          skippedCount++;
          continue;
        }

        // Get job type from decorator or class
        const jobType = getJobType(JobClass);

        // Ensure job instance has jobType property
        if (!jobInstance.jobType) {
          (jobInstance as any).jobType = jobType;
        }

        // Register the job
        this.jobRegistry.register(jobInstance);
        registeredCount++;
        registeredJobs.push(jobType);

        this.logger.log(
          `✓ Registered job: ${JobClass.name} (type: ${jobType})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to load job ${JobClass.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
        skippedCount++;
      }
    }

    this.logger.log(
      `✅ Job auto-loading completed: ${registeredCount} registered, ${skippedCount} skipped`,
    );

    if (registeredJobs.length > 0) {
      this.logger.log(`Registered job types: ${registeredJobs.join(', ')}`);
    }
  }

  /**
   * Load jobs filtered by module/category
   * This allows modules to load only relevant jobs
   */
  async loadJobsByCategory(
    categories: string[],
    jobClasses: any[] = ALL_JOB_CLASSES,
  ): Promise<void> {
    this.logger.log(`Loading jobs for categories: ${categories.join(', ')}`);

    let registeredCount = 0;

    for (const JobClass of jobClasses) {
      try {
        if (!isRegisteredJob(JobClass)) {
          continue;
        }

        // Check if job belongs to requested category
        const jobCategories = this.getJobCategories(JobClass);
        const hasMatchingCategory = categories.some((cat) =>
          jobCategories.includes(cat),
        );

        if (!hasMatchingCategory) {
          continue;
        }

        // Get and register the job instance
        const jobInstance = this.moduleRef.get(JobClass, { strict: false });

        if (!jobInstance) {
          continue;
        }

        const hasHandleMethod = typeof jobInstance.handle === 'function';
        if (!(jobInstance instanceof BaseJob) && !hasHandleMethod) {
          continue;
        }

        const jobType = getJobType(JobClass);
        if (!jobInstance.jobType) {
          jobInstance.jobType = jobType;
        }

        this.jobRegistry.register(jobInstance);
        registeredCount++;
        this.logger.log(
          `✓ Registered job: ${JobClass.name} (type: ${jobType})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to load job ${JobClass.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(`Registered ${registeredCount} jobs`);
  }

  /**
   * Get job categories from metadata or class
   * Allows jobs to declare which modules they belong to
   */
  private getJobCategories(JobClass: any): string[] {
    // Check if job has static category method
    if (typeof JobClass.getJobCategories === 'function') {
      return JobClass.getJobCategories();
    }

    // Check for metadata property
    const metadata = Reflect.getMetadata('job:options', JobClass);
    if (metadata?.categories) {
      return metadata.categories;
    }

    // Default: infer from class name or path
    const className = JobClass.name.toLowerCase();
    if (className.includes('graph')) return ['graph'];
    if (className.includes('document')) return ['document'];
    if (className.includes('pipeline')) return ['pipeline'];
    if (className.includes('workflow')) return ['workflow'];

    return ['default'];
  }
}
