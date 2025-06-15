import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '@modules/event/services/event-bus.service';
import { EventTypes } from '@modules/event/constants/event-types';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { JobOptions } from 'bull';

@Injectable()
export abstract class BaseJob<T = Record<string, unknown>> {
  protected readonly logger = new Logger(this.constructor.name);
  protected static readonly jobType: string;
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
   * Get the job type
   */
  get jobType(): string {
    return (this.constructor as typeof BaseJob).jobType;
  }

  /**
   * Dispatch the job to the queue
   */
  static dispatch<T>(data: T): JobDispatcher<T> {
    if (!this.jobDispatcher) {
      throw new Error(
        'JobDispatcher not initialized. Make sure the job is properly registered in the module.',
      );
    }
    return new JobDispatcher<T>(this.jobType, data, this.jobDispatcher);
  }

  /**
   * Process the job
   */
  abstract process(data: T): Promise<void>;

  /**
   * Handle the job
   */
  async handle(data: T & { jobId: string }): Promise<void> {
    try {
      await this.process(data);
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
    await this.jobDispatcher.dispatch(this.jobType, this.data, this.options);
  }
}
