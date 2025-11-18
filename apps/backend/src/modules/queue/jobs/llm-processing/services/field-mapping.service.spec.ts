import { Test, TestingModule } from '@nestjs/testing';
import { FieldMappingService } from './field-mapping.service';
import {
  FieldMappingConfig,
  FieldMappingRule,
} from '../interfaces/result-application-strategy.interface';

describe('FieldMappingService', () => {
  let service: FieldMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FieldMappingService],
    }).compile();

    service = module.get<FieldMappingService>(FieldMappingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('applyMappings', () => {
    it('should map simple fields correctly', () => {
      const result = {
        status: 'approved',
        reason: 'Content is appropriate',
        confidenceScore: 0.95,
      };

      const config: FieldMappingConfig = {
        mappings: {
          status: 'status',
          approvalReason: 'reason',
          confidenceScore: 'confidenceScore',
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.status).toBe('approved');
      expect(update.approvalReason).toBe('Content is appropriate');
      expect(update.confidenceScore).toBe(0.95);
    });

    it('should map nested fields correctly', () => {
      const result = {
        data: {
          classification: 'positive',
          confidence: 0.88,
        },
      };

      const config: FieldMappingConfig = {
        mappings: {
          'meta.classification': 'data.classification',
          'meta.confidence': 'data.confidence',
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.meta.classification).toBe('positive');
      expect(update.meta.confidence).toBe(0.88);
    });

    it('should apply transformations correctly', () => {
      const result = {
        status: 'approved',
        score: 0.85,
      };

      const config: FieldMappingConfig = {
        mappings: {
          status: {
            from: 'status',
            transform: (v) => v.toUpperCase(),
          },
          confidenceScore: {
            from: 'score',
            transform: (v) => Math.round(v * 100) / 100,
          },
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.status).toBe('APPROVED');
      expect(update.confidenceScore).toBe(0.85);
    });

    it('should apply enum conversions correctly', () => {
      const result = {
        status: 'approved',
      };

      const config: FieldMappingConfig = {
        mappings: {
          status: 'status',
        },
        enumConversions: {
          status: {
            approved: 'APPROVED',
            rejected: 'REJECTED',
          },
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.status).toBe('APPROVED');
    });

    it('should use default values when source field is missing', () => {
      const result = {
        status: 'approved',
      };

      const config: FieldMappingConfig = {
        mappings: {
          status: 'status',
          approvalReason: {
            from: 'reason',
            defaultValue: 'No reason provided',
          },
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.status).toBe('approved');
      expect(update.approvalReason).toBe('No reason provided');
    });

    it('should apply defaults from config', () => {
      const result = {
        status: 'approved',
      };

      const config: FieldMappingConfig = {
        mappings: {
          status: 'status',
        },
        defaults: {
          processedAt: new Date().toISOString(),
          processor: 'system',
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.status).toBe('approved');
      expect(update.processedAt).toBeDefined();
      expect(update.processor).toBe('system');
    });

    it('should handle complex nested mappings', () => {
      const result = {
        analysis: {
          sentiment: {
            value: 'positive',
            score: 0.9,
          },
          tags: ['important', 'verified'],
        },
      };

      const config: FieldMappingConfig = {
        mappings: {
          'meta.sentiment.value': 'analysis.sentiment.value',
          'meta.sentiment.score': 'analysis.sentiment.score',
          'meta.tags': 'analysis.tags',
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.meta.sentiment.value).toBe('positive');
      expect(update.meta.sentiment.score).toBe(0.9);
      expect(update.meta.tags).toEqual(['important', 'verified']);
    });

    it('should handle transformation errors gracefully', () => {
      const result = {
        score: 'invalid',
      };

      const config: FieldMappingConfig = {
        mappings: {
          confidenceScore: {
            from: 'score',
            transform: (v) => parseFloat(v),
            defaultValue: 0.5,
          },
        },
      };

      const update = service.applyMappings(result, config);

      // Should use default value when transformation fails
      expect(update.confidenceScore).toBe(0.5);
    });

    it('should handle missing nested paths gracefully', () => {
      const result = {
        data: {},
      };

      const config: FieldMappingConfig = {
        mappings: {
          'meta.field': 'data.nested.missing',
        },
      };

      const update = service.applyMappings(result, config);

      expect(update.meta).toBeUndefined();
    });
  });
});
