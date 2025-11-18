import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SegmentResultApplicationStrategy } from './segment-result-application-strategy';
import { FieldMappingService } from '../services/field-mapping.service';
import { DocumentSegment } from '../../../../dataset/entities/document-segment.entity';
import {
  FieldMappingConfig,
  ProcessingMetadata,
} from '../interfaces/result-application-strategy.interface';

describe('SegmentResultApplicationStrategy', () => {
  let strategy: SegmentResultApplicationStrategy;
  let segmentRepository: Repository<DocumentSegment>;
  let fieldMappingService: FieldMappingService;

  const mockSegmentRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockFieldMappingService = {
    applyMappings: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SegmentResultApplicationStrategy,
        {
          provide: getRepositoryToken(DocumentSegment),
          useValue: mockSegmentRepository,
        },
        {
          provide: FieldMappingService,
          useValue: mockFieldMappingService,
        },
      ],
    }).compile();

    strategy = module.get<SegmentResultApplicationStrategy>(
      SegmentResultApplicationStrategy,
    );
    segmentRepository = module.get<Repository<DocumentSegment>>(
      getRepositoryToken(DocumentSegment),
    );
    fieldMappingService = module.get<FieldMappingService>(FieldMappingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(strategy.getEntityType()).toBe('segment');
  });

  describe('applyResult', () => {
    it('should apply result to segment successfully', async () => {
      const segmentId = 'segment-1';
      const result = {
        status: 'completed',
        extractedData: { key: 'value' },
        classification: 'positive',
      };

      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: 'status',
          'hierarchyMetadata.extractedData': 'extractedData',
          'hierarchyMetadata.classification': 'classification',
        },
      };

      const metadata: ProcessingMetadata = {
        userId: 'user-1',
        timestamp: new Date(),
      };

      const mockSegment = {
        id: segmentId,
        content: 'Test segment',
        hierarchyMetadata: {},
      };

      const mockUpdateData = {
        hierarchyMetadata: {
          extractedData: { key: 'value' },
          classification: 'positive',
        },
        status: 'completed',
      };

      mockSegmentRepository.findOne.mockResolvedValue(mockSegment);
      mockSegmentRepository.update.mockResolvedValue({ affected: 1 });
      mockFieldMappingService.applyMappings.mockReturnValue(mockUpdateData);

      await strategy.applyResult(segmentId, result, fieldMappings, metadata);

      expect(mockSegmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: segmentId },
      });
      expect(mockFieldMappingService.applyMappings).toHaveBeenCalledWith(
        result,
        fieldMappings,
      );
      expect(mockSegmentRepository.update).toHaveBeenCalled();
    });

    it('should merge meta fields with existing hierarchyMetadata', async () => {
      const segmentId = 'segment-1';
      const result = {
        status: 'completed',
        extractedData: { newKey: 'newValue' },
      };

      const fieldMappings: FieldMappingConfig = {
        mappings: {
          'meta.extractedData': 'extractedData',
        },
      };

      const mockSegment = {
        id: segmentId,
        content: 'Test',
        hierarchyMetadata: {
          existingField: 'existing',
        },
      };

      const mockUpdateData = {
        meta: {
          extractedData: { newKey: 'newValue' },
        },
      };

      mockSegmentRepository.findOne.mockResolvedValue(mockSegment);
      mockSegmentRepository.update.mockResolvedValue({ affected: 1 });
      mockFieldMappingService.applyMappings.mockReturnValue(mockUpdateData);

      await strategy.applyResult(segmentId, result, fieldMappings);

      expect(mockSegmentRepository.update).toHaveBeenCalled();
      const updateCall = mockSegmentRepository.update.mock.calls[0];
      expect(updateCall[1].hierarchyMetadata).toBeDefined();
    });

    it('should throw NotFoundException when segment does not exist', async () => {
      const segmentId = 'non-existent';
      const result = { status: 'completed' };
      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
      };

      mockSegmentRepository.findOne.mockResolvedValue(null);

      await expect(
        strategy.applyResult(segmentId, result, fieldMappings),
      ).rejects.toThrow('Segment with ID non-existent not found');
    });
  });

  describe('handleError', () => {
    it('should handle error and update segment status', async () => {
      const segmentId = 'segment-1';
      const error = new Error('Processing failed');
      const fieldMappings: FieldMappingConfig = {
        statusField: 'status',
        statusValues: {
          error: 'error',
        },
      };

      mockSegmentRepository.update.mockResolvedValue({ affected: 1 });

      await strategy.handleError(segmentId, error, fieldMappings);

      expect(mockSegmentRepository.update).toHaveBeenCalledWith(segmentId, {
        status: 'error',
        error: 'Processing failed',
      });
    });

    it('should handle error gracefully when update fails', async () => {
      const segmentId = 'segment-1';
      const error = new Error('Processing failed');
      const fieldMappings: FieldMappingConfig = {
        statusField: 'status',
        statusValues: {
          error: 'error',
        },
      };

      mockSegmentRepository.update.mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(
        strategy.handleError(segmentId, error, fieldMappings),
      ).resolves.not.toThrow();
    });
  });

  describe('getSupportedResultSchemas', () => {
    it('should return empty array indicating all schemas supported', () => {
      const schemas = strategy.getSupportedResultSchemas();
      expect(schemas).toEqual([]);
    });
  });
});
