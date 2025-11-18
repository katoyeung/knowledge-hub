import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { GraphNode } from './entities/graph-node.entity';
import { GraphEdge } from './entities/graph-edge.entity';
import { GraphEntity } from './entities/graph-entity.entity';
import { EntityAlias } from './entities/entity-alias.entity';
import { EntityNormalizationLog } from './entities/entity-normalization-log.entity';
import { Dataset } from '../dataset/entities/dataset.entity';
import { Document } from '../dataset/entities/document.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';
import { Embedding } from '../dataset/entities/embedding.entity';
import { Prompt } from '../prompts/entities/prompt.entity';
import { AiProvider } from '../ai-provider/entities/ai-provider.entity';
import { User } from '../user/user.entity';
import { ChatConversation } from '../chat/entities/chat-conversation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { DatasetKeywordTable } from '../dataset/entities/dataset-keyword-table.entity';
import { GraphService } from './services/graph.service';
import { GraphExtractionService } from './services/graph-extraction.service';
import { GraphQueryService } from './services/graph-query.service';
import { BrandComparisonService } from './services/brand-comparison.service';
import { GraphPromptSelectorService } from './services/graph-prompt-selector.service';
import { EntityDictionaryService } from './services/entity-dictionary.service';
import { HybridExtractionService } from './services/hybrid-extraction.service';
import { EntityNormalizationService } from './services/entity-normalization.service';
import { EntityLearningService } from './services/entity-learning.service';
import { GraphController } from './controllers/graph.controller';
import { BrandComparisonController } from './controllers/brand-comparison.controller';
import { EntityDictionaryController } from './controllers/entity-dictionary.controller';
import { EntityNormalizationController } from './controllers/entity-normalization.controller';
import { AiProviderService } from '../ai-provider/services/ai-provider.service';
import { PromptService } from '../prompts/services/prompt.service';
import { LLMClientFactory } from '../ai-provider/services/llm-client-factory.service';
import { NotificationService } from '../notification/notification.service';
import { EventBusService } from '../event/services/event-bus.service';
import { DatasetModule } from '../dataset/dataset.module';
import { UserModule } from '../user/user.module';
import { CsvConnectorModule } from '../csv-connector/csv-connector.module';
import { QueueModule } from '../queue/queue.module';
import { EventModule } from '../event/event.module';
import { DetectorService } from '../../common/services/detector.service';
import { LLMExtractionService } from '../../common/services/llm-extraction.service';
import { BullModule } from '@nestjs/bull';
import { DocumentParserModule } from '../document-parser/document-parser.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GraphNode,
      GraphEdge,
      GraphEntity,
      EntityAlias,
      EntityNormalizationLog,
      Dataset,
      Document,
      DocumentSegment,
      Embedding,
      Prompt,
      AiProvider,
      User,
      ChatConversation,
      ChatMessage,
      DatasetKeywordTable,
    ]),
    CacheModule.register(),
    HttpModule,
    ConfigModule,
    forwardRef(() => DatasetModule),
    UserModule,
    CsvConnectorModule,
    forwardRef(() => QueueModule),
    EventModule,
    DocumentParserModule,
    NotificationModule,
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  providers: [
    GraphService,
    GraphExtractionService,
    GraphQueryService,
    BrandComparisonService,
    GraphPromptSelectorService,
    EntityDictionaryService,
    HybridExtractionService,
    EntityNormalizationService,
    EntityLearningService,
    AiProviderService,
    PromptService,
    LLMClientFactory,
    NotificationService,
    EventBusService,
    DetectorService,
    LLMExtractionService,
  ],
  controllers: [
    GraphController,
    BrandComparisonController,
    EntityDictionaryController,
    EntityNormalizationController,
  ],
  exports: [
    GraphService,
    GraphExtractionService,
    GraphQueryService,
    BrandComparisonService,
    EntityDictionaryService,
    HybridExtractionService,
    EntityNormalizationService,
    EntityLearningService,
  ],
})
export class GraphModule {}
