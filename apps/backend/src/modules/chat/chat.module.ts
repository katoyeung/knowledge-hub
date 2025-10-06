import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatController } from './chat.controller';
import { HealthController } from './controllers/health.controller';
import { ChatService } from './services/chat.service';
import { ModelConfigService } from './services/model-config.service';
import { DatasetModule } from '../dataset/dataset.module';
import { ApiClientFactory } from '../../common/services/api-client-factory.service';
import { OpenRouterApiClient } from '../../common/services/openrouter-api-client.service';
import { PerplexityApiClient } from '../../common/services/perplexity-api-client.service';
import { OllamaApiClient } from '../../common/services/ollama-api-client.service';
import { LocalModelApiClient } from '../../common/services/local-model-api-client.service';
import { LocalLLMClient } from '../../common/services/local-llm-client.service';
import { LocalLLMService } from '../../common/services/local-llm.service';
import { DashScopeApiClient } from '../../common/services/dashscope-api-client.service';
import { DocumentService } from '../dataset/document.service';
import { EmbeddingV2Service } from '../dataset/services/embedding-v2.service';
import { EmbeddingClientFactory } from '../../common/services/embedding-client-factory.service';
import { ModelMappingService } from '../../common/services/model-mapping.service';
import { LocalEmbeddingClient } from '../../common/services/local-embedding-client.service';
import { OllamaEmbeddingClient } from '../../common/services/ollama-embedding-client.service';
import { DashScopeEmbeddingClient } from '../../common/services/dashscope-embedding-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatConversation]),
    HttpModule,
    DatasetModule,
  ],
  providers: [
    ChatService,
    ModelConfigService,
    ApiClientFactory,
    OpenRouterApiClient,
    PerplexityApiClient,
    OllamaApiClient,
    LocalModelApiClient,
    LocalLLMService,
    LocalLLMClient,
    DashScopeApiClient,
    DocumentService,
    EmbeddingV2Service,
    EmbeddingClientFactory,
    ModelMappingService,
    LocalEmbeddingClient,
    OllamaEmbeddingClient,
    DashScopeEmbeddingClient,
  ],
  controllers: [ChatController, HealthController],
  exports: [ChatService],
})
export class ChatModule {}
