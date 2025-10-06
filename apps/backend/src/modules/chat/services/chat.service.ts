import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ChatMessage,
  MessageRole,
  MessageStatus,
} from '../entities/chat-message.entity';
import { ChatConversation } from '../entities/chat-conversation.entity';
import { ChatWithDocumentsDto } from '../dto/chat-with-documents.dto';
import { ChatResponseDto } from '../dto/chat-response.dto';
import { DatasetService } from '../../dataset/dataset.service';
import { DocumentSegmentService } from '../../dataset/document-segment.service';
import { DocumentService } from '../../dataset/document.service';
import { HybridSearchService } from '../../dataset/services/hybrid-search.service';
import { EmbeddingV2Service } from '../../dataset/services/embedding-v2.service';
import {
  EmbeddingModel,
  RerankerType,
} from '../../dataset/dto/create-dataset-step.dto';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';
import {
  ApiClientFactory,
  LLMProvider as ApiLLMProvider,
} from '../../../common/services/api-client-factory.service';
import { LLMMessage } from '../../../common/interfaces/llm-client.interface';
import { ModelConfigService, LLMProvider } from './model-config.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    private readonly datasetService: DatasetService,
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly documentService: DocumentService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly apiClientFactory: ApiClientFactory,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  async chatWithDocuments(
    dto: ChatWithDocumentsDto,
    userId: string,
  ): Promise<ChatResponseDto> {
    const startTime = Date.now();
    this.logger.log(`💬 Starting chat with documents for user ${userId}`);

    try {
      // 1. Validate dataset exists
      const dataset = await this.datasetService.findById(dto.datasetId);
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // 2. Get or create conversation
      let conversation = await this.getOrCreateConversation(
        dto.conversationId,
        dto.conversationTitle || 'New Chat',
        dto.datasetId,
        userId,
        dto.documentIds,
        dto.segmentIds,
      );

      // 3. Save user message
      const userMessage = await this.saveMessage({
        content: dto.message,
        role: MessageRole.USER,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
      });

      // 4. Retrieve relevant segments
      const retrievedSegments = await this.retrieveRelevantSegments(
        dto.datasetId,
        dto.message,
        dto.documentIds,
        dto.segmentIds,
        dto.maxChunks || 5,
        dto.rerankerType || RerankerType.MATHEMATICAL,
      );

      // 5. Generate response using LLM
      const assistantMessage = await this.generateResponse(
        dto.message,
        retrievedSegments,
        dto.llmProvider || LLMProvider.DASHSCOPE,
        dto.model,
        dto.temperature || 0.7,
        conversation.messages || [],
      );

      // 6. Save assistant message
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
          provider: dto.llmProvider,
        },
      });

      const processingTime = Date.now() - startTime;

      return {
        message: savedAssistantMessage,
        conversationId: conversation.id,
        sourceChunks: retrievedSegments.map((segment) => {
          this.logger.log(
            `🔍 DEBUG - Final response mapping: Segment ${segment.id}, similarity: ${segment.similarity}`,
          );
          return {
            id: segment.id,
            content: segment.content,
            documentId: segment.documentId || segment.id,
            documentName: 'Document', // We don't have document name in search results
            similarity: segment.similarity || 0,
          };
        }),
        metadata: {
          tokensUsed: assistantMessage.tokensUsed,
          processingTime,
          model: assistantMessage.model,
          provider: dto.llmProvider,
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

  private async retrieveRelevantSegments(
    datasetId: string,
    query: string,
    documentIds?: string[],
    segmentIds?: string[],
    maxChunks: number = 10,
    rerankerType: RerankerType = RerankerType.MATHEMATICAL,
  ): Promise<
    Array<{
      id: string;
      content: string;
      similarity?: number;
      segment?: any;
      documentId?: string;
    }>
  > {
    this.logger.log(`🔍 Retrieving relevant segments for query: "${query}"`);

    // If specific segments are provided, use them
    if (segmentIds && segmentIds.length > 0) {
      const segments = await this.documentSegmentService.find({
        where: { id: In(segmentIds) },
        relations: ['document'],
      });

      // Calculate actual similarity scores for specific segments
      const segmentsWithSimilarity = await Promise.all(
        segments.map(async (segment) => {
          // Generate query embedding for similarity calculation
          const queryEmbedding = await this.generateQueryEmbedding(query);
          if (!queryEmbedding) {
            return {
              id: segment.id,
              content: segment.content,
              documentId: segment.documentId,
              similarity: 0.5, // Default fallback similarity
            };
          }

          // Get segment embedding and calculate similarity
          const segmentEmbedding = await this.getSegmentEmbedding(segment.id);
          if (!segmentEmbedding) {
            return {
              id: segment.id,
              content: segment.content,
              documentId: segment.documentId,
              similarity: 0.5, // Default fallback similarity
            };
          }

          const similarity = this.calculateCosineSimilarity(
            queryEmbedding,
            segmentEmbedding,
          );

          return {
            id: segment.id,
            content: segment.content,
            documentId: segment.documentId,
            similarity: Math.max(0, Math.min(1, similarity)), // Clamp between 0 and 1
          };
        }),
      );

      return segmentsWithSimilarity.slice(0, maxChunks);
    }

    // If specific documents are provided, search within them
    if (documentIds && documentIds.length > 0) {
      const allSegments = [];
      for (const documentId of documentIds) {
        const searchResults = await this.hybridSearchService.hybridSearch(
          documentId,
          query,
          maxChunks,
          0.7, // semanticWeight
          0.3, // keywordWeight
          RerankerType.MATHEMATICAL, // rerankerType - use mathematical reranker instead
        );
        // Add documentId to each search result
        const resultsWithDocumentId = searchResults.results.map((result) => ({
          ...result,
          documentId: documentId,
        }));
        allSegments.push(...resultsWithDocumentId);
      }
      return allSegments.slice(0, maxChunks);
    }

    // Search across all documents in the dataset
    const dataset = await this.datasetService.findById(datasetId);

    this.logger.log(`🔍 Dataset found: ${dataset ? 'Yes' : 'No'}`);
    this.logger.log(`🔍 Dataset ID: ${datasetId}`);
    this.logger.log(
      `📄 Documents in dataset: ${dataset?.documents?.length || 0}`,
    );
    this.logger.log(`🔍 Documents relation loaded: ${!!dataset?.documents}`);

    if (dataset?.documents) {
      dataset.documents.forEach((doc, index) => {
        this.logger.log(`  Document ${index + 1}: ${doc.name} (${doc.id})`);
      });
    } else {
      this.logger.warn('❌ Documents relation is null or undefined');
    }

    // If documents relation is not loaded, fetch them directly
    let documents = dataset?.documents;
    if (!documents || documents.length === 0) {
      this.logger.warn(
        '❌ Documents relation not loaded, fetching directly from database',
      );
      // Use the document service to fetch documents by dataset ID
      documents = await this.documentService.findByDatasetId(datasetId);
      this.logger.log(
        `📄 Fetched ${documents.length} documents directly from database`,
      );
      documents.forEach((doc, index) => {
        this.logger.log(`  Document ${index + 1}: ${doc.name} (${doc.id})`);
      });
    }

    if (!documents || documents.length === 0) {
      this.logger.warn('❌ No documents found in dataset');
      return [];
    }

    const allSegments = [];
    this.logger.log(`🔍 Processing ${documents.length} documents:`);
    documents.forEach((doc, index) => {
      this.logger.log(`  ${index + 1}. ${doc.name} (${doc.id})`);
    });

    for (const document of documents) {
      this.logger.log(
        `🔍 Searching document: ${document.name} (${document.id})`,
      );
      const searchResults = await this.hybridSearchService.hybridSearch(
        document.id,
        query,
        maxChunks,
        0.7, // semanticWeight
        0.3, // keywordWeight
        rerankerType, // Use the passed rerankerType parameter
      );
      this.logger.log(
        `📊 Found ${searchResults.results.length} segments in ${document.name}`,
      );
      if (searchResults.results.length > 0) {
        this.logger.log(
          `  First segment preview: ${searchResults.results[0].content.substring(0, 100)}...`,
        );
      }
      // Add documentId to each search result
      const resultsWithDocumentId = searchResults.results.map((result) => ({
        ...result,
        documentId: document.id,
      }));
      allSegments.push(...resultsWithDocumentId);
    }

    this.logger.log(
      `📊 Total segments found across all documents: ${allSegments.length}`,
    );

    // Log all segments before final selection
    this.logger.log(`🔍 All segments before final selection:`);
    allSegments.forEach((segment, index) => {
      this.logger.log(
        `  ${index + 1}. ID: ${segment.id}, Similarity: ${segment.similarity?.toFixed(3) || 'N/A'}`,
      );
      this.logger.log(
        `     Content preview: ${segment.content.substring(0, 100)}...`,
      );
    });

    // Remove duplicate segments (same content) before sorting
    const uniqueSegments = [];
    const seenContent = new Set();

    for (const segment of allSegments) {
      const trimmedContent = segment.content.trim();
      if (!seenContent.has(trimmedContent)) {
        seenContent.add(trimmedContent);
        uniqueSegments.push(segment);
      }
    }

    this.logger.log(
      `🔍 Removed ${allSegments.length - uniqueSegments.length} duplicate segments`,
    );

    // Sort segments by similarity score (highest first) before final selection
    const sortedSegments = uniqueSegments.sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0),
    );
    const finalSegments = sortedSegments.slice(0, maxChunks);

    // Log final segments being passed to LLM
    this.logger.log(
      `🎯 Final ${finalSegments.length} segments being passed to LLM:`,
    );
    finalSegments.forEach((segment, index) => {
      this.logger.log(
        `  ${index + 1}. ID: ${segment.id}, Similarity: ${segment.similarity?.toFixed(3) || 'N/A'}`,
      );
      this.logger.log(
        `     Content preview: ${segment.content.substring(0, 100)}...`,
      );
    });

    return finalSegments;
  }

  private async generateResponse(
    query: string,
    segments: any[],
    provider: LLMProvider,
    model?: string,
    temperature: number = 0.7,
    conversationHistory: ChatMessage[] = [],
  ): Promise<{ content: string; tokensUsed?: number; model: string }> {
    this.logger.log(`🤖 Generating response using ${provider}`);

    // Validate model for provider
    const modelToUse =
      model || this.modelConfigService.getDefaultModelForProvider(provider);
    if (!modelToUse) {
      throw new Error(`No model specified for provider ${provider}`);
    }

    if (
      !this.modelConfigService.validateModelForProvider(provider, modelToUse)
    ) {
      throw new Error(
        `Model ${modelToUse} is not available for provider ${provider}`,
      );
    }

    // Build context from segments
    const context = segments
      .map((segment, index) => `[${index + 1}] ${segment.content}`)
      .join('\n\n');

    // Build conversation history
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a helpful assistant that answers questions based on the provided document segments. 

Use the following context to answer the user's question. When answering:

1. If the answer can be found directly in the provided context, cite the specific segments using [1], [2], etc.
2. If the answer is not explicitly mentioned in the context but you have relevant knowledge, provide the answer and clearly state that it's based on your general knowledge, not the provided context.
3. If you cannot answer the question with either the context or your knowledge, say so clearly.

Context:
${context}

Instructions:
- Prioritize information from the provided context when available
- Be clear about your sources (context vs. general knowledge)
- Cite specific segments when using context information
- Be concise but comprehensive`,
      },
    ];

    // Add conversation history (last 10 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add current query
    messages.push({
      role: 'user',
      content: query,
    });

    // Get LLM client for all providers (including local)
    const apiProvider = this.mapToApiProvider(provider);
    const llmClient = this.apiClientFactory.getLLMClient(apiProvider);

    // Generate response
    const response = await llmClient.chatCompletion(messages, modelToUse);

    return {
      content: response.data.choices[0].message.content,
      tokensUsed: response.data.usage?.total_tokens,
      model: modelToUse,
    };
  }

  private mapToApiProvider(provider: LLMProvider): ApiLLMProvider {
    switch (provider) {
      case LLMProvider.OPENROUTER:
        return ApiLLMProvider.OPENROUTER;
      case LLMProvider.PERPLEXITY:
        return ApiLLMProvider.PERPLEXITY;
      case LLMProvider.OLLAMA:
        return ApiLLMProvider.OLLAMA;
      case LLMProvider.LOCAL_API:
        return ApiLLMProvider.LOCAL_API;
      case LLMProvider.LOCAL_DIRECT:
        return ApiLLMProvider.LOCAL_DIRECT;
      case LLMProvider.DASHSCOPE:
        return ApiLLMProvider.DASHSCOPE;
      default:
        return ApiLLMProvider.DASHSCOPE;
    }
  }

  private getDefaultModel(provider: LLMProvider): string {
    return (
      this.modelConfigService.getDefaultModelForProvider(provider) ||
      'qwen-max-latest'
    );
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

  async getAvailableModels() {
    const providers = this.modelConfigService.getAvailableProviders();
    console.log('Processing providers in ChatService:', providers);
    const result = [];

    for (const provider of providers) {
      console.log(`Processing provider: ${provider}`);
      const models = this.modelConfigService.getModelsByProvider(provider);
      let isAvailable = true;
      let availabilityMessage = '';

      // Check if local services are actually available
      if (provider === LLMProvider.LOCAL_API) {
        isAvailable = await this.checkLocalApiAvailability();
        if (!isAvailable) {
          // Skip local-api entirely if not available
          continue;
        }
      }

      if (provider === LLMProvider.OLLAMA) {
        isAvailable = await this.checkOllamaAvailability();
        if (!isAvailable) {
          // Skip ollama entirely if not available
          continue;
        }
      }

      if (provider === LLMProvider.LOCAL_DIRECT) {
        // Local direct is always available (in-process execution)
        isAvailable = true;
      }

      if (provider === LLMProvider.DASHSCOPE) {
        isAvailable = await this.checkDashScopeAvailability();
        if (!isAvailable) {
          availabilityMessage =
            'DashScope API is not available. Please check your API key and network connection.';
        }
      }

      result.push({
        id: provider,
        name: this.getProviderDisplayName(provider),
        models: models.map((model) => ({
          ...model,
          available: isAvailable,
          availabilityMessage: availabilityMessage,
        })),
        available: isAvailable,
        availabilityMessage: availabilityMessage,
      });
      console.log(
        `Added provider to result: ${provider}, available: ${isAvailable}`,
      );
    }

    console.log(
      'Final result providers:',
      result.map((p) => p.id),
    );
    return { providers: result };
  }

  private async checkLocalApiAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.LOCAL_API);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).isServiceAvailable();
    } catch (error) {
      return false;
    }
  }

  private async checkOllamaAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.OLLAMA);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).isServiceAvailable();
    } catch (error) {
      return false;
    }
  }

  private async checkDashScopeAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.DASHSCOPE);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).healthCheck();
    } catch (error) {
      return false;
    }
  }

  private getProviderDisplayName(provider: LLMProvider): string {
    const names = {
      [LLMProvider.OPENROUTER]: 'OpenRouter',
      [LLMProvider.PERPLEXITY]: 'Perplexity',
      [LLMProvider.OLLAMA]: 'Ollama (Local)',
      [LLMProvider.LOCAL_API]: 'Local API Server',
      [LLMProvider.LOCAL_DIRECT]: 'Local (In-Process)',
      [LLMProvider.DASHSCOPE]: 'DashScope (Alibaba)',
    };
    return names[provider] || provider;
  }

  async debugDataset(datasetId: string) {
    this.logger.log(`🔍 Debugging dataset: ${datasetId}`);

    // Test 1: Direct dataset query
    const dataset = await this.datasetService.findById(datasetId);
    this.logger.log(`Dataset found: ${dataset ? 'Yes' : 'No'}`);
    this.logger.log(`Documents relation loaded: ${!!dataset?.documents}`);
    this.logger.log(`Documents count: ${dataset?.documents?.length || 0}`);

    if (dataset?.documents) {
      dataset.documents.forEach((doc, index) => {
        this.logger.log(`  Document ${index + 1}: ${doc.name} (${doc.id})`);
      });
    }

    // Test 2: Direct document query
    const documents = await this.documentService.findByDatasetId(datasetId);
    this.logger.log(`Direct document query count: ${documents.length}`);
    documents.forEach((doc, index) => {
      this.logger.log(
        `  Direct Document ${index + 1}: ${doc.name} (${doc.id})`,
      );
    });

    return {
      dataset: {
        id: dataset?.id,
        name: dataset?.name,
        documentsCount: dataset?.documents?.length || 0,
        documents:
          dataset?.documents?.map((doc) => ({
            id: doc.id,
            name: doc.name,
          })) || [],
      },
      directDocuments: documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
      })),
    };
  }

  /**
   * Generate query embedding for similarity calculation
   */
  private async generateQueryEmbedding(
    query: string,
  ): Promise<number[] | null> {
    try {
      // Use the embedding service to generate query embedding
      const result = await this.embeddingService.generateEmbedding(
        query,
        EmbeddingModel.QWEN3_EMBEDDING_0_6B, // Default model
        EmbeddingProvider.LOCAL, // Default provider
      );
      return result.embedding;
    } catch (error) {
      this.logger.warn(`Failed to generate query embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Get segment embedding from database
   */
  private async getSegmentEmbedding(
    segmentId: string,
  ): Promise<number[] | null> {
    try {
      const segment = await this.documentSegmentService.findOne({
        where: { id: segmentId },
        relations: ['embedding'],
      });

      if (segment?.embedding?.embedding) {
        return segment.embedding.embedding;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get segment embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      this.logger.warn(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
