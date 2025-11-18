import { Test, TestingModule } from '@nestjs/testing';
import { SegmentContentExtractionStrategy } from './segment-content-extraction-strategy';
import { DocumentSegment } from '../../../../dataset/entities/document-segment.entity';

describe('SegmentContentExtractionStrategy', () => {
  let strategy: SegmentContentExtractionStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SegmentContentExtractionStrategy],
    }).compile();

    strategy = module.get<SegmentContentExtractionStrategy>(
      SegmentContentExtractionStrategy,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(strategy.getEntityType()).toBe('segment');
  });

  describe('extractContent', () => {
    it('should extract content from segment with all fields', () => {
      const segment: Partial<DocumentSegment> = {
        id: 'segment-1',
        content: 'This is segment content',
        answer: 'This is the answer',
        position: 1,
        segmentType: 'parent',
        hierarchyLevel: 1,
        hierarchyMetadata: {
          title: 'Segment Title',
          author: 'Author Name',
        },
      };

      const content = strategy.extractContent(segment as DocumentSegment);

      expect(content).toContain('Content: This is segment content');
      expect(content).toContain('Answer: This is the answer');
      expect(content).toContain('Position: 1');
      expect(content).toContain('Segment Type: parent');
      expect(content).toContain('Hierarchy Level: 1');
      expect(content).toContain('title');
    });

    it('should extract content from minimal segment', () => {
      const segment: Partial<DocumentSegment> = {
        id: 'segment-2',
        content: 'Simple content',
        position: 0,
      };

      const content = strategy.extractContent(segment as DocumentSegment);

      expect(content).toContain('Content: Simple content');
      expect(content).toContain('Position: 0');
    });
  });

  describe('getEntityId', () => {
    it('should return segment id', () => {
      const segment: Partial<DocumentSegment> = {
        id: 'segment-123',
      };

      expect(strategy.getEntityId(segment as DocumentSegment)).toBe(
        'segment-123',
      );
    });
  });

  describe('extractTemplateVariables', () => {
    it('should extract all template variables', () => {
      const segment: Partial<DocumentSegment> = {
        id: 'segment-1',
        content: 'Segment content',
        position: 5,
        segmentType: 'child',
        hierarchyLevel: 2,
        wordCount: 100,
        tokens: 150,
        hierarchyMetadata: {
          title: 'Metadata Title',
          author: 'Metadata Author',
        },
      };

      const variables = strategy.extractTemplateVariables(
        segment as DocumentSegment,
      );

      expect(variables.content).toBe('Segment content');
      expect(variables.text).toBe('Segment content');
      expect(variables.position).toBe('5');
      expect(variables.segmentType).toBe('child');
      expect(variables.hierarchyLevel).toBe('2');
      expect(variables.wordCount).toBe('100');
      expect(variables.tokens).toBe('150');
      expect(variables.title).toBe('Metadata Title');
      expect(variables.author).toBe('Metadata Author');
    });

    it('should handle missing fields gracefully', () => {
      const segment: Partial<DocumentSegment> = {
        id: 'segment-2',
        content: 'Content only',
      };

      const variables = strategy.extractTemplateVariables(
        segment as DocumentSegment,
      );

      expect(variables.content).toBe('Content only');
      expect(variables.position).toBeUndefined();
    });
  });
});
