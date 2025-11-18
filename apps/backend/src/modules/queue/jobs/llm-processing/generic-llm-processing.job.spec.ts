import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { GenericLLMProcessingJob } from './generic-llm-processing.job';
import { ProcessingPolicyFactory } from './factories/processing-policy-factory';
import { PromptService } from '../../../../prompts/services/prompt.service';
import { AiProviderService } from '../../../../ai-provider/services/ai-provider.service';
import { LLMClientFactory } from '../../../../ai-provider/services/llm-client-factory.service';
import { LLMExtractionService } from '@common/services/llm-extraction.service';
import { EventBusService } from '../../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../../services/job-dispatcher.service';
import { Post } from '../../../../posts/entities/post.entity';
import { DocumentSegment } from '../../../../dataset/entities/document-segment.entity';
import { PostStatus } from '../../../../posts/enums/post-status.enum';
import { EntityProcessingPolicy } from './interfaces/entity-processing-policy.interface';
import { ContentExtractionStrategy } from './interfaces/content-extraction-strategy.interface';
import { ResultApplicationStrategy } from './interfaces/result-application-strategy.interface';
import { FieldMappingConfig } from './interfaces/result-application-strategy.interface';

describe('GenericLLMProcessingJob', () => {
  let job: GenericLLMProcessingJob;
  let postRepository: Repository<Post>;
  let segmentRepository: Repository<DocumentSegment>;
  let processingPolicyFactory: ProcessingPolicyFactory;
  let promptService: PromptService;
  let aiProviderService: AiProviderService;
  let llmClientFactory: LLMClientFactory;
  let llmExtractionService: LLMExtractionService;
  let eventBus: EventBusService;
  let jobDispatcher: JobDispatcherService;

  const mockPostRepository = {
    findOne: jest.fn(),
  };

  const mockSegmentRepository = {
    findOne: jest.fn(),
  };

  const mockProcessingPolicyFactory = {
    getPolicy: jest.fn(),
  };

  const mockPromptService = {
    findPromptById: jest.fn(),
  };

  const mockAiProviderService = {
    findOne: jest.fn(),
  };

  const mockLLMClientFactory = {
    createClient: jest.fn(),
  };

  const mockLLMExtractionService = {
    extractWithLLM: jest.fn(),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  const mockJobDispatcher = {
    dispatch: jest.fn(),
  };

  const mockLLMClient = {
    chatCompletion: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenericLLMProcessingJob,
        {
          provide: getRepositoryToken(Post),
          useValue: mockPostRepository,
        },
        {
          provide: getRepositoryToken(DocumentSegment),
          useValue: mockSegmentRepository,
        },
        {
          provide: ProcessingPolicyFactory,
          useValue: mockProcessingPolicyFactory,
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
          provide: LLMClientFactory,
          useValue: mockLLMClientFactory,
        },
        {
          provide: LLMExtractionService,
          useValue: mockLLMExtractionService,
        },
        {
          provide: EventBusService,
          useValue: mockEventBus,
        },
        {
          provide: JobDispatcherService,
          useValue: mockJobDispatcher,
        },
      ],
    }).compile();

    job = module.get<GenericLLMProcessingJob>(GenericLLMProcessingJob);
    postRepository = module.get<Repository<Post>>(getRepositoryToken(Post));
    segmentRepository = module.get<Repository<DocumentSegment>>(
      getRepositoryToken(DocumentSegment),
    );
    processingPolicyFactory = module.get<ProcessingPolicyFactory>(
      ProcessingPolicyFactory,
    );
    promptService = module.get<PromptService>(PromptService);
    aiProviderService = module.get<AiProviderService>(AiProviderService);
    llmClientFactory = module.get<LLMClientFactory>(LLMClientFactory);
    llmExtractionService =
      module.get<LLMExtractionService>(LLMExtractionService);
    eventBus = module.get<EventBusService>(EventBusService);
    jobDispatcher = module.get<JobDispatcherService>(JobDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('process', () => {
    const mockPost: Partial<Post> = {
      id: 'post-1',
      title: 'Test Post',
      source: 'test',
      provider: 'test',
      status: PostStatus.PENDING,
      meta: {
        content: 'Test content',
      },
    };

    const mockPrompt = {
      id: 'prompt-1',
      name: 'Test Prompt',
      systemPrompt: 'You are a test assistant.',
      userPromptTemplate: 'Analyze: {{content}}',
      jsonSchema: {},
    };

    const mockAiProvider = {
      id: 'provider-1',
      name: 'Test Provider',
      type: 'openai',
      isActive: true,
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com',
    };

    const mockContentExtractionStrategy: ContentExtractionStrategy<any> = {
      getEntityType: jest.fn().mockReturnValue('post'),
      extractContent: jest.fn().mockReturnValue('Extracted content'),
      getEntityId: jest.fn().mockReturnValue('post-1'),
      extractTemplateVariables: jest.fn().mockReturnValue({
        title: 'Test Post',
        source: 'test',
      }),
    };

    const mockResultApplicationStrategy: ResultApplicationStrategy = {
      getEntityType: jest.fn().mockReturnValue('post'),
      applyResult: jest.fn().mockResolvedValue(undefined),
      handleError: jest.fn().mockResolvedValue(undefined),
      getSupportedResultSchemas: jest.fn().mockReturnValue([]),
    };

    const mockPolicy: EntityProcessingPolicy = {
      getEntityType: jest.fn().mockReturnValue('post'),
      getContentExtractionStrategy: jest
        .fn()
        .mockReturnValue(mockContentExtractionStrategy),
      getResultApplicationStrategy: jest
        .fn()
        .mockReturnValue(mockResultApplicationStrategy),
      getDefaultFieldMappings: jest.fn().mockReturnValue({
        mappings: { status: 'status' },
        statusField: 'status',
        statusValues: { pending: PostStatus.PENDING },
      }),
      process: jest.fn().mockResolvedValue(undefined),
    };

    it('should process post successfully', async () => {
      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: {
            from: 'status',
            transform: (v) =>
              v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
          },
        },
      };

      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(mockAiProvider);
      mockLLMClientFactory.createClient.mockReturnValue(mockLLMClient);
      mockLLMExtractionService.extractWithLLM.mockResolvedValue({
        success: true,
        data: {
          status: 'approved',
          reason: 'Content is good',
          confidenceScore: 0.9,
        },
      });

      await job.process({
        entityType: 'post',
        entityId: 'post-1',
        promptId: 'prompt-1',
        aiProviderId: 'provider-1',
        model: 'gpt-4',
        temperature: 0.7,
        userId: 'user-1',
        fieldMappings,
      });

      expect(mockPostRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
      expect(mockProcessingPolicyFactory.getPolicy).toHaveBeenCalledWith(
        'post',
      );
      expect(mockPromptService.findPromptById).toHaveBeenCalledWith('prompt-1');
      expect(mockAiProviderService.findOne).toHaveBeenCalledWith({
        where: { id: 'provider-1' },
      });
      expect(mockLLMClientFactory.createClient).toHaveBeenCalledWith(
        mockAiProvider,
      );
      expect(mockLLMExtractionService.extractWithLLM).toHaveBeenCalled();
      expect(mockPolicy.process).toHaveBeenCalled();
    });

    it('should throw NotFoundException when entity does not exist', async () => {
      mockPostRepository.findOne.mockResolvedValue(null);

      await expect(
        job.process({
          entityType: 'post',
          entityId: 'non-existent',
          promptId: 'prompt-1',
          aiProviderId: 'provider-1',
          model: 'gpt-4',
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when prompt does not exist', async () => {
      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(null);

      await expect(
        job.process({
          entityType: 'post',
          entityId: 'post-1',
          promptId: 'non-existent',
          aiProviderId: 'provider-1',
          model: 'gpt-4',
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when AI provider is not active', async () => {
      const inactiveProvider = {
        ...mockAiProvider,
        isActive: false,
      };

      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(inactiveProvider);

      await expect(
        job.process({
          entityType: 'post',
          entityId: 'post-1',
          promptId: 'prompt-1',
          aiProviderId: 'provider-1',
          model: 'gpt-4',
          userId: 'user-1',
        }),
      ).rejects.toThrow('is not active');
    });

    it('should handle LLM extraction failure', async () => {
      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(mockAiProvider);
      mockLLMClientFactory.createClient.mockReturnValue(mockLLMClient);
      mockLLMExtractionService.extractWithLLM.mockResolvedValue({
        success: false,
        error: 'LLM extraction failed',
      });

      await expect(
        job.process({
          entityType: 'post',
          entityId: 'post-1',
          promptId: 'prompt-1',
          aiProviderId: 'provider-1',
          model: 'gpt-4',
          userId: 'user-1',
        }),
      ).rejects.toThrow('Failed to get result from LLM');
    });

    it('should merge field mappings correctly', async () => {
      const defaultMappings: FieldMappingConfig = {
        mappings: {
          status: 'status',
        },
        statusField: 'status',
        statusValues: {
          pending: PostStatus.PENDING,
        },
      };

      const providedMappings: FieldMappingConfig = {
        mappings: {
          approvalReason: 'reason',
        },
        statusValues: {
          error: PostStatus.PENDING,
        },
      };

      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue({
        ...mockPolicy,
        getDefaultFieldMappings: jest.fn().mockReturnValue(defaultMappings),
      });
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(mockAiProvider);
      mockLLMClientFactory.createClient.mockReturnValue(mockLLMClient);
      mockLLMExtractionService.extractWithLLM.mockResolvedValue({
        success: true,
        data: { status: 'approved' },
      });

      await job.process({
        entityType: 'post',
        entityId: 'post-1',
        promptId: 'prompt-1',
        aiProviderId: 'provider-1',
        model: 'gpt-4',
        userId: 'user-1',
        fieldMappings: providedMappings,
      });

      // Verify that process was called with merged mappings
      const processCall = mockPolicy.process.mock.calls[0];
      const mergedMappings = processCall[2] as FieldMappingConfig;
      expect(mergedMappings.mappings.status).toBeDefined();
      expect(mergedMappings.mappings.approvalReason).toBe('reason');
      expect(mergedMappings.statusValues?.pending).toBe(PostStatus.PENDING);
      expect(mergedMappings.statusValues?.error).toBe(PostStatus.PENDING);
    });

    it('should extract and use template variables', async () => {
      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(mockAiProvider);
      mockLLMClientFactory.createClient.mockReturnValue(mockLLMClient);
      mockLLMExtractionService.extractWithLLM.mockResolvedValue({
        success: true,
        data: { status: 'approved' },
      });

      await job.process({
        entityType: 'post',
        entityId: 'post-1',
        promptId: 'prompt-1',
        aiProviderId: 'provider-1',
        model: 'gpt-4',
        userId: 'user-1',
        templateVariables: {
          customVar: 'custom value',
        },
      });

      // Verify template variables were passed to LLM extraction
      const extractCall = mockLLMExtractionService.extractWithLLM.mock.calls[0];
      const config = extractCall[0];
      expect(config.templateVariables).toBeDefined();
      expect(config.templateVariables?.title).toBe('Test Post');
      expect(config.templateVariables?.source).toBe('test');
      expect(config.templateVariables?.customVar).toBe('custom value');
    });

    it('should handle errors and call error handler', async () => {
      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockProcessingPolicyFactory.getPolicy.mockReturnValue(mockPolicy);
      mockPromptService.findPromptById.mockResolvedValue(mockPrompt);
      mockAiProviderService.findOne.mockResolvedValue(mockAiProvider);
      mockLLMClientFactory.createClient.mockReturnValue(mockLLMClient);
      mockLLMExtractionService.extractWithLLM.mockRejectedValue(
        new Error('LLM error'),
      );

      await expect(
        job.process({
          entityType: 'post',
          entityId: 'post-1',
          promptId: 'prompt-1',
          aiProviderId: 'provider-1',
          model: 'gpt-4',
          userId: 'user-1',
        }),
      ).rejects.toThrow('LLM error');

      // Verify error handler was called
      expect(mockResultApplicationStrategy.handleError).toHaveBeenCalled();
    });
  });
});
