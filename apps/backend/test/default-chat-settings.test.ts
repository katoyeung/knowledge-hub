import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from '../src/modules/chat/services/chat.service';
import { DatasetService } from '../src/modules/dataset/dataset.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatMessage } from '../src/modules/chat/entities/chat-message.entity';
import { ChatConversation } from '../src/modules/chat/entities/chat-conversation.entity';
import { AiProvider } from '../src/modules/ai-provider/entities/ai-provider.entity';
import { DocumentSegment } from '../src/modules/dataset/entities/document-segment.entity';
import { DocumentSegmentService } from '../src/modules/dataset/document-segment.service';
import { DocumentService } from '../src/modules/dataset/document.service';
import { HybridSearchService } from '../src/modules/dataset/services/hybrid-search.service';
import { EmbeddingV2Service } from '../src/modules/dataset/services/embedding-v2.service';
import { ApiClientFactory } from '../src/common/services/api-client-factory.service';
import { ModelConfigService } from '../src/modules/chat/services/model-config.service';
import { PromptService } from '../src/modules/prompts/services/prompt.service';
import { AiProviderService } from '../src/modules/ai-provider/services/ai-provider.service';
import { SegmentRetrievalService } from '../src/modules/chat/services/segment-retrieval.service';
import { ResponseGeneratorService } from '../src/modules/chat/services/response-generator.service';
import { AiProviderConfigResolver } from '../src/modules/ai-provider/services/ai-provider-config-resolver.service';
import { LLMClientFactory } from '../src/modules/ai-provider/services/llm-client-factory.service';
import { DebugLogger } from '../src/common/services/debug-logger.service';
import { ChatWithDocumentsDto } from '../src/modules/chat/dto/chat-with-documents.dto';
import { LLMProvider } from '../src/modules/chat/services/model-config.service';

