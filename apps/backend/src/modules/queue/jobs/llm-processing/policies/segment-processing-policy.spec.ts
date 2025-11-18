import { Test, TestingModule } from '@nestjs/testing';
import { SegmentProcessingPolicy } from './segment-processing-policy';
import { SegmentContentExtractionStrategy } from '../strategies/segment-content-extraction-strategy';
import { SegmentResultApplicationStrategy } from '../strategies/segment-result-application-strategy';
import { FieldMappingConfig } from '../interfaces/result-application-strategy.interface';

describe('SegmentProcessingPolicy', () => {
  let policy: SegmentProcessingPolicy;
  let contentExtractionStrategy: SegmentContentExtractionStrategy;
  let resultApplicationStrategy: SegmentResultApplicationStrategy;

  const mockContentExtractionStrategy = {
    getEntityType: jest.fn().mockReturnValue('segment'),
    extractContent: jest.fn(),
    getEntityId: jest.fn(),
    extractTemplateVariables: jest.fn(),
  };

  const mockResultApplicationStrategy = {
    getEntityType: jest.fn().mockReturnValue('segment'),
    applyResult: jest.fn(),
    handleError: jest.fn(),
    getSupportedResultSchemas: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SegmentProcessingPolicy,
        {
          provide: SegmentContentExtractionStrategy,
          useValue: mockContentExtractionStrategy,
        },
        {
          provide: SegmentResultApplicationStrategy,
          useValue: mockResultApplicationStrategy,
        },
      ],
    }).compile();

    policy = module.get<SegmentProcessingPolicy>(SegmentProcessingPolicy);
    contentExtractionStrategy = module.get<SegmentContentExtractionStrategy>(
      SegmentContentExtractionStrategy,
    );
    resultApplicationStrategy = module.get<SegmentResultApplicationStrategy>(
      SegmentResultApplicationStrategy,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(policy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(policy.getEntityType()).toBe('segment');
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
    it('should return default field mappings for segment use case', () => {
      const mappings = policy.getDefaultFieldMappings();

      expect(mappings).not.toBeNull();
      expect(mappings?.mappings.status).toBe('status');
      expect(mappings?.mappings['hierarchyMetadata.extractedData']).toBe(
        'extractedData',
      );
      expect(mappings?.mappings['hierarchyMetadata.classification']).toBe(
        'classification',
      );
      expect(mappings?.statusField).toBe('status');
      expect(mappings?.statusValues?.pending).toBe('waiting');
      expect(mappings?.statusValues?.completed).toBe('completed');
      expect(mappings?.statusValues?.error).toBe('error');
    });
  });

  describe('process', () => {
    it('should process entity with LLM result', async () => {
      const entityId = 'segment-1';
      const llmResult = {
        status: 'completed',
        extractedData: { key: 'value' },
      };

      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: 'status',
          'hierarchyMetadata.data': 'extractedData',
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
  });
});
