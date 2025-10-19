import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JobRegistryService } from './services/job-registry.service';
import { QueueManagerService } from './services/queue-manager.service';
import { QueueCleanupService } from './services/queue-cleanup.service';

@ApiTags('Queue')
@Controller('api/queue')
export class QueueController {
  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly queueManager: QueueManagerService,
    private readonly queueCleanup: QueueCleanupService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get queue status and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Queue status retrieved successfully',
  })
  async getQueueStatus() {
    try {
      const stats = await this.queueManager.getQueueStats();
      return { success: true, data: stats };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get registered jobs' })
  @ApiResponse({
    status: 200,
    description: 'Registered jobs retrieved successfully',
  })
  async getRegisteredJobs() {
    try {
      const jobs = this.jobRegistry.getAllJobs();
      return {
        success: true,
        data: jobs.map((job) => ({
          jobType: job.jobType,
          name: job.constructor.name,
        })),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up completed and failed jobs' })
  @ApiResponse({
    status: 200,
    description: 'Queue cleanup completed successfully',
  })
  async cleanupQueue() {
    try {
      const result = await this.queueCleanup.manualCleanup();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get recent queue logs' })
  @ApiResponse({
    status: 200,
    description: 'Queue logs retrieved successfully',
  })
  async getQueueLogs() {
    try {
      // This would typically involve reading from a logging service or database
      // For now, return a placeholder or actual logs if available
      return { success: true, data: [] };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
