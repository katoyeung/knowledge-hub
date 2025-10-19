import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueCoreModule } from './queue-core.module';
import { QueueController } from './queue.controller';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
        defaultJobOptions: {
          removeOnComplete: configService.get('QUEUE_REMOVE_ON_COMPLETE', 10), // Keep only N completed jobs
          removeOnFail: configService.get('QUEUE_REMOVE_ON_FAIL', 5), // Keep only N failed jobs
          attempts: configService.get('QUEUE_MAX_ATTEMPTS', 3), // Retry failed jobs up to N times
          backoff: {
            type: 'exponential',
            delay: configService.get('QUEUE_BACKOFF_DELAY', 2000),
          },
        },
      }),
    }),
    QueueCoreModule,
  ],
  controllers: [QueueController],
})
export class QueueModule {}
