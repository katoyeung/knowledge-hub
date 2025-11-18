import { Test, TestingModule } from '@nestjs/testing';
import { PostProcessingPolicy } from './post-processing-policy';
import { PostContentExtractionStrategy } from '../strategies/post-content-extraction-strategy';
import { PostResultApplicationStrategy } from '../strategies/post-result-application-strategy';
import { PostStatus } from '../../../../posts/enums/post-status.enum';
import { FieldMappingConfig } from '../interfaces/result-application-strategy.interface';

describe('PostProcessingPolicy', () => {
  let policy: PostProcessingPolicy;
  let contentExtractionStrategy: PostContentExtractionStrategy;
  let resultApplicationStrategy: PostResultApplicationStrategy;

  const mockContentExtractionStrategy = {
    getEntityType: jest.fn().mockReturnValue('post'),
    extractContent: jest.fn(),
    getEntityId: jest.fn(),
    extractTemplateVariables: jest.fn(),
  };

  const mockResultApplicationStrategy = {
    getEntityType: jest.fn().mockReturnValue('post'),
    applyResult: jest.fn(),
    handleError: jest.fn(),
    getSupportedResultSchemas: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostProcessingPolicy,
        {
          provide: PostContentExtractionStrategy,
          useValue: mockContentExtractionStrategy,
        },
        {
          provide: PostResultApplicationStrategy,
          useValue: mockResultApplicationStrategy,
        },
      ],
    }).compile();

    policy = module.get<PostProcessingPolicy>(PostProcessingPolicy);
    contentExtractionStrategy = module.get<PostContentExtractionStrategy>(
      PostContentExtractionStrategy,
    );
    resultApplicationStrategy = module.get<PostResultApplicationStrategy>(
      PostResultApplicationStrategy,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(policy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(policy.getEntityType()).toBe('post');
  });

  it('should return content extraction strategy', () => {
    expect(policy.getContentExtractionStrategy()).toBe(
      contentExtractionStrategy,
    );
  });

  it('should return result application strategy', () => {
    expect(policy.getResultApplicationStrategy()).toBe(
      resultApplicationStrategy,
    );
  });

  describe('getDefaultFieldMappings', () => {
    it('should return default field mappings for approval use case', () => {
      const mappings = policy.getDefaultFieldMappings();

      expect(mappings).not.toBeNull();
      expect(mappings?.mappings.status).toBeDefined();
      expect(mappings?.mappings.approvalReason).toBe('reason');
      expect(mappings?.mappings.confidenceScore).toBe('confidenceScore');
      expect(mappings?.enumConversions?.status).toBeDefined();
      expect(mappings?.statusField).toBe('status');
      expect(mappings?.statusValues?.pending).toBe(PostStatus.PENDING);
      expect(mappings?.statusValues?.error).toBe(PostStatus.PENDING);
    });
  });

  describe('process', () => {
    it('should process entity with LLM result', async () => {
      const entityId = 'post-1';
      const llmResult = {
        status: 'approved',
        reason: 'Content is good',
        confidenceScore: 0.9,
      };

      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: 'status',
          approvalReason: 'reason',
        },
      };

      mockResultApplicationStrategy.applyResult.mockResolvedValue(undefined);

      await policy.process(entityId, llmResult, fieldMappings);

      expect(mockResultApplicationStrategy.applyResult).toHaveBeenCalledWith(
        entityId,
        llmResult,
        fieldMappings,
        undefined,
      );
    });

    it('should pass metadata to result application strategy', async () => {
      const entityId = 'post-1';
      const llmResult = { status: 'approved' };
      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
      };
      const metadata = { userId: 'user-1' };

      mockResultApplicationStrategy.applyResult.mockResolvedValue(undefined);

      await policy.process(entityId, llmResult, fieldMappings, metadata);

      expect(mockResultApplicationStrategy.applyResult).toHaveBeenCalledWith(
        entityId,
        llmResult,
        fieldMappings,
        metadata,
      );
    });
  });
});
