import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';
import { Dataset } from './entities/dataset.entity';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { DatasetKeywordTable } from './entities/dataset-keyword-table.entity';
import { Embedding } from './entities/embedding.entity';
import { ChatConversation } from '../chat/entities/chat-conversation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { DatasetService } from './dataset.service';
import { DatasetController } from './dataset.controller';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { DocumentSegmentService } from './document-segment.service';
import { DocumentSegmentController } from './document-segment.controller';
import { DocumentProcessingService } from './services/document-processing.service';
import { EmbeddingV2Service } from './services/embedding-v2.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { EmbeddingConfigProcessorService } from './services/embedding-config-processor.service';
import { ApiClientFactory } from '../../common/services/api-client-factory.service';
import { EmbeddingClientFactory } from '../../common/services/embedding-client-factory.service';
import { LocalEmbeddingClient } from '../../common/services/local-embedding-client.service';
import { OllamaEmbeddingClient } from '../../common/services/ollama-embedding-client.service';
import { DashScopeEmbeddingClient } from '../../common/services/dashscope-embedding-client.service';
import { OpenRouterApiClient } from '../../common/services/openrouter-api-client.service';
import { PerplexityApiClient } from '../../common/services/perplexity-api-client.service';
import { OllamaApiClient } from '../../common/services/ollama-api-client.service';
import { LocalModelApiClient } from '../../common/services/local-model-api-client.service';
import { LocalLLMClient } from '../../common/services/local-llm-client.service';
import { LocalLLMService } from '../../common/services/local-llm.service';
import { DashScopeApiClient } from '../../common/services/dashscope-api-client.service';
import { ModelMappingService } from '../../common/services/model-mapping.service';
import { DetectorService } from '../../common/services/detector.service';
// 🆕 Import for Parent-Child Chunking support
import { DocumentParserModule } from '../document-parser/document-parser.module';
import { CsvConnectorModule } from '../csv-connector/csv-connector.module';
import { QueueModule } from '../queue/queue.module';
import { BullModule } from '@nestjs/bull';
// 🆕 Import new processing services
import { ChunkingService } from './services/chunking.service';
import { PostContentTransformerService } from './services/post-content-transformer.service';
import { EmbeddingProcessingService } from './services/embedding-processing.service';
import { JobDispatcherService } from '../queue/services/job-dispatcher.service';
import { QueueManagerService } from '../queue/services/queue-manager.service';
import { EventBusService } from '../event/services/event-bus.service';
import { WorkerPoolService } from '../queue/jobs/document/worker-pool.service';
import { UserModule } from '../user/user.module';
import { PostsModule } from '../posts/posts.module';
import { GraphNode } from '../graph/entities/graph-node.entity';
import { GraphEdge } from '../graph/entities/graph-edge.entity';
import { Prompt } from '../prompts/entities/prompt.entity';
import { AiProvider } from '../ai-provider/entities/ai-provider.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dataset,
      Document,
      DocumentSegment,
      DatasetKeywordTable,
      Embedding,
      ChatConversation,
      ChatMessage,
      GraphNode,
      GraphEdge,
      Prompt,
      AiProvider,
    ]),
    HttpModule,
    ConfigModule,
    CacheModule.register(),
    EventModule,
    NotificationModule,
    // 🆕 Import DocumentParserModule for Parent-Child Chunking
    DocumentParserModule,
    CsvConnectorModule,
    QueueModule,
    UserModule,
    PostsModule,
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  providers: [
    DatasetService,
    DocumentService,
    DocumentSegmentService,
    DocumentProcessingService,
    EmbeddingV2Service,
    HybridSearchService,
    EmbeddingConfigProcessorService,
    ModelMappingService,
    DetectorService,
    ApiClientFactory,
    EmbeddingClientFactory,
    LocalEmbeddingClient,
    OllamaEmbeddingClient,
    DashScopeEmbeddingClient,
    OpenRouterApiClient,
    PerplexityApiClient,
    OllamaApiClient,
    LocalModelApiClient,
    LocalLLMService,
    LocalLLMClient,
    DashScopeApiClient,
    // 🆕 Add new processing services
    // Note: ChunkingService needs PostsService, but PostsModule is already imported
    PostContentTransformerService,
    ChunkingService,
    EmbeddingProcessingService,
    JobDispatcherService,
    QueueManagerService,
    EventBusService,
    WorkerPoolService,
  ],
  exports: [
    TypeOrmModule,
    DatasetService,
    DocumentService,
    DocumentSegmentService,
    DocumentProcessingService,
    EmbeddingV2Service,
    EmbeddingProcessingService,
    HybridSearchService,
    ModelMappingService,
    EmbeddingConfigProcessorService,
    PostContentTransformerService,
  ],
  controllers: [
    DatasetController,
    DocumentController,
    DocumentSegmentController,
  ],
})
export class DatasetModule {}
