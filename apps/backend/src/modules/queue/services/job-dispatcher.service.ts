import { Injectable, Logger } from '@nestjs/common';
import { QueueManagerService } from './queue-manager.service';
import { JobOptions } from 'bull';

@Injectable()
export class JobDispatcherService {
  private readonly logger = new Logger(JobDispatcherService.name);

  constructor(private readonly queueManager: QueueManagerService) {}

  async dispatch<T>(
    type: string,
    data: T,
    options?: JobOptions,
  ): Promise<void> {
    this.logger.log(`[JOB_DISPATCHER] Dispatching job of type: ${type}`);
    try {
      await this.queueManager.addJob({
        type,
        data,
        options,
      });
      this.logger.log(
        `[JOB_DISPATCHER] Successfully dispatched job of type: ${type}`,
      );
    } catch (error) {
      this.logger.error(
        `[JOB_DISPATCHER] Failed to dispatch job of type: ${type}`,
        error,
      );
      throw error;
    }
  }

  async dispatchWithRetry<T>(
    type: string,
    data: T,
    attempts: number = 3,
    delay: number = 1000,
  ): Promise<void> {
    await this.dispatch(type, data, {
      attempts,
      backoff: {
        type: 'exponential',
        delay,
      },
    });
  }
}
