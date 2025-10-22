import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { JobDispatcherService } from './services/job-dispatcher.service';
import { QueueManagerService } from './services/queue-manager.service';
import { QueueProcessorService } from './services/queue-processor.service';
import { QueueCleanupService } from './services/queue-cleanup.service';
import { EventBusService } from '../event/services/event-bus.service';
import { CPUThrottlingService } from '../../common/services/cpu-throttling.service';
import { QueueStatusController } from './queue-status.controller';
import { JobResumeService } from './services/job-resume.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../dataset/entities/document.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxLoadingTimeout: 10000,
        },
        defaultJobOptions: {
          removeOnComplete: configService.get('QUEUE_REMOVE_ON_COMPLETE', 500), // Keep more completed jobs
          removeOnFail: configService.get('QUEUE_REMOVE_ON_FAIL', 100), // Keep more failed jobs
          attempts: configService.get('QUEUE_MAX_ATTEMPTS', 3), // Retry failed jobs up to N times
          backoff: {
            type: 'exponential',
            delay: configService.get('QUEUE_BACKOFF_DELAY', 2000),
          },
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'default',
    }),
    JobsModule,
    TypeOrmModule.forFeature([Document, DocumentSegment]),
  ],
  providers: [
    JobDispatcherService,
    QueueManagerService,
    QueueProcessorService,
    QueueCleanupService,
    EventBusService,
    CPUThrottlingService,
    JobResumeService,
  ],
  controllers: [QueueStatusController],
  exports: [
    JobDispatcherService,
    QueueManagerService,
    QueueCleanupService,
    EventBusService,
    CPUThrottlingService,
  ],
})
export class QueueCoreModule {}
