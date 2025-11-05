import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import {
  ChatMessage,
  MessageRole,
  MessageStatus,
} from '../entities/chat-message.entity';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatWithDocumentsDto } from '../dto/chat-with-documents.dto';
import { ChatResponseDto } from '../dto/chat-response.dto';
import { DatasetService } from '../../dataset/dataset.service';
import { AiProviderConfigResolver } from '../../ai-provider/services/ai-provider-config-resolver.service';
import { LLMClientFactory } from '../../ai-provider/services/llm-client-factory.service';
import { SegmentRetrievalService } from './segment-retrieval.service';
import { ResponseGeneratorService } from './response-generator.service';
import { DebugLogger } from '../../../common/services/debug-logger.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    private readonly datasetService: DatasetService,
    private readonly aiProviderConfigResolver: AiProviderConfigResolver,
    private readonly llmClientFactory: LLMClientFactory,
    private readonly segmentRetrievalService: SegmentRetrievalService,
    private readonly responseGeneratorService: ResponseGeneratorService,
    private readonly debugLogger: DebugLogger,
  ) {}

  async chatWithDocuments(
    dto: ChatWithDocumentsDto,
    userId: string,
  ): Promise<ChatResponseDto> {
    const startTime = Date.now();
    this.logger.log(`💬 Starting chat with documents for user ${userId}`);

    this.debugLogger.logChatProcess('start', {
      query: dto.message,
      datasetId: dto.datasetId,
      maxChunks: dto.maxChunks,
      segmentIds: dto.segmentIds,
      documentIds: dto.documentIds,
    });

    try {
      // 1. Validate dataset exists
      const dataset = await this.datasetService.findById(dto.datasetId);
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // 2. Resolve AI configuration with cascading fallback
      const config = await this.aiProviderConfigResolver.resolveForDataset(
        dto.datasetId,
        userId,
      );

      // Override with DTO values if provided

      const effectiveConfig = {
        ...config,
        temperature:
          dto.temperature !== undefined ? dto.temperature : config.temperature,
        maxChunks:
          dto.maxChunks !== undefined ? dto.maxChunks : config.maxChunks,
        includeConversationHistory:
          dto.includeConversationHistory !== undefined
            ? dto.includeConversationHistory
            : config.includeConversationHistory,
        conversationHistoryLimit:
          dto.conversationHistoryLimit !== undefined
            ? dto.conversationHistoryLimit
            : config.conversationHistoryLimit,
      };

      this.debugLogger.logChatProcess('config-resolved', {
        provider: effectiveConfig.provider.type,
        model: effectiveConfig.model,
        temperature: effectiveConfig.temperature,
        maxChunks: effectiveConfig.maxChunks,
        includeConversationHistory: effectiveConfig.includeConversationHistory,
        conversationHistoryLimit: effectiveConfig.conversationHistoryLimit,
      });

      // 3. Get or create conversation
      const conversation = await this.getOrCreateConversation(
        dto.conversationId,
        dto.conversationTitle || 'New Chat',
        dto.datasetId,
        userId,
        dto.documentIds,
        dto.segmentIds,
      );

      // 4. Save user message
      await this.saveMessage({
        content: dto.message,
        role: MessageRole.USER,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
      });

      // 5. Retrieve relevant segments
      const retrievedSegments =
        await this.segmentRetrievalService.retrieveRelevantSegments(
          dto.datasetId,
          dto.message,
          dto.documentIds,
          dto.segmentIds,
          effectiveConfig.maxChunks,
          effectiveConfig.bm25Weight,
          effectiveConfig.embeddingWeight,
        );

      this.debugLogger.logChatProcess('segments-retrieved', {
        segmentsCount: retrievedSegments.length,
        segments: retrievedSegments.map((s) => ({
          id: s.id,
          similarity: s.similarity,
          contentLength: s.content.length,
        })),
      });

      // 6. Generate response
      const assistantMessage =
        await this.responseGeneratorService.generateResponse(
          dto.message,
          retrievedSegments,
          effectiveConfig,
          effectiveConfig.includeConversationHistory
            ? conversation.messages || []
            : [],
        );

      this.debugLogger.logChatProcess('response-generated', {
        responseLength: assistantMessage.content.length,
        tokensUsed: assistantMessage.tokensUsed,
        model: assistantMessage.model,
      });

      // 7. Save assistant message
      const savedAssistantMessage = await this.saveMessage({
        content: assistantMessage.content,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
        sourceChunkIds: JSON.stringify(retrievedSegments.map((s) => s.id)),
        sourceDocuments: JSON.stringify(
          retrievedSegments.map((s) => s.documentId || s.id),
        ),
        metadata: {
          tokensUsed: assistantMessage.tokensUsed,
          model: assistantMessage.model,
          provider: effectiveConfig.provider.type,
        },
      });

      const processingTime = Date.now() - startTime;

      return {
        message: savedAssistantMessage,
        conversationId: conversation.id,
        sourceChunks: retrievedSegments.map((segment) => ({
          id: segment.id,
          content: segment.content,
          documentId: segment.documentId || segment.id,
          documentName: 'Document', // We don't have document name in search results
          similarity: segment.similarity || 0,
        })),
        metadata: {
          tokensUsed: assistantMessage.tokensUsed,
          processingTime,
          model: assistantMessage.model,
          provider: effectiveConfig.provider.type,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Chat failed: ${error.message}`, error.stack);

      // Save error message if we have a conversation
      if (dto.conversationId) {
        await this.saveMessage({
          content: `Error: ${error.message}`,
          role: MessageRole.ASSISTANT,
          status: MessageStatus.FAILED,
          userId,
          datasetId: dto.datasetId,
          conversationId: dto.conversationId,
          error: error.message,
        });
      }

      throw error;
    }
  }

  private async getOrCreateConversation(
    conversationId: string | undefined,
    title: string,
    datasetId: string,
    userId: string,
    documentIds?: string[],
    segmentIds?: string[],
  ): Promise<ChatConversation> {
    if (conversationId) {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId, userId },
        relations: ['messages'],
      });
      if (conversation) {
        return conversation;
      }
    }

    // Create new conversation
    const conversation = this.conversationRepository.create({
      title,
      datasetId,
      userId,
      selectedDocumentIds: documentIds || [],
      selectedSegmentIds: segmentIds || [],
    });

    return await this.conversationRepository.save(conversation);
  }

  private async saveMessage(
    messageData: Partial<ChatMessage>,
  ): Promise<ChatMessage> {
    const message = this.messageRepository.create(messageData);
    return await this.messageRepository.save(message);
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<ChatMessage[]> {
    return await this.messageRepository.find({
      where: { conversationId, userId },
      order: { createdAt: 'ASC' },
    });
  }

  async getConversations(
    userId: string,
    datasetId?: string,
  ): Promise<ChatConversation[]> {
    // IMPORTANT: Conversations are NOT filtered by model/provider
    // All conversations for the user/dataset are returned regardless of AI model used
    const where: any = { userId };
    if (datasetId) {
      where.datasetId = datasetId;
    }

    return await this.conversationRepository.find({
      where,
      order: { updatedAt: 'DESC' },
      relations: ['messages'],
    });
  }

  async getLatestConversation(
    datasetId: string,
    userId: string,
  ): Promise<ChatConversation | null> {
    // IMPORTANT: Latest conversation is NOT filtered by model/provider
    // Returns the most recently updated conversation regardless of AI model used
    this.logger.debug(
      `🔍 Getting latest conversation for dataset ${datasetId} and user ${userId}`,
    );

    try {
      // Optimize query: use query builder with explicit limit and no relations
      // This avoids loading related messages which can be very slow
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .select([
          'conversation.id',
          'conversation.title',
          'conversation.description',
          'conversation.selectedDocumentIds',
          'conversation.selectedSegmentIds',
          'conversation.metadata',
          'conversation.userId',
          'conversation.datasetId',
          'conversation.createdAt',
          'conversation.updatedAt',
        ])
        .where('conversation.datasetId = :datasetId', { datasetId })
        .andWhere('conversation.userId = :userId', { userId })
        .orderBy('conversation.updatedAt', 'DESC')
        .limit(1)
        .getOne();

      this.logger.debug(
        `📋 Found conversation: ${conversation ? conversation.id : 'none'}`,
      );
      return conversation;
    } catch (error) {
      this.logger.error(
        `Failed to get latest conversation: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getConversationMessagesPaginated(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    messages: ChatMessage[];
    total: number;
    hasMore: boolean;
    page: number;
    limit: number;
  }> {
    // IMPORTANT: Messages are NOT filtered by model/provider
    // All messages in the conversation are returned regardless of AI model used
    this.logger.log(
      `📄 Getting paginated messages for conversation ${conversationId}, page ${page}, limit ${limit}`,
    );
    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId, userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const hasMore = skip + limit < total;
    this.logger.log(
      `📄 Found ${messages.length} messages, total: ${total}, hasMore: ${hasMore}`,
    );

    return {
      messages: messages.reverse(), // Reverse to get chronological order (oldest first)
      total,
      hasMore,
      page,
      limit,
    };
  }

  chatWithDocumentsStream(
    dto: ChatWithDocumentsDto,
    userId: string,
  ): Promise<Observable<MessageEvent>> {
    return Promise.resolve(
      new Observable((observer) => {
        this.handleStreamingChat(dto, userId, observer).catch((error) => {
          observer.error(error);
        });
      }),
    );
  }

  private async handleStreamingChat(
    dto: ChatWithDocumentsDto,
    userId: string,
    observer: any,
  ): Promise<void> {
    const startTime = Date.now();
    this.logger.log(
      `💬 Starting streaming chat with documents for user ${userId}`,
    );

    try {
      // 1. Validate dataset exists
      const dataset = await this.datasetService.findById(dto.datasetId);
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // 2. Resolve AI configuration
      const config = await this.aiProviderConfigResolver.resolveForDataset(
        dto.datasetId,
        userId,
      );

      const effectiveConfig = {
        ...config,
        temperature:
          dto.temperature !== undefined ? dto.temperature : config.temperature,
        maxChunks:
          dto.maxChunks !== undefined ? dto.maxChunks : config.maxChunks,
      };

      // 3. Get or create conversation
      const conversation = await this.getOrCreateConversation(
        dto.conversationId,
        dto.conversationTitle || 'New Chat',
        dto.datasetId,
        userId,
        dto.documentIds,
        dto.segmentIds,
      );

      // 4. Save user message
      await this.saveMessage({
        content: dto.message,
        role: MessageRole.USER,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
      });

      // 5. Retrieve relevant segments
      const retrievedSegments =
        await this.segmentRetrievalService.retrieveRelevantSegments(
          dto.datasetId,
          dto.message,
          dto.documentIds,
          dto.segmentIds,
          effectiveConfig.maxChunks,
          effectiveConfig.bm25Weight,
          effectiveConfig.embeddingWeight,
        );

      // 6. Generate streaming response
      const assistantMessage =
        await this.responseGeneratorService.generateStreamingResponse(
          dto.message,
          retrievedSegments,
          effectiveConfig,
          effectiveConfig.includeConversationHistory
            ? conversation.messages || []
            : [],
          (token: string) => {
            observer.next({
              data: JSON.stringify({
                type: 'token',
                content: token,
              }),
            });
          },
        );

      // 7. Save assistant message
      const savedAssistantMessage = await this.saveMessage({
        content: assistantMessage.content,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
        sourceChunkIds: JSON.stringify(retrievedSegments.map((s) => s.id)),
        sourceDocuments: JSON.stringify(
          retrievedSegments.map((s) => s.documentId || s.id),
        ),
        metadata: {
          tokensUsed: assistantMessage.tokensUsed,
          model: assistantMessage.model,
          provider: effectiveConfig.provider.type,
        },
      });

      const processingTime = Date.now() - startTime;

      // Send final response
      observer.next({
        data: JSON.stringify({
          type: 'complete',
          message: savedAssistantMessage,
          conversationId: conversation.id,
          sourceChunks: retrievedSegments.map((segment) => ({
            id: segment.id,
            content: segment.content,
            documentId: segment.documentId || segment.id,
            documentName: 'Document',
            similarity: segment.similarity || 0,
          })),
          metadata: {
            tokensUsed: assistantMessage.tokensUsed,
            processingTime,
            model: assistantMessage.model,
            provider: effectiveConfig.provider.type,
          },
        }),
      });

      observer.complete();
    } catch (error) {
      this.logger.error(
        `❌ Streaming chat failed: ${error.message}`,
        error.stack,
      );

      // Send a proper error message to the frontend
      observer.next({
        data: JSON.stringify({
          type: 'error',
          error: error.message || 'An unexpected error occurred',
          details: error.stack || 'No additional details available',
        }),
      });

      observer.complete();
    }
  }
}
