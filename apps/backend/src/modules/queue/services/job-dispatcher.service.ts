import { Injectable } from '@nestjs/common';
import { QueueManagerService } from './queue-manager.service';
import { JobOptions } from 'bull';

@Injectable()
export class JobDispatcherService {
  constructor(private readonly queueManager: QueueManagerService) {}

  async dispatch<T>(
    type: string,
    data: T,
    options?: JobOptions,
  ): Promise<void> {
    await this.queueManager.addJob({
      type,
      data,
      options,
    });
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
