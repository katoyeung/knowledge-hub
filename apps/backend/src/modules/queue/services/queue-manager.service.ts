import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { EventBusService } from '@modules/event/services/event-bus.service';

export interface QueueJob {
  type: string;
  data: any;
  options?: any;
}

export interface JobDetails {
  id: string;
  type: string;
  data: any;
  status: string;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
  attemptsMade: number;
  attemptsLimit: number;
}

@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);

  constructor(
    @InjectQueue('default') private readonly queue: Queue,
    private readonly eventBus: EventBusService,
  ) {}

  async addJob(job: QueueJob): Promise<string> {
    this.logger.log(`[QUEUE_MANAGER] Adding job to queue: ${job.type}`);
    this.logger.log(`[QUEUE_MANAGER] Job data: ${JSON.stringify(job.data)}`);
    this.logger.log(
      `[QUEUE_MANAGER] Job options: ${JSON.stringify(job.options || {})}`,
    );
    try {
      const result = await this.queue.add(job.type, job.data, job.options);
      this.logger.log(
        `[QUEUE_MANAGER] Successfully added job to queue: ${job.type}, job ID: ${result.id}`,
      );
      this.logger.log(
        `[QUEUE_MANAGER] Job ${result.id} is now in queue and will be processed by QueueProcessorService`,
      );
      return result.id.toString();
    } catch (error) {
      this.logger.error(
        `[QUEUE_MANAGER] Failed to add job to queue: ${job.type}`,
        error,
      );
      throw error;
    }
  }

  async pauseJob(jobId: string): Promise<void> {
    this.logger.log(`[QUEUE_MANAGER] Pausing job: ${jobId}`);
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.moveToFailed({ message: 'Job paused by user' }, true);
      this.logger.log(`[QUEUE_MANAGER] Successfully paused job: ${jobId}`);
    } catch (error) {
      this.logger.error(`Failed to pause job ${jobId}:`, error);
      throw error;
    }
  }

  async retryJob(jobId: string): Promise<void> {
    this.logger.log(`[QUEUE_MANAGER] Retrying job: ${jobId}`);
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.retry();
      this.logger.log(`[QUEUE_MANAGER] Successfully retried job: ${jobId}`);
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId}:`, error);
      throw error;
    }
  }

  async getJobDetails(jobId: string): Promise<JobDetails | null> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return null;
      }

      return {
        id: job.id.toString(),
        type: job.name,
        data: job.data,
        status: await job.getState(),
        progress: job.progress(),
        createdAt: new Date(job.timestamp),
        startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        attemptsLimit: job.opts.attempts || 1,
      };
    } catch (error) {
      this.logger.error(`Failed to get job details for ${jobId}:`, error);
      throw error;
    }
  }

  async getJobsByDocument(documentId: string): Promise<JobDetails[]> {
    try {
      const jobs = await this.queue.getJobs([
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      ]);
      const documentJobs = jobs.filter(
        (job) =>
          job.data &&
          (job.data.documentId === documentId ||
            (job.data.data && job.data.data.documentId === documentId)),
      );

      return Promise.all(
        documentJobs.map(async (job) => ({
          id: job.id.toString(),
          type: job.name,
          data: job.data,
          status: await job.getState(),
          progress: job.progress(),
          createdAt: new Date(job.timestamp),
          startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
          completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          attemptsLimit: job.opts.attempts || 1,
        })),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get jobs for document ${documentId}:`,
        error,
      );
      throw error;
    }
  }

  async cancelJobsByDocument(documentId: string): Promise<number> {
    this.logger.log(
      `[QUEUE_MANAGER] Cancelling all jobs for document: ${documentId}`,
    );
    try {
      const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed']);
      const documentJobs = jobs.filter(
        (job) =>
          job.data &&
          (job.data.documentId === documentId ||
            (job.data.data && job.data.data.documentId === documentId)),
      );

      let cancelledCount = 0;
      for (const job of documentJobs) {
        try {
          await job.remove();
          cancelledCount++;
        } catch (error) {
          this.logger.warn(`Failed to cancel job ${job.id}:`, error);
        }
      }

      this.logger.log(
        `[QUEUE_MANAGER] Cancelled ${cancelledCount} jobs for document ${documentId}`,
      );
      return cancelledCount;
    } catch (error) {
      this.logger.error(
        `Failed to cancel jobs for document ${documentId}:`,
        error,
      );
      throw error;
    }
  }

  async getQueueStats(): Promise<{
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        total:
          waiting.length +
          active.length +
          completed.length +
          failed.length +
          delayed.length,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }
}
