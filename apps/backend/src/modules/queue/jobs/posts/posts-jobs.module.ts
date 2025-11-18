import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Post } from '../../../posts/entities/post.entity';
import { PostApprovalJob } from './post-approval.job';
import { LLMProcessingJobsModule } from '../llm-processing/llm-processing-jobs.module';
import { EventModule } from '../../../event/event.module';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post]),
    BullModule.registerQueue({
      name: 'default',
    }),
    LLMProcessingJobsModule,
    EventModule,
  ],
  providers: [
    PostApprovalJob,
    EventBusService,
    JobDispatcherService,
    QueueManagerService,
  ],
  exports: [PostApprovalJob],
})
export class PostsJobsModule {
  // Jobs are now auto-registered via JobAutoLoaderService in JobsModule
  // No need to manually register jobs here
}
