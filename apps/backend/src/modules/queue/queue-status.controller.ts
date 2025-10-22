import { Controller, Get, Post, Logger, Body } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JobResumeService } from './services/job-resume.service';

@ApiTags('Queue Status')
@Controller('queue-status')
export class QueueStatusController {
  private readonly logger = new Logger(QueueStatusController.name);

  constructor(
    @InjectQueue('default') private readonly queue: Queue,
    private readonly jobResumeService: JobResumeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get queue status and job counts' })
  @ApiResponse({
    status: 200,
    description: 'Queue status retrieved successfully',
  })
  async getQueueStatus() {
    try {
      const jobCounts = await this.queue.getJobCounts();
      const waitingJobs = await this.queue.getWaiting();
      const activeJobs = await this.queue.getActive();
      const completedJobs = await this.queue.getCompleted();
      const failedJobs = await this.queue.getFailed();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        jobCounts,
        details: {
          waiting: waitingJobs.length,
          active: activeJobs.length,
          completed: completedJobs.length,
          failed: failedJobs.length,
        },
        waitingJobs: waitingJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          createdAt: job.timestamp,
        })),
        activeJobs: activeJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          createdAt: job.timestamp,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get queue status:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('retry-failed')
  @ApiOperation({ summary: 'Retry all failed jobs' })
  @ApiResponse({ status: 200, description: 'Failed jobs retried successfully' })
  async retryFailedJobs() {
    try {
      const failedJobs = await this.queue.getFailed();
      const retriedJobs = [];

      for (const job of failedJobs) {
        await job.retry();
        retriedJobs.push({
          id: job.id,
          name: job.name,
        });
      }

      return {
        status: 'ok',
        message: `Retried ${retriedJobs.length} failed jobs`,
        retriedJobs,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to retry failed jobs:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('resume-jobs')
  @ApiOperation({
    summary:
      'Clear existing jobs and resume all unprocessed jobs for a dataset',
  })
  @ApiResponse({ status: 200, description: 'Jobs resumed successfully' })
  async resumeJobs(@Body() body: { datasetId: string }) {
    try {
      const { datasetId } = body;

      if (!datasetId) {
        return {
          status: 'error',
          message: 'datasetId is required',
          timestamp: new Date().toISOString(),
        };
      }

      // Clear all existing jobs in the queue
      await this.queue.empty();
      this.logger.log(`Cleared all existing jobs in queue`);

      // Resume jobs for the dataset
      const result =
        await this.jobResumeService.resumeJobsForDataset(datasetId);

      return {
        status: 'ok',
        message: `Resumed ${result.queuedJobs} jobs for ${result.documents.length} documents`,
        datasetId,
        queuedJobs: result.queuedJobs,
        documents: result.documents,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to resume jobs: ${error.message}`, error.stack);
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
