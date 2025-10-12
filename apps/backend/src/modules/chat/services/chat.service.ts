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
  LLMProvider,
} from '../../../common/services/api-client-factory.service';
import { LLMMessage } from '../../../common/interfaces/llm-client.interface';
import { PromptService } from '../../prompts/services/prompt.service';
import { AiProviderService } from '../../ai-provider/services/ai-provider.service';
import { AiProvider } from '../../ai-provider/entities/ai-provider.entity';
import { UserService } from '../../user/user.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    @InjectRepository(AiProvider)
    private readonly aiProviderRepository: Repository<AiProvider>,
    private readonly datasetService: DatasetService,
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly documentService: DocumentService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly apiClientFactory: ApiClientFactory,
    private readonly promptService: PromptService,
    private readonly aiProviderService: AiProviderService,
    private readonly userService: UserService,
  ) {}

  private async setDefaultSettings(
    effectiveSettings: any,
    userId: string,
  ): Promise<void> {
    // Look up the actual OpenRouter provider ID
    const openrouterProvider =
      await this.aiProviderService.findAiProviderByType('openrouter', userId);
    if (openrouterProvider) {
      effectiveSettings.aiProviderId = openrouterProvider.id;
      effectiveSettings.llmProvider = LLMProvider.OPENROUTER;
    } else {
      throw new Error(
        'OpenRouter AI provider not found. Please configure an AI provider.',
      );
    }
    effectiveSettings.model = 'openai/gpt-oss-20b:free';
    effectiveSettings.temperature = 0.7;
    effectiveSettings.maxChunks = 5;
  }

  async chatWithDocuments(
    dto: ChatWithDocumentsDto,
    userId: string,
  ): Promise<ChatResponseDto> {
    const startTime = Date.now();
    this.logger.log(`💬 Starting chat with documents for user ${userId}`);

    try {
      this.logger.log(`📝 DTO received: ${JSON.stringify(dto)}`);
      // 1. Validate dataset exists
      const dataset = await this.datasetService.findById(dto.datasetId);
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // 1.5. Check for dataset chat settings and override DTO if available
      const effectiveSettings = {
        aiProviderId: undefined as string | undefined,
        llmProvider: LLMProvider.DASHSCOPE,
        model: undefined as string | undefined,
        temperature: dto.temperature || 0.7,
        maxChunks: dto.maxChunks || 5,
        promptId: undefined as string | undefined,
      };

      // Helper function to resolve LLMProvider from AI provider ID or type
      const resolveLLMProvider = async (
        providerId: string,
      ): Promise<LLMProvider> => {
        try {
          this.logger.log(`🔍 Looking up AI provider: ${providerId}`);

          // Check if it's a UUID (AI provider ID) or a provider type
          const isUUID =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              providerId,
            );

          let aiProvider: AiProvider | null = null;

          if (isUUID) {
            // Look up by ID
            aiProvider =
              await this.aiProviderService.findAiProviderById(providerId);
          } else {
            // Look up by type
            aiProvider = await this.aiProviderService.findAiProviderByType(
              providerId,
              userId,
            );
          }

          this.logger.log(
            `🔍 AI provider found: ${JSON.stringify(aiProvider)}`,
          );

          if (aiProvider && aiProvider.type) {
            const providerTypeMap = {
              openai: LLMProvider.OPENROUTER,
              anthropic: LLMProvider.OPENROUTER,
              openrouter: LLMProvider.OPENROUTER,
              dashscope: LLMProvider.DASHSCOPE,
              perplexity: LLMProvider.PERPLEXITY,
              custom: LLMProvider.OLLAMA, // Ollama is the correct provider for custom/local models
            };

            const resolvedProvider =
              providerTypeMap[aiProvider.type] || LLMProvider.OPENROUTER;
            this.logger.log(
              `🔍 Resolved provider type ${aiProvider.type} to ${resolvedProvider}`,
            );
            return resolvedProvider;
          }
        } catch (error) {
          this.logger.error(
            `❌ Failed to lookup AI provider ${providerId}: ${error.message}`,
          );
          this.logger.error(`❌ Error stack: ${error.stack}`);
        }
        return LLMProvider.OPENROUTER; // Default to OpenRouter instead of DashScope
      };

      if (dataset.settings && (dataset.settings as any).chat_settings) {
        const chatSettings = (dataset.settings as any).chat_settings;
        this.logger.log(
          `📝 Dataset chat settings found: ${JSON.stringify(chatSettings)}`,
        );

        // Check if chat settings are effectively null/empty
        const hasValidSettings =
          (chatSettings.provider !== null &&
            chatSettings.provider !== undefined &&
            chatSettings.provider !== '') ||
          (chatSettings.model !== null &&
            chatSettings.model !== undefined &&
            chatSettings.model !== '') ||
          (chatSettings.temperature !== null &&
            chatSettings.temperature !== undefined) ||
          (chatSettings.maxChunks !== null &&
            chatSettings.maxChunks !== undefined);

        if (hasValidSettings) {
          // If provider is specified in chat settings, resolve it to LLMProvider enum
          if (chatSettings.provider) {
            this.logger.log(
              `📝 Resolving provider from dataset settings: ${chatSettings.provider}`,
            );
            // Look up the actual provider ID by type
            const provider = await this.aiProviderService.findAiProviderByType(
              chatSettings.provider,
              userId,
            );
            if (provider) {
              effectiveSettings.aiProviderId = provider.id;
              effectiveSettings.llmProvider = await resolveLLMProvider(
                provider.id,
              );
            } else {
              throw new Error(
                `AI provider '${chatSettings.provider}' not found. Please configure an AI provider.`,
              );
            }
          }

          if (chatSettings.model) {
            effectiveSettings.model = chatSettings.model;
          }
          if (chatSettings.temperature !== undefined) {
            effectiveSettings.temperature = chatSettings.temperature;
          }
          if (chatSettings.maxChunks !== undefined) {
            effectiveSettings.maxChunks = chatSettings.maxChunks;
          }
          if (chatSettings.promptId) {
            effectiveSettings.promptId = chatSettings.promptId;
          }
        } else {
          // Dataset settings exist but are empty, fall back to user settings
          this.logger.log(
            `📝 Dataset chat settings are empty, checking user settings`,
          );
          try {
            const userSettings = await this.userService.getUserSettings(userId);
            const userChatSettings = (userSettings as any)?.chat_settings;

            if (userChatSettings) {
              this.logger.log(
                `📝 User chat settings found: ${JSON.stringify(userChatSettings)}`,
              );

              // Check if user chat settings are effectively null/empty
              const hasValidUserSettings =
                (userChatSettings.provider !== null &&
                  userChatSettings.provider !== undefined &&
                  userChatSettings.provider !== '') ||
                (userChatSettings.model !== null &&
                  userChatSettings.model !== undefined &&
                  userChatSettings.model !== '') ||
                (userChatSettings.temperature !== null &&
                  userChatSettings.temperature !== undefined) ||
                (userChatSettings.maxChunks !== null &&
                  userChatSettings.maxChunks !== undefined);

              if (hasValidUserSettings) {
                // If provider is specified in user chat settings, resolve it to LLMProvider enum
                if (userChatSettings.provider) {
                  this.logger.log(
                    `📝 Resolving provider from user settings: ${userChatSettings.provider}`,
                  );

                  // Check if it's a UUID (AI provider ID) or a provider type
                  const isUUID =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                      userChatSettings.provider,
                    );

                  let provider = null;
                  if (isUUID) {
                    // Look up by ID
                    provider = await this.aiProviderService.findAiProviderById(
                      userChatSettings.provider,
                    );
                  } else {
                    // Look up by type
                    provider =
                      await this.aiProviderService.findAiProviderByType(
                        userChatSettings.provider,
                        userId,
                      );
                  }

                  if (provider) {
                    effectiveSettings.aiProviderId = provider.id;
                    effectiveSettings.llmProvider = await resolveLLMProvider(
                      provider.id,
                    );
                  } else {
                    throw new Error(
                      `AI provider '${userChatSettings.provider}' not found. Please configure an AI provider.`,
                    );
                  }
                }

                if (userChatSettings.model) {
                  effectiveSettings.model = userChatSettings.model;
                }

                if (userChatSettings.temperature !== undefined) {
                  effectiveSettings.temperature = userChatSettings.temperature;
                }

                if (userChatSettings.maxChunks !== undefined) {
                  effectiveSettings.maxChunks = userChatSettings.maxChunks;
                }

                if (userChatSettings.promptId) {
                  effectiveSettings.promptId = userChatSettings.promptId;
                }
              } else {
                // User settings exist but are empty, fall back to defaults
                this.logger.log(
                  `📝 User chat settings are empty, using default settings`,
                );
                await this.setDefaultSettings(effectiveSettings, userId);
              }
            } else {
              // No user settings, fall back to defaults
              this.logger.log(
                `📝 No user chat settings found, using default settings`,
              );
              await this.setDefaultSettings(effectiveSettings, userId);
            }
          } catch (error) {
            this.logger.warn(
              `⚠️ Failed to load user settings, using default settings: ${error.message}`,
            );
            await this.setDefaultSettings(effectiveSettings, userId);
          }
        }
      } else {
        // Fallback to user settings when dataset settings are null or missing
        this.logger.log(
          `📝 No dataset chat settings found, checking user settings`,
        );

        try {
          const userSettings = await this.userService.getUserSettings(userId);
          const userChatSettings = (userSettings as any)?.chat_settings;

          if (userChatSettings) {
            this.logger.log(
              `📝 User chat settings found: ${JSON.stringify(userChatSettings)}`,
            );

            // Check if user chat settings are effectively null/empty
            const hasValidUserSettings =
              (userChatSettings.provider !== null &&
                userChatSettings.provider !== undefined &&
                userChatSettings.provider !== '') ||
              (userChatSettings.model !== null &&
                userChatSettings.model !== undefined &&
                userChatSettings.model !== '') ||
              (userChatSettings.temperature !== null &&
                userChatSettings.temperature !== undefined) ||
              (userChatSettings.maxChunks !== null &&
                userChatSettings.maxChunks !== undefined);

            if (hasValidUserSettings) {
              // If provider is specified in user chat settings, resolve it to LLMProvider enum
              if (userChatSettings.provider) {
                this.logger.log(
                  `📝 Resolving provider from user settings: ${userChatSettings.provider}`,
                );
                const provider =
                  await this.aiProviderService.findAiProviderByType(
                    userChatSettings.provider,
                    userId,
                  );
                if (provider) {
                  effectiveSettings.aiProviderId = provider.id;
                  effectiveSettings.llmProvider = await resolveLLMProvider(
                    userChatSettings.provider,
                  );
                } else {
                  throw new Error(
                    `AI provider '${userChatSettings.provider}' not found. Please configure an AI provider.`,
                  );
                }
              }

              if (userChatSettings.model) {
                effectiveSettings.model = userChatSettings.model;
              }

              if (userChatSettings.temperature !== undefined) {
                effectiveSettings.temperature = userChatSettings.temperature;
              }

              if (userChatSettings.maxChunks !== undefined) {
                effectiveSettings.maxChunks = userChatSettings.maxChunks;
              }

              if (userChatSettings.promptId) {
                effectiveSettings.promptId = userChatSettings.promptId;
              }
            } else {
              // User settings exist but are empty, fall back to defaults
              this.logger.log(
                `📝 User chat settings are empty, using default settings`,
              );
              await this.setDefaultSettings(effectiveSettings, userId);
            }
          } else {
            // No user settings, fall back to defaults
            this.logger.log(
              `📝 No user chat settings found, using default settings`,
            );
            await this.setDefaultSettings(effectiveSettings, userId);
          }
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to load user settings, using default settings: ${error.message}`,
          );
          await this.setDefaultSettings(effectiveSettings, userId);
        }
      }

      // 2. Get or create conversation
      const conversation = await this.getOrCreateConversation(
        dto.conversationId,
        dto.conversationTitle || 'New Chat',
        dto.datasetId,
        userId,
        dto.documentIds,
        dto.segmentIds,
      );

      // 3. Save user message
      await this.saveMessage({
        content: dto.message,
        role: MessageRole.USER,
        status: MessageStatus.COMPLETED,
        userId,
        datasetId: dto.datasetId,
        conversationId: conversation.id,
      });

      // Debug: Write to file for easier debugging
      const fs = require('fs');
      const debugInfo = {
        timestamp: new Date().toISOString(),
        method: 'chatWithDocuments',
        query: dto.message,
        datasetId: dto.datasetId,
        maxChunks: dto.maxChunks || 5,
        segmentIds: dto.segmentIds,
        documentIds: dto.documentIds,
      };
      fs.writeFileSync(
        '/tmp/debug-chat.log',
        JSON.stringify(debugInfo, null, 2) + '\n',
        { flag: 'a' },
      );

      // 4. Retrieve relevant segments
      const retrievedSegments = await this.retrieveRelevantSegments(
        dto.datasetId,
        dto.message,
        dto.documentIds,
        dto.segmentIds,
        effectiveSettings.maxChunks,
      );

      // 5. Generate response using LLM
      if (!effectiveSettings.aiProviderId) {
        throw new Error(
          'No AI provider specified. Please configure dataset chat settings.',
        );
      }

      // Check if conversation history should be included based on dataset settings
      const datasetSettings = (dataset.settings as any) || {};
      const chatSettings = datasetSettings.chat_settings || {};
      const enableConversationHistory =
        chatSettings.enableConversationHistory !== false; // Default to true

      this.logger.log(
        `💬 Conversation history enabled: ${enableConversationHistory}`,
      );

      const assistantMessage = await this.generateResponse(
        dto.message,
        retrievedSegments,
        effectiveSettings.aiProviderId,
        effectiveSettings.model,
        enableConversationHistory ? conversation.messages || [] : [],
        effectiveSettings.promptId,
        effectiveSettings.temperature,
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
          provider: effectiveSettings.llmProvider,
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
          provider: effectiveSettings.llmProvider,
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
          const queryEmbedding = await this.generateQueryEmbedding(
            query,
            datasetId,
          );
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
        const resultsWithDocumentId =
          searchResults?.results?.map((result) => ({
            ...result,
            documentId: documentId,
            semanticScore: result.similarity, // Map similarity to semanticScore for consistency
          })) || [];
        allSegments.push(...resultsWithDocumentId);
      }
      return allSegments.slice(0, maxChunks);
    }

    // Debug: Write to file for easier debugging - after early returns
    const fs2 = require('fs');
    const debugInfo2 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-after-early-returns',
      datasetId: datasetId,
      query: query,
      documentIds: documentIds,
      segmentIds: segmentIds,
      maxChunks: maxChunks,
    };
    fs2.writeFileSync(
      '/tmp/debug-after-early-returns.log',
      JSON.stringify(debugInfo2, null, 2) + '\n',
      { flag: 'a' },
    );

    // Search across all documents in the dataset
    // Debug: Write to file for easier debugging - before dataset fetch
    const fs3 = require('fs');
    const debugInfo3 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-before-dataset-fetch',
      datasetId: datasetId,
    };
    fs3.writeFileSync(
      '/tmp/debug-before-dataset-fetch.log',
      JSON.stringify(debugInfo3, null, 2) + '\n',
      { flag: 'a' },
    );

    const dataset = await this.datasetService.findById(datasetId);

    // Debug: Write to file for easier debugging - after dataset fetch
    const fs4 = require('fs');
    const debugInfo4 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-after-dataset-fetch',
      datasetId: datasetId,
      datasetFound: dataset ? 'Yes' : 'No',
      datasetIdMatch: dataset ? dataset.id === datasetId : 'N/A',
    };
    fs4.writeFileSync(
      '/tmp/debug-after-dataset-fetch.log',
      JSON.stringify(debugInfo4, null, 2) + '\n',
      { flag: 'a' },
    );

    // Debug: Write to file for easier debugging
    const fs = require('fs');
    const debugInfo = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments',
      datasetId: datasetId,
      query: query,
      documentIds: documentIds,
      segmentIds: segmentIds,
      maxChunks: maxChunks,
    };
    fs.writeFileSync(
      '/tmp/debug-retrieve.log',
      JSON.stringify(debugInfo, null, 2) + '\n',
      { flag: 'a' },
    );

    this.logger.log(`🔍 Starting search for dataset ${datasetId}`);
    this.logger.log(`🔍 Dataset found: ${dataset ? 'Yes' : 'No'}`);
    this.logger.log(`🔍 Query: "${query}"`);
    this.logger.log(`🔍 Max chunks: ${maxChunks}`);
    this.logger.log(
      `🔍 Segment IDs: ${segmentIds ? JSON.stringify(segmentIds) : 'undefined'}`,
    );
    this.logger.log(
      `🔍 Document IDs: ${documentIds ? JSON.stringify(documentIds) : 'undefined'}`,
    );

    // If documents relation is not loaded, fetch them directly
    let documents = dataset?.documents;
    this.logger.log(
      `📄 Documents from dataset relation: ${documents?.length || 0}`,
    );

    // Debug: Write to file for easier debugging - before document fetch
    const fs5 = require('fs');
    const debugInfo5 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-before-document-fetch',
      datasetId: datasetId,
      documentsFromRelation: documents?.length || 0,
      documentsArray: documents
        ? documents.map((d) => ({
            id: d.id,
            name: d.name,
            status: d.indexingStatus,
          }))
        : 'undefined',
    };
    fs5.writeFileSync(
      '/tmp/debug-before-document-fetch.log',
      JSON.stringify(debugInfo5, null, 2) + '\n',
      { flag: 'a' },
    );
    if (!documents || documents.length === 0) {
      this.logger.log('📄 Fetching documents directly from database');
      documents = await this.documentService.findByDatasetId(datasetId);
      this.logger.log(`📄 Fetched ${documents.length} documents`);

      // Debug: Log document details
      documents.forEach((doc, index) => {
        this.logger.log(
          `📄 Document ${index + 1}: ${doc.name} (${doc.id}) - Status: ${doc.indexingStatus}`,
        );
      });

      // Debug: Write to file for easier debugging
      const fs = require('fs');
      const debugInfo = {
        timestamp: new Date().toISOString(),
        datasetId: datasetId,
        documentsFound: documents.length,
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          indexingStatus: doc.indexingStatus,
        })),
      };
      fs.writeFileSync(
        '/tmp/debug-documents.log',
        JSON.stringify(debugInfo, null, 2) + '\n',
        { flag: 'a' },
      );
    }

    if (!documents || documents.length === 0) {
      this.logger.warn('❌ No documents found in dataset');
      this.logger.warn(`🔍 DEBUG - Dataset ID: ${datasetId}`);
      this.logger.warn(
        `🔍 DEBUG - Dataset object: ${JSON.stringify(dataset, null, 2)}`,
      );

      // Debug: Write to file for easier debugging - no documents found
      const fs11 = require('fs');
      const debugInfo11 = {
        timestamp: new Date().toISOString(),
        method: 'retrieveRelevantSegments-no-documents-found',
        datasetId: datasetId,
        documentsCount: documents ? documents.length : 'null',
      };
      fs11.writeFileSync(
        '/tmp/debug-no-documents-found.log',
        JSON.stringify(debugInfo11, null, 2) + '\n',
        { flag: 'a' },
      );

      return [];
    }

    // Debug: Write to file for easier debugging - after documents check
    const fs12 = require('fs');
    const debugInfo12 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-after-documents-check',
      datasetId: datasetId,
      documentsCount: documents.length,
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.indexingStatus,
      })),
    };
    fs12.writeFileSync(
      '/tmp/debug-after-documents-check.log',
      JSON.stringify(debugInfo12, null, 2) + '\n',
      { flag: 'a' },
    );

    // Search across all documents in the dataset
    this.logger.log(`🔍 Searching across ${documents.length} documents`);

    const allSegments = [];
    this.logger.log(`🔍 Processing ${documents.length} documents:`);

    // Debug: Write to file for easier debugging - before search loop
    const fs6 = require('fs');
    const debugInfo6 = {
      timestamp: new Date().toISOString(),
      method: 'retrieveRelevantSegments-before-search-loop',
      datasetId: datasetId,
      documentsCount: documents.length,
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.indexingStatus,
      })),
    };
    fs6.writeFileSync(
      '/tmp/debug-before-search-loop.log',
      JSON.stringify(debugInfo6, null, 2) + '\n',
      { flag: 'a' },
    );

    for (const document of documents) {
      // Debug: Write to file for easier debugging - at start of loop iteration
      const fs10 = require('fs');
      const debugInfo10 = {
        timestamp: new Date().toISOString(),
        method: 'retrieveRelevantSegments-start-loop-iteration',
        datasetId: datasetId,
        documentId: document.id,
        documentName: document.name,
        documentStatus: document.indexingStatus,
      };
      fs10.writeFileSync(
        '/tmp/debug-start-loop-iteration.log',
        JSON.stringify(debugInfo10, null, 2) + '\n',
        { flag: 'a' },
      );

      this.logger.log(
        `🔍 Searching document: ${document.name} (${document.id}) - Status: ${document.indexingStatus}`,
      );

      // Skip documents that are not completed
      if (document.indexingStatus !== 'completed') {
        this.logger.warn(
          `⚠️ Skipping document ${document.name} - Status: ${document.indexingStatus}`,
        );
        continue;
      }

      // Debug: Write to file for easier debugging - inside search loop
      const fs7 = require('fs');
      const debugInfo7 = {
        timestamp: new Date().toISOString(),
        method: 'retrieveRelevantSegments-inside-search-loop',
        datasetId: datasetId,
        documentId: document.id,
        documentName: document.name,
        documentStatus: document.indexingStatus,
      };
      fs7.writeFileSync(
        '/tmp/debug-inside-search-loop.log',
        JSON.stringify(debugInfo7, null, 2) + '\n',
        { flag: 'a' },
      );

      let searchResults;
      try {
        // Use only semantic search (like Python script) - no hybrid fallback
        try {
          this.logger.log(
            `🧠 Using semantic-only search for ${document.name} (matching Python implementation)...`,
          );

          // Debug: Write to file for easier debugging - before search call
          const fs9 = require('fs');
          const debugInfo9 = {
            timestamp: new Date().toISOString(),
            method: 'retrieveRelevantSegments-before-search-call',
            datasetId: datasetId,
            documentId: document.id,
            documentName: document.name,
            query: query,
            maxChunks: maxChunks,
          };
          fs9.writeFileSync(
            '/tmp/debug-before-search-call.log',
            JSON.stringify(debugInfo9, null, 2) + '\n',
            { flag: 'a' },
          );

          searchResults = await this.hybridSearchService.semanticOnlySearch(
            document.id,
            query,
            maxChunks,
            0.0, // No threshold filtering - just take top K results
          );

          // Debug: Write to file for easier debugging - after search call
          const fs8 = require('fs');
          const debugInfo8 = {
            timestamp: new Date().toISOString(),
            method: 'retrieveRelevantSegments-after-search-call',
            datasetId: datasetId,
            documentId: document.id,
            documentName: document.name,
            searchResultsCount: searchResults
              ? searchResults.results.length
              : 'null',
            searchResults: searchResults
              ? searchResults.results.map((r) => ({
                  id: r.id,
                  content: r.content.substring(0, 100) + '...',
                  similarity: r.similarity,
                }))
              : 'null',
          };
          fs8.writeFileSync(
            '/tmp/debug-after-search-call.log',
            JSON.stringify(debugInfo8, null, 2) + '\n',
            { flag: 'a' },
          );

          // Try hybrid search as fallback if semantic search returns no results
          if (
            !searchResults ||
            !searchResults.results ||
            searchResults.results.length === 0
          ) {
            this.logger.warn(
              `⚠️ Semantic search returned no results for ${document.name} - trying hybrid search fallback`,
            );
            this.logger.warn(
              `🔍 DEBUG - Search query: "${query}", Document ID: ${document.id}, Max chunks: ${maxChunks}`,
            );

            try {
              // Use dataset's weight settings if available, otherwise use defaults
              const semanticWeight = dataset?.embeddingWeight || 0.7;
              const keywordWeight = dataset?.bm25Weight || 0.3;

              this.logger.log(
                `🔍 Using dataset weights: semantic=${semanticWeight}, keyword=${keywordWeight}`,
              );

              const hybridResults = await this.hybridSearchService.hybridSearch(
                document.id,
                query,
                maxChunks,
                semanticWeight,
                keywordWeight,
                RerankerType.MATHEMATICAL,
              );

              if (hybridResults.results && hybridResults.results.length > 0) {
                this.logger.log(
                  `✅ Hybrid search fallback found ${hybridResults.results.length} results for ${document.name}`,
                );
                searchResults = hybridResults;
              } else {
                this.logger.warn(
                  `❌ Hybrid search fallback also returned no results for ${document.name}`,
                );
              }
            } catch (hybridError) {
              this.logger.error(
                `❌ Hybrid search fallback failed for ${document.name}: ${hybridError.message}`,
              );
            }
          }

          this.logger.log(
            `✅ Search successful for ${document.name} - found ${searchResults?.results?.length || 0} results`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Search failed for ${document.name}: ${error.message}`,
          );
          // Create empty results instead of failing completely
          searchResults = {
            results: [],
            query,
            count: 0,
            message: `Search failed: ${error.message}`,
          };
        }
        this.logger.log(
          `📊 Found ${searchResults?.results?.length || 0} segments in ${document.name}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Hybrid search failed for document ${document.name}: ${error.message}`,
        );
        continue;
      }
      if (searchResults?.results?.length > 0) {
        this.logger.log(
          `  First segment preview: ${searchResults.results[0].content.substring(0, 100)}...`,
        );
      }
      // Add documentId to each search result
      const resultsWithDocumentId =
        searchResults?.results?.map((result) => ({
          ...result,
          documentId: document.id,
          semanticScore: result.similarity, // Map similarity to semanticScore for consistency
        })) || [];
      allSegments.push(...resultsWithDocumentId);
    }

    this.logger.log(`📊 Found ${allSegments.length} segments`);

    // Debug: Log all segments found
    allSegments.forEach((segment, index) => {
      this.logger.log(
        `🔍 Segment ${index + 1}: similarity=${segment.similarity}, content=${segment.content.substring(0, 100)}...`,
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
      `🔍 After deduplication: ${uniqueSegments.length} unique segments`,
    );

    // Sort segments by similarity score (highest first) before final selection
    const sortedSegments = uniqueSegments.sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0),
    );

    // Take top K segments by similarity (no quality filtering)
    const finalSegments = sortedSegments.slice(0, maxChunks);

    this.logger.log(
      `🔍 Selected top ${finalSegments.length} segments by similarity (no quality filtering)`,
    );

    this.logger.log(`🎯 Returning ${finalSegments.length} final segments`);

    // Debug: Log final segments
    finalSegments.forEach((segment, index) => {
      this.logger.log(
        `🎯 Final segment ${index + 1}: similarity=${segment.similarity}, content=${segment.content.substring(0, 100)}...`,
      );
    });

    return finalSegments;
  }

  private async generateResponse(
    query: string,
    segments: any[],
    aiProviderId: string,
    model?: string,
    conversationHistory: ChatMessage[] = [],
    promptId?: string,
    temperature?: number,
  ): Promise<{ content: string; tokensUsed?: number; model: string }> {
    this.logger.log(`🤖 Generating response using AI provider ${aiProviderId}`);

    // Fetch AI provider from database
    const aiProvider =
      await this.aiProviderService.findAiProviderById(aiProviderId);
    if (!aiProvider) {
      throw new Error(`AI Provider with ID ${aiProviderId} not found`);
    }

    this.logger.log(`🔍 AI provider found: ${JSON.stringify(aiProvider)}`);

    // Resolve provider type to LLMProvider enum
    const providerTypeMap = {
      openai: LLMProvider.OPENROUTER,
      anthropic: LLMProvider.OPENROUTER,
      openrouter: LLMProvider.OPENROUTER,
      dashscope: LLMProvider.DASHSCOPE,
      perplexity: LLMProvider.PERPLEXITY,
      custom: LLMProvider.OLLAMA,
    };

    const resolvedProvider =
      providerTypeMap[aiProvider.type] || LLMProvider.DASHSCOPE;
    this.logger.log(
      `🔍 Resolved provider type ${aiProvider.type} to ${resolvedProvider}`,
    );

    // Validate model exists in provider's model list
    const modelToUse =
      model ||
      (aiProvider.models && aiProvider.models.length > 0
        ? aiProvider.models[0].id
        : null);
    if (!modelToUse) {
      throw new Error(`No model specified for provider ${aiProvider.name}`);
    }

    // Check if model exists in provider's model list
    const modelExists = aiProvider.models?.some((m) => m.id === modelToUse);
    if (!modelExists) {
      throw new Error(
        `Model ${modelToUse} is not available for provider ${aiProvider.name}. Available models: ${aiProvider.models?.map((m) => m.id).join(', ') || 'none'}`,
      );
    }

    // Build context from segments
    const context = segments
      .map((segment, index) => `[${index + 1}] ${segment.content}`)
      .join('\n\n');

    // Debug logging
    this.logger.log(
      `🔍 DEBUG - Retrieved ${segments.length} segments for query: "${query}"`,
    );
    segments.forEach((segment, index) => {
      this.logger.log(
        `  Segment ${index + 1}: ${segment.content.substring(0, 100)}...`,
      );
    });
    this.logger.log(`🔍 DEBUG - Context length: ${context.length} characters`);
    this.logger.log(
      `🔍 DEBUG - Context preview: ${context.substring(0, 200)}...`,
    );

    // Build conversation history - Add history BEFORE the current question
    const messages: LLMMessage[] = [];

    // Add conversation history (last 10 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Load prompt template if specified
    let systemPrompt = `You are a helpful assistant that answers questions based on the provided context.

INSTRUCTIONS:
- First, try to answer using information from the provided context
- If the answer is not available in the context, you may use your general knowledge
- Always indicate whether your answer comes from the context or general knowledge
- Prioritize accuracy - it's better to give a correct answer than to say "not available"
- Be specific and concise in your answers
- When using general knowledge, ensure it's relevant to the question topic

Context:
${context}

Question: ${query}
Answer:`;

    if (promptId) {
      try {
        const prompt = await this.promptService.findPromptById(promptId);
        if (prompt) {
          // Use custom prompt template
          systemPrompt = prompt.systemPrompt;

          // Replace placeholders in the prompt (support both single and double curly braces)
          systemPrompt = systemPrompt.replace(/\{\{context\}\}/g, context);
          systemPrompt = systemPrompt.replace(/\{context\}/g, context);
          systemPrompt = systemPrompt.replace(/\{\{question\}\}/g, query);
          systemPrompt = systemPrompt.replace(/\{query\}/g, query);

          // If there's a user prompt template, use it for the user message
          if (prompt.userPromptTemplate) {
            const userPrompt = prompt.userPromptTemplate
              .replace(/\{\{context\}\}/g, context)
              .replace(/\{context\}/g, context)
              .replace(/\{\{question\}\}/g, query)
              .replace(/\{query\}/g, query);

            messages.push({
              role: 'system',
              content: systemPrompt,
            });

            messages.push({
              role: 'user',
              content: userPrompt,
            });
          } else {
            messages.push({
              role: 'system',
              content: systemPrompt,
            });
          }
        } else {
          // Fallback to default if prompt not found
          messages.push({
            role: 'system',
            content: systemPrompt,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to load prompt ${promptId}: ${error.message}`);
        // Fallback to default
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }
    } else {
      // Use default prompt
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Debug final prompt
    this.logger.log(
      `🔍 DEBUG - Final prompt: ${JSON.stringify(messages, null, 2)}`,
    );

    // Get LLM client for all providers (including local)
    const apiProvider = this.mapToApiProvider(resolvedProvider);
    const llmClient = this.apiClientFactory.getLLMClient(apiProvider);

    // Generate response
    const response = await llmClient.chatCompletion(
      messages,
      modelToUse,
      undefined,
      temperature || 0.7,
    );

    // Debug response
    this.logger.log(
      `🔍 DEBUG - LLM Response: ${response.data.choices[0].message.content}`,
    );

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
    try {
      // Fetch AI providers from database using repository directly
      const aiProviders = await this.aiProviderRepository.find({
        where: {},
        relations: [],
      });

      console.log('Processing AI providers from database:', aiProviders.length);
      const result = [];

      for (const aiProvider of aiProviders) {
        console.log(
          `Processing AI provider: ${aiProvider.name} (${aiProvider.type})`,
        );

        // Map AI provider type to LLMProvider enum
        const providerTypeMap: Record<string, LLMProvider> = {
          openai: LLMProvider.OPENROUTER,
          anthropic: LLMProvider.OPENROUTER,
          openrouter: LLMProvider.OPENROUTER,
          dashscope: LLMProvider.DASHSCOPE,
          perplexity: LLMProvider.PERPLEXITY,
          custom: LLMProvider.OLLAMA,
        };

        const provider =
          providerTypeMap[aiProvider.type] || LLMProvider.DASHSCOPE;
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

        // Convert AI provider models to the expected format
        const models = (aiProvider.models || []).map((model: any) => ({
          id: model.id,
          name: model.name || model.id,
          provider: provider,
          description: model.description || '',
          maxTokens: model.maxTokens,
          contextWindow: model.contextWindow,
          pricing: model.pricing,
          available: isAvailable,
          availabilityMessage: availabilityMessage,
        }));

        result.push({
          id: aiProvider.id, // Use AI provider UUID as ID
          name: aiProvider.name,
          type: aiProvider.type,
          provider: provider, // Include resolved LLMProvider enum for backward compatibility
          models: models,
          available: isAvailable,
          availabilityMessage: availabilityMessage,
        });
        console.log(
          `Added AI provider to result: ${aiProvider.name} (${aiProvider.id}), available: ${isAvailable}`,
        );
      }

      console.log(
        'Final result providers:',
        result.map((p) => p.name),
      );
      return { providers: result };
    } catch (error) {
      this.logger.error(`Failed to fetch AI providers: ${error.message}`);
      // Fallback to empty result instead of crashing
      return { providers: [] };
    }
  }

  private async checkLocalApiAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.LOCAL_API);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).isServiceAvailable();
    } catch {
      return false;
    }
  }

  private async checkOllamaAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.OLLAMA);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).isServiceAvailable();
    } catch {
      return false;
    }
  }

  private async checkDashScopeAvailability(): Promise<boolean> {
    try {
      const apiProvider = this.mapToApiProvider(LLMProvider.DASHSCOPE);
      const client = this.apiClientFactory.getLLMClient(apiProvider);
      return await (client as any).healthCheck();
    } catch {
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

    // Test 3: Check segments and embeddings
    let totalSegments = 0;
    let segmentsWithEmbeddings = 0;
    const documentStats = [];

    for (const doc of documents) {
      const segments = await this.documentSegmentService.find({
        where: { documentId: doc.id },
        relations: ['embedding'],
      });

      const segmentsWithEmb = segments.filter(
        (seg) => seg.embedding?.embedding,
      );

      totalSegments += segments.length;
      segmentsWithEmbeddings += segmentsWithEmb.length;

      documentStats.push({
        documentId: doc.id,
        documentName: doc.name,
        totalSegments: segments.length,
        segmentsWithEmbeddings: segmentsWithEmb.length,
        sampleContent: segments
          .slice(0, 2)
          .map((s) => s.content.substring(0, 100) + '...'),
      });
    }

    this.logger.log(`Total segments: ${totalSegments}`);
    this.logger.log(`Segments with embeddings: ${segmentsWithEmbeddings}`);

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
      segmentStats: {
        totalSegments,
        segmentsWithEmbeddings,
        documentStats,
      },
    };
  }

  /**
   * Generate query embedding for similarity calculation
   * Uses the dataset's embedding configuration for consistency
   */
  private async generateQueryEmbedding(
    query: string,
    datasetId: string,
  ): Promise<number[] | null> {
    try {
      // Get dataset to retrieve embedding configuration
      const dataset = await this.datasetService.findById(datasetId);
      if (!dataset) {
        this.logger.warn(
          `Dataset ${datasetId} not found, using fallback embedding config`,
        );
        return this.generateQueryEmbeddingWithFallback(query);
      }

      // Use dataset's embedding configuration
      const embeddingModel = dataset.embeddingModel as EmbeddingModel;
      const embeddingProvider =
        (dataset.embeddingModelProvider as EmbeddingProvider) ||
        EmbeddingProvider.LOCAL;

      this.logger.log(
        `Using dataset embedding config: model=${embeddingModel}, provider=${embeddingProvider}`,
      );

      const result = await this.embeddingService.generateEmbedding(
        query,
        embeddingModel,
        embeddingProvider,
      );
      return result.embedding;
    } catch (error) {
      this.logger.warn(
        `Failed to generate query embedding with dataset config: ${error.message}`,
      );
      // Fallback to default configuration
      return this.generateQueryEmbeddingWithFallback(query);
    }
  }

  /**
   * Fallback method for query embedding generation
   */
  private async generateQueryEmbeddingWithFallback(
    query: string,
  ): Promise<number[] | null> {
    try {
      this.logger.log('Using fallback embedding configuration');
      const result = await this.embeddingService.generateEmbedding(
        query,
        EmbeddingModel.XENOVA_BGE_M3, // Use a model that's actually available in LocalEmbeddingClient
        EmbeddingProvider.LOCAL,
      );
      return result.embedding;
    } catch (error) {
      this.logger.error(
        `Failed to generate query embedding with fallback: ${error.message}`,
      );
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
