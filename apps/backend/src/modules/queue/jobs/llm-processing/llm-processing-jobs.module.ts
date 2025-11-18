import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../../posts/entities/post.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { GenericLLMProcessingJob } from './generic-llm-processing.job';
import { PostContentExtractionStrategy } from './strategies/post-content-extraction-strategy';
import { SegmentContentExtractionStrategy } from './strategies/segment-content-extraction-strategy';
import { PostResultApplicationStrategy } from './strategies/post-result-application-strategy';
import { SegmentResultApplicationStrategy } from './strategies/segment-result-application-strategy';
import { PostProcessingPolicy } from './policies/post-processing-policy';
import { SegmentProcessingPolicy } from './policies/segment-processing-policy';
import { ProcessingPolicyFactory } from './factories/processing-policy-factory';
import { FieldMappingService } from './services/field-mapping.service';
import { PromptsModule } from '../../../prompts/prompts.module';
import { AiProviderModule } from '../../../ai-provider/ai-provider.module';
import { LLMExtractionService } from '@common/services/llm-extraction.service';
import { EventModule } from '../../../event/event.module';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';
import { NotificationModule } from '../../../notification/notification.module';
import { BullModule } from '@nestjs/bull';

/**
 * Module for LLM Processing Jobs
 * Registers all strategies, policies, factories, and the generic job
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Post, DocumentSegment]),
    PromptsModule,
    AiProviderModule,
    EventModule,
    NotificationModule,
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  providers: [
    // Services
    FieldMappingService,
    LLMExtractionService,
    EventBusService,
    JobDispatcherService,
    QueueManagerService,
    // Strategies
    PostContentExtractionStrategy,
    SegmentContentExtractionStrategy,
    PostResultApplicationStrategy,
    SegmentResultApplicationStrategy,
    // Policies
    PostProcessingPolicy,
    SegmentProcessingPolicy,
    // Factory
    ProcessingPolicyFactory,
    // Job
    GenericLLMProcessingJob,
  ],
  exports: [
    GenericLLMProcessingJob,
    ProcessingPolicyFactory,
    FieldMappingService,
  ],
})
export class LLMProcessingJobsModule {}
