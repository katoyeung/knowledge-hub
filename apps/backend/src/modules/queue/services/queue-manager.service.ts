import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventBusService } from '@modules/event/services/event-bus.service';

export interface QueueJob {
  type: string;
  data: any;
  options?: any;
}

@Injectable()
export class QueueManagerService {
  constructor(
    @InjectQueue('default') private readonly queue: Queue,
    private readonly eventBus: EventBusService,
  ) {}

  async addJob(job: QueueJob): Promise<void> {
    try {
      await this.queue.add(job.type, job.data, job.options);
    } catch (error) {
      console.error('Failed to add job to queue:', error);
      throw error;
    }
  }
}
