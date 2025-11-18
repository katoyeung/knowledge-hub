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
import { GraphEntity } from '../../../graph/entities/graph-entity.entity';
import { EntityAlias } from '../../../graph/entities/entity-alias.entity';
import { EntityNormalizationLog } from '../../../graph/entities/entity-normalization-log.entity';
import { GraphExtractionJob } from './graph-extraction.job';
import { EntityLearningJob } from './entity-learning.job';
import { EntityNormalizationJob } from './entity-normalization.job';
import { GraphExtractionService } from '../../../graph/services/graph-extraction.service';
import { GraphPromptSelectorService } from '../../../graph/services/graph-prompt-selector.service';
import { HybridExtractionService } from '../../../graph/services/hybrid-extraction.service';
import { EntityNormalizationService } from '../../../graph/services/entity-normalization.service';
import { EntityLearningService } from '../../../graph/services/entity-learning.service';
import { EntityDictionaryService } from '../../../graph/services/entity-dictionary.service';
import { AiProviderService } from '../../../ai-provider/services/ai-provider.service';
import { PromptService } from '../../../prompts/services/prompt.service';
import { LLMClientFactory } from '../../../ai-provider/services/llm-client-factory.service';
import { NotificationService } from '../../../notification/notification.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';
import { LLMExtractionService } from '@common/services/llm-extraction.service';

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
      GraphEntity,
      EntityAlias,
      EntityNormalizationLog,
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
    EntityLearningJob,
    EntityNormalizationJob,
    GraphExtractionService,
    GraphPromptSelectorService,
    HybridExtractionService,
    EntityNormalizationService,
    EntityLearningService,
    EntityDictionaryService,
    AiProviderService,
    PromptService,
    LLMClientFactory,
    LLMExtractionService,
    NotificationService,
    EventBusService,
    JobDispatcherService,
    QueueManagerService,
  ],
  exports: [GraphExtractionJob, EntityLearningJob, EntityNormalizationJob],
})
export class GraphJobsModule {
  // Jobs are now auto-registered via JobAutoLoaderService in JobsModule
  // No need to manually register jobs here
}
