import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobRegistryService } from './job-registry.service';
import { EventBusService } from '@modules/event/services/event-bus.service';

@Processor('default')
@Injectable()
export class QueueProcessorService {
  private readonly logger = new Logger(QueueProcessorService.name);

  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly eventBus: EventBusService,
  ) {}

  @Process('*')
  async handleJob(job: Job<any>): Promise<void> {
    try {
      const handler = this.jobRegistry.getJob(job.name);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.name}`);
      }

      await handler.handle({
        ...job.data,
        jobId: job.id.toString(),
      });
    } catch (error) {
      this.logger.error(
        `Error processing job ${job.id} (${job.name}):`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
