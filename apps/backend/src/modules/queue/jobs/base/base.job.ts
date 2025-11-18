import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '@modules/event/services/event-bus.service';
import { EventTypes } from '@modules/event/constants/event-types';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { JobOptions } from 'bull';
import { getJobType } from '../../decorators/register-job.decorator';

@Injectable()
export abstract class BaseJob<T = Record<string, unknown>> {
  protected readonly logger = new Logger(this.constructor.name);
  protected static readonly jobType?: string;
  private static jobDispatcher: JobDispatcherService;

  constructor(
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    // Set the static jobDispatcher if not set
    if (!BaseJob.jobDispatcher) {
      BaseJob.jobDispatcher = jobDispatcher;
    }
  }

  /**
   * Get the job type dynamically from decorator or static property
   */
  get jobType(): string {
    // Try to get from decorator metadata first
    const decoratorType = getJobType(this.constructor as any);
    if (decoratorType) {
      return decoratorType;
    }

    // Fallback to static property
    const staticType = (this.constructor as typeof BaseJob).jobType;
    if (staticType) {
      return staticType;
    }

    // Final fallback: derive from class name
    const className = this.constructor.name;
    return className
      .replace(/Job$/, '')
      .toLowerCase()
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
  }

  /**
   * Dispatch the job to the queue
   */
  static dispatch<T>(data: T): JobDispatcher<T> {
    const logger = new Logger('BaseJob');
    logger.log(`[BASE_JOB] Static dispatch called for ${this.name}`);

    if (!this.jobDispatcher) {
      logger.error(`[BASE_JOB] JobDispatcher not initialized for ${this.name}`);
      throw new Error(
        'JobDispatcher not initialized. Make sure the job is properly registered in the module.',
      );
    }
    logger.log(`[BASE_JOB] JobDispatcher is initialized for ${this.name}`);

    // Get job type dynamically from decorator or static property
    const jobType = getJobType(this as any) || this.jobType;
    if (!jobType) {
      logger.error(`[BASE_JOB] Job type not defined for ${this.name}`);
      throw new Error(
        `Job type not defined for ${this.name}. Make sure to use @RegisterJob decorator or define static jobType.`,
      );
    }
    logger.log(`[BASE_JOB] Job type resolved: ${jobType} for ${this.name}`);
    logger.log(`[BASE_JOB] Job data: ${JSON.stringify(data)}`);

    return new JobDispatcher<T>(jobType, data, this.jobDispatcher);
  }

  /**
   * Process the job
   */
  abstract process(data: T): Promise<void>;

  /**
   * Handle the job
   */
  async handle(data: T & { jobId: string }): Promise<void> {
    this.logger.log(
      `[${this.constructor.name}] ========== HANDLING JOB ==========`,
    );
    this.logger.log(`[${this.constructor.name}] Job ID: ${data.jobId}`);
    this.logger.log(`[${this.constructor.name}] Job type: ${this.jobType}`);
    this.logger.log(
      `[${this.constructor.name}] Job data: ${JSON.stringify(data, null, 2)}`,
    );
    try {
      this.logger.log(`[${this.constructor.name}] Calling process() method...`);
      await this.process(data);
      this.logger.log(
        `[${this.constructor.name}] ✅ Job process() completed successfully`,
      );
      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        this.eventBus.publish({
          type: EventTypes.QUEUE_JOB_COMPLETED,
          timestamp: Date.now(),
          payload: {
            jobId: data.jobId,
            jobType: this.jobType,
            data,
          },
        });
      } else {
        this.logger.warn('EventBus not properly initialized');
      }
    } catch (error) {
      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        this.eventBus.publish({
          type: EventTypes.QUEUE_JOB_FAILED,
          timestamp: Date.now(),
          payload: {
            jobId: data.jobId,
            jobType: this.jobType,
            data,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } else {
        this.logger.warn('EventBus not properly initialized');
      }
      throw error;
    }
  }
}

/**
 * Job dispatcher class to handle job dispatching
 */
export class JobDispatcher<T> {
  private options: JobOptions = {};

  constructor(
    private readonly jobType: string,
    private readonly data: T,
    private readonly jobDispatcher: JobDispatcherService,
  ) {}

  withOptions(options: JobOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Dispatch the job to the queue
   */
  async dispatch(): Promise<void> {
    const logger = new Logger('JobDispatcher');
    logger.log(`[JOB_DISPATCHER_CLASS] Dispatching job type: ${this.jobType}`);
    logger.log(`[JOB_DISPATCHER_CLASS] Job data: ${JSON.stringify(this.data)}`);
    logger.log(
      `[JOB_DISPATCHER_CLASS] Job options: ${JSON.stringify(this.options)}`,
    );

    try {
      await this.jobDispatcher.dispatch(this.jobType, this.data, this.options);
      logger.log(
        `[JOB_DISPATCHER_CLASS] Successfully dispatched job type: ${this.jobType}`,
      );
    } catch (error) {
      logger.error(
        `[JOB_DISPATCHER_CLASS] Failed to dispatch job type: ${this.jobType}`,
        error,
      );
      throw error;
    }
  }
}
