import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobRegistryService } from './job-registry.service';
import { CPUThrottlingService } from '../../../common/services/cpu-throttling.service';

@Processor('default')
@Injectable()
export class QueueProcessorService {
  private readonly logger = new Logger(QueueProcessorService.name);
  private readonly concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '3');

  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly cpuThrottling: CPUThrottlingService,
  ) {
    this.logger.log(
      `[QUEUE_PROCESSOR] Initialized with concurrency: ${this.concurrency}`,
    );
  }

  @Process({ name: '*', concurrency: 3 })
  async handleJob(job: Job<any>): Promise<void> {
    const startTime = Date.now();

    // Check if we can process this job without blocking HTTP requests
    if (!this.cpuThrottling.reserveForJob()) {
      this.logger.warn(
        `[QUEUE] Job ${job.id} (${job.name}) delayed due to CPU throttling - HTTP requests have priority`,
      );
      // Delay the job for a short time to allow HTTP requests to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new Error('Job delayed due to CPU throttling');
    }

    this.logger.log(
      `[QUEUE] Processing job ${job.id} of type: ${job.name} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      // Debug: Log all registered jobs
      const allJobs = this.jobRegistry.getAllJobs();
      this.logger.debug(
        `[QUEUE] Available jobs: ${allJobs.map((j) => j.jobType || j.name).join(', ')}`,
      );

      const handler = this.jobRegistry.getJob(job.name);
      if (!handler) {
        this.logger.error(`No handler registered for job type: ${job.name}`);
        this.logger.error(
          `Available job types: ${allJobs.map((j) => j.jobType || j.name).join(', ')}`,
        );
        throw new Error(`No handler registered for job type: ${job.name}`);
      }

      this.logger.log(
        `[QUEUE] Found handler for job ${job.name}, processing...`,
      );

      // Process the job
      await handler.handle({
        ...job.data,
        jobId: job.id.toString(),
      });

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `[QUEUE] Successfully processed job ${job.id} in ${processingTime}ms`,
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Error processing job ${job.id} (${job.name}) after ${processingTime}ms:`,
        error instanceof Error ? error.message : String(error),
      );

      throw error;
    } finally {
      // Always release CPU reservation
      this.cpuThrottling.releaseJob();
    }
  }
}
