import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatController } from './chat.controller';
import { HealthController } from './controllers/health.controller';
import { ChatService } from './services/chat.service';
import { SegmentRetrievalService } from './services/segment-retrieval.service';
import { ResponseGeneratorService } from './services/response-generator.service';
import { DatasetModule } from '../dataset/dataset.module';
import { PromptsModule } from '../prompts/prompts.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { UserModule } from '../user/user.module';
import { DebugLogger } from '../../common/services/debug-logger.service';
import { OllamaApiClient } from '../../common/services/ollama-api-client.service';
import { LocalModelApiClient } from '../../common/services/local-model-api-client.service';
import { LocalLLMClient } from '../../common/services/local-llm-client.service';
import { LocalLLMService } from '../../common/services/local-llm.service';
import { OpenRouterApiClient } from '../../common/services/openrouter-api-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatConversation]),
    HttpModule,
    DatasetModule,
    PromptsModule,
    AiProviderModule,
    UserModule,
  ],
  providers: [
    ChatService,
    SegmentRetrievalService,
    ResponseGeneratorService,
    DebugLogger,
    // Health controller dependencies
    OllamaApiClient,
    LocalModelApiClient,
    LocalLLMService,
    LocalLLMClient,
    OpenRouterApiClient,
  ],
  controllers: [ChatController, HealthController],
  exports: [ChatService],
})
export class ChatModule {}
