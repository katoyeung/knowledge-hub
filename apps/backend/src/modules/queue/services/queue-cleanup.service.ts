import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QueueCleanupService {
  private readonly logger = new Logger(QueueCleanupService.name);

  constructor(@InjectQueue('default') private readonly queue: Queue) {}

  /**
   * Clean up old jobs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldJobs(): Promise<void> {
    this.logger.log('Starting scheduled queue cleanup...');

    try {
      // Clean up completed jobs older than 24 hours
      const completedCount = await this.queue.clean(
        24 * 60 * 60 * 1000,
        'completed',
      );
      this.logger.log(
        `Cleaned up ${completedCount} completed jobs older than 24 hours`,
      );

      // Clean up failed jobs older than 7 days
      const failedCount = await this.queue.clean(
        7 * 24 * 60 * 60 * 1000,
        'failed',
      );
      this.logger.log(
        `Cleaned up ${failedCount} failed jobs older than 7 days`,
      );

      // Clean up stalled jobs older than 1 hour
      const stalledCount = await this.queue.clean(60 * 60 * 1000, 'active');
      this.logger.log(
        `Cleaned up ${stalledCount} stalled jobs older than 1 hour`,
      );

      this.logger.log('Queue cleanup completed successfully');
    } catch (error) {
      this.logger.error('Error during queue cleanup:', error);
    }
  }

  /**
   * Manual cleanup method for immediate cleanup
   */
  async manualCleanup(): Promise<{
    completed: number;
    failed: number;
    stalled: number;
  }> {
    this.logger.log('Starting manual queue cleanup...');

    try {
      const completed = await this.queue.clean(0, 'completed'); // Remove all completed
      const failed = await this.queue.clean(0, 'failed'); // Remove all failed
      const active = await this.queue.clean(0, 'active'); // Remove all active (stalled)

      const completedCount = Array.isArray(completed)
        ? completed.length
        : completed || 0;
      const failedCount = Array.isArray(failed) ? failed.length : failed || 0;
      const activeCount = Array.isArray(active) ? active.length : active || 0;

      this.logger.log(
        `Manual cleanup completed: ${completedCount} completed, ${failedCount} failed, ${activeCount} active jobs removed`,
      );

      return {
        completed: completedCount,
        failed: failedCount,
        stalled: activeCount,
      };
    } catch (error) {
      this.logger.error('Error during manual cleanup:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
      this.queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }
}
