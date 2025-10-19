import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { GraphNode } from '../../../graph/entities/graph-node.entity';
import { GraphEdge } from '../../../graph/entities/graph-edge.entity';
import { Prompt } from '../../../prompts/entities/prompt.entity';
import { AiProvider } from '../../../ai-provider/entities/ai-provider.entity';
import { User } from '../../../user/user.entity';
import { Dataset } from '../../../dataset/entities/dataset.entity';
import { Embedding } from '../../../dataset/entities/embedding.entity';
import { ChatConversation } from '../../../chat/entities/chat-conversation.entity';
import { ChatMessage } from '../../../chat/entities/chat-message.entity';
import { GraphExtractionJob } from './graph-extraction.job';
import { GraphExtractionService } from '../../../graph/services/graph-extraction.service';
import { AiProviderService } from '../../../ai-provider/services/ai-provider.service';
import { PromptService } from '../../../prompts/services/prompt.service';
import { LLMClientFactory } from '../../../ai-provider/services/llm-client-factory.service';
import { NotificationService } from '../../../notification/notification.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { JobRegistryService } from '../../services/job-registry.service';
import { QueueManagerService } from '../../services/queue-manager.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentSegment,
      GraphNode,
      GraphEdge,
      Prompt,
      AiProvider,
      User,
      Dataset,
      Embedding,
      ChatConversation,
      ChatMessage,
    ]),
    CacheModule.register(),
    HttpModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  providers: [
    GraphExtractionJob,
    GraphExtractionService,
    AiProviderService,
    PromptService,
    LLMClientFactory,
    NotificationService,
    EventBusService,
    JobDispatcherService,
    QueueManagerService,
  ],
  exports: [GraphExtractionJob],
})
export class GraphJobsModule {
  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly graphExtractionJob: GraphExtractionJob,
  ) {
    console.log('GraphJobsModule constructor called');
    console.log('GraphExtractionJob jobType:', this.graphExtractionJob.jobType);

    // Register the job with the registry
    this.jobRegistry.register(this.graphExtractionJob);
    console.log('GraphExtractionJob registered with job registry');
    console.log('Total registered jobs:', this.jobRegistry.getAllJobs().length);
  }
}