describe('Default Chat Settings Fallback', () => {
  let chatService: ChatService;
  let datasetService: DatasetService;

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockDatasetService = {
    findById: jest.fn(),
  };

  const mockDocumentSegmentService = {
    searchSegments: jest.fn(),
  };

  const mockDocumentService = {
    findById: jest.fn(),
    findByDatasetId: jest.fn(),
  };

  const mockHybridSearchService = {
    search: jest.fn(),
  };

  const mockEmbeddingService = {
    generateEmbedding: jest.fn(),
  };

  const mockApiClientFactory = {
    createClient: jest.fn(),
    getLLMClient: jest.fn(),
  };

  const mockModelConfigService = {
    getModelConfig: jest.fn(),
  };

  const mockPromptService = {
    findById: jest.fn(),
  };

  const mockAiProviderService = {
    findAiProviderById: jest.fn(),
    findAiProviderByType: jest.fn(),
  };

  const mockSegmentRetrievalService = {
    retrieveRelevantSegments: jest.fn(),
  };

  const mockResponseGeneratorService = {
    generateResponse: jest.fn(),
  };

  const mockAiProviderConfigResolver = {
    resolveForDataset: jest.fn(),
  };

  const mockLLMClientFactory = {
    createClient: jest.fn(),
    getLLMClient: jest.fn(),
  };

  const mockDebugLogger = {
    logChatProcess: jest.fn(),
    logSegmentRetrieval: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(ChatConversation),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(AiProvider),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(DocumentSegment),
          useValue: mockRepository,
        },
        {
          provide: DatasetService,
          useValue: mockDatasetService,
        },
        {
          provide: DocumentSegmentService,
          useValue: mockDocumentSegmentService,
        },
        {
          provide: DocumentService,
          useValue: mockDocumentService,
        },
        {
          provide: HybridSearchService,
          useValue: mockHybridSearchService,
        },
        {
          provide: EmbeddingV2Service,
          useValue: mockEmbeddingService,
        },
        {
          provide: ApiClientFactory,
          useValue: mockApiClientFactory,
        },
        {
          provide: ModelConfigService,
          useValue: mockModelConfigService,
        },
        {
          provide: PromptService,
          useValue: mockPromptService,
        },
        {
          provide: AiProviderService,
          useValue: mockAiProviderService,
        },
        {
          provide: SegmentRetrievalService,
          useValue: mockSegmentRetrievalService,
        },
        {
          provide: ResponseGeneratorService,
          useValue: mockResponseGeneratorService,
        },
        {
          provide: AiProviderConfigResolver,
          useValue: mockAiProviderConfigResolver,
        },
        {
          provide: LLMClientFactory,
          useValue: mockLLMClientFactory,
        },
        {
          provide: DebugLogger,
          useValue: mockDebugLogger,
        },
      ],
    }).compile();

    chatService = module.get<ChatService>(ChatService);
    datasetService = module.get<DatasetService>(DatasetService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should use default chat settings when dataset chat settings are null', async () => {
    // Mock dataset with null chat settings
    const mockDataset = {
      id: 'test-dataset-id',
      name: 'Test Dataset',
      settings: {
        chat_settings: {
          provider: null,
          model: null,
          temperature: null,
          maxChunks: null,
        },
      },
    };

    mockDatasetService.findById.mockResolvedValue(mockDataset);
    mockRepository.findOne.mockResolvedValue({ id: 'test-conversation-id' });
    mockRepository.save.mockResolvedValue({ id: 'test-message-id' });

    // Mock AI provider config resolver
    mockAiProviderConfigResolver.resolveForDataset.mockResolvedValue({
      provider: {
        id: 'openrouter-provider-id',
        type: 'openrouter',
      },
      model: 'qwen/qwen3-30b-a3b:free',
      temperature: 0.7,
      maxChunks: 5,
      includeConversationHistory: false,
      conversationHistoryLimit: 10,
      bm25Weight: 0.3,
      embeddingWeight: 0.7,
    });

    // Mock segment retrieval
    mockSegmentRetrievalService.retrieveRelevantSegments.mockResolvedValue([
      {
        id: 'segment-1',
        content: 'Test segment content',
        similarity: 0.9,
        documentId: 'doc-1',
      },
    ]);

    // Mock response generator
    mockResponseGeneratorService.generateResponse.mockResolvedValue({
      content: 'Test response',
      tokensUsed: 100,
      model: 'qwen/qwen3-30b-a3b:free',
    });

    const dto: ChatWithDocumentsDto = {
      message: 'Test message',
      datasetId: 'test-dataset-id',
      maxChunks: 5,
      temperature: 0.7,
    };

    const userId = 'test-user-id';

    // This should not throw an error and should use default settings
    await expect(
      chatService.chatWithDocuments(dto, userId),
    ).resolves.toBeDefined();

    // Verify that the AI provider config resolver was called
    expect(mockAiProviderConfigResolver.resolveForDataset).toHaveBeenCalledWith(
      'test-dataset-id',
      userId,
    );

    // Verify that segment retrieval was called
    expect(
      mockSegmentRetrievalService.retrieveRelevantSegments,
    ).toHaveBeenCalled();

    // Verify that response generation was called
    expect(mockResponseGeneratorService.generateResponse).toHaveBeenCalled();
  });

  it('should use default chat settings when dataset has no settings', async () => {
    // Mock dataset with no settings
    const mockDataset = {
      id: 'test-dataset-id',
      name: 'Test Dataset',
      settings: null,
    };

    mockDatasetService.findById.mockResolvedValue(mockDataset);
    mockRepository.findOne.mockResolvedValue({ id: 'test-conversation-id' });
    mockRepository.save.mockResolvedValue({ id: 'test-message-id' });

    // Mock AI provider config resolver
    mockAiProviderConfigResolver.resolveForDataset.mockResolvedValue({
      provider: {
        id: 'openrouter-provider-id',
        type: 'openrouter',
      },
      model: 'qwen/qwen3-30b-a3b:free',
      temperature: 0.7,
      maxChunks: 5,
      includeConversationHistory: false,
      conversationHistoryLimit: 10,
      bm25Weight: 0.3,
      embeddingWeight: 0.7,
    });

    // Mock segment retrieval
    mockSegmentRetrievalService.retrieveRelevantSegments.mockResolvedValue([
      {
        id: 'segment-1',
        content: 'Test segment content',
        similarity: 0.9,
        documentId: 'doc-1',
      },
    ]);

    // Mock response generator
    mockResponseGeneratorService.generateResponse.mockResolvedValue({
      content: 'Test response',
      tokensUsed: 100,
      model: 'qwen/qwen3-30b-a3b:free',
    });

    const dto: ChatWithDocumentsDto = {
      message: 'Test message',
      datasetId: 'test-dataset-id',
      maxChunks: 5,
      temperature: 0.7,
    };

    const userId = 'test-user-id';

    // This should not throw an error and should use default settings
    await expect(
      chatService.chatWithDocuments(dto, userId),
    ).resolves.toBeDefined();

    // Verify that the AI provider config resolver was called
    expect(mockAiProviderConfigResolver.resolveForDataset).toHaveBeenCalledWith(
      'test-dataset-id',
      userId,
    );

    // Verify that segment retrieval was called
    expect(
      mockSegmentRetrievalService.retrieveRelevantSegments,
    ).toHaveBeenCalled();

    // Verify that response generation was called
    expect(mockResponseGeneratorService.generateResponse).toHaveBeenCalled();
  });
});
