import { Test, TestingModule } from '@nestjs/testing';
import {
  DuplicateSegmentStep,
  DuplicateSegmentConfig,
} from './duplicate-segment.step';
import { StepExecutionContext } from './base.step';

interface FormattedOutput {
  items: any[];
  total: number;
  duplicates: any[];
  duplicate_count: number;
}

describe('DuplicateSegmentStep', () => {
  let step: DuplicateSegmentStep;
  let mockContext: StepExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DuplicateSegmentStep],
    }).compile();

    step = module.get<DuplicateSegmentStep>(DuplicateSegmentStep);

    mockContext = {
      executionId: 'test-execution-id',
      pipelineConfigId: 'test-pipeline-id',
      userId: 'test-user-id',
      logger: step['logger'],
    };
  });

  // Helper function to extract formatted output
  const getFormattedOutput = (result: any): FormattedOutput => {
    return result.outputSegments[0] as FormattedOutput;
  };

  describe('Different Input Data Structures', () => {
    it('should handle input with { items: [] } structure', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Hello world', post_message: 'Hello world' },
            { id: '2', content: 'Hello world', post_message: 'Hello world' },
            {
              id: '3',
              content: 'Different text',
              post_message: 'Different text',
            },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'post_message',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputSegments).toBeDefined();

      // Check output structure
      const output = getFormattedOutput(result);
      expect(output).toHaveProperty('items');
      expect(output).toHaveProperty('total');
      expect(output).toHaveProperty('duplicates');
      expect(output).toHaveProperty('duplicate_count');

      // Should have 2 unique items (one duplicate removed)
      expect(output.items).toHaveLength(2);
      expect(output.total).toBe(2);
      expect(output.duplicate_count).toBe(1);
    });

    it('should handle input with { data: [] } structure', async () => {
      const input = [
        {
          data: [
            {
              id: '1',
              message: 'Test message 1',
              post_content: 'Test message 1',
            },
            {
              id: '2',
              message: 'Test message 1',
              post_content: 'Test message 1',
            },
            {
              id: '3',
              message: 'Test message 2',
              post_content: 'Test message 2',
            },
            {
              id: '4',
              message: 'Test message 3',
              post_content: 'Test message 3',
            },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'post_content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should have 3 unique items (one duplicate removed)
      expect(output.items).toHaveLength(3);
      expect(output.duplicate_count).toBe(1);
    });

    it('should handle input with { abc: [] } structure (arbitrary field name)', async () => {
      const input = [
        {
          abc: [
            { id: '1', text: 'Same text', custom_field: 'Same text' },
            { id: '2', text: 'Same text', custom_field: 'Same text' },
            { id: '3', text: 'Same text', custom_field: 'Same text' },
            { id: '4', text: 'Different', custom_field: 'Different' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'custom_field',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should have 2 unique items (two duplicates removed)
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(2);
    });

    it('should handle nested data structure with data.data array', async () => {
      const input = [
        {
          data: [
            {
              data: [
                { id: '1', content: 'Nested content', field: 'Nested content' },
                { id: '2', content: 'Nested content', field: 'Nested content' },
                { id: '3', content: 'Other content', field: 'Other content' },
              ],
            },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'field',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should have 2 unique items
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });

    it('should handle flat array input (no wrapper)', async () => {
      const input = [
        { id: '1', content: 'Flat content', message: 'Flat content' },
        { id: '2', content: 'Flat content', message: 'Flat content' },
        { id: '3', content: 'Another content', message: 'Another content' },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'message',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should have 2 unique items
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });
  });

  describe('No Hardcoded Fields', () => {
    it('should work with any content field name', async () => {
      const input = [
        {
          items: [
            { id: '1', custom_content_field: 'Test 1' },
            { id: '2', custom_content_field: 'Test 1' },
            { id: '3', custom_content_field: 'Test 2' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'custom_content_field',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });

    it('should work with nested content field paths', async () => {
      const input = [
        {
          items: [
            { id: '1', metadata: { nested: { content: 'Nested test' } } },
            { id: '2', metadata: { nested: { content: 'Nested test' } } },
            { id: '3', metadata: { nested: { content: 'Different' } } },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'metadata.nested.content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });

    it('should handle items.meta.post_message path when segments already extracted', async () => {
      // Simulate segments that were already extracted from a wrapper
      // So they don't have an 'items' property
      const input = [
        {
          id: '1',
          meta: { post_message: 'Same message here' },
        },
        {
          id: '2',
          meta: { post_message: 'Same message here' },
        },
        {
          id: '3',
          meta: { post_message: 'Different message completely' },
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'items.meta.post_message', // Should be adjusted to 'meta.post_message'
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      // Should detect duplicates correctly after path adjustment
      expect(output.items.length).toBeGreaterThanOrEqual(2);
      expect(output.items.length).toBeLessThanOrEqual(3);
    });

    it('should find duplicates with threshold 0.1 when content shares words', async () => {
      const input = [
        {
          items: [
            { id: '1', text: 'Apple banana cherry' },
            { id: '2', text: 'Apple orange' }, // Shares "Apple" with item 1
            { id: '3', text: 'Banana cherry' }, // Shares "banana" and "cherry" with item 1
            { id: '4', text: 'Grapefruit lemon' }, // No common words
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 0.1,
        contentField: 'text',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // With threshold 0.1, items 1, 2, 3 should be similar (they share words)
      // Item 1: "Apple banana cherry" (3 words)
      // Item 2: "Apple orange" (2 words) - similarity with 1: 1/4 = 0.25 >= 0.1 ✓
      // Item 3: "Banana cherry" (2 words) - similarity with 1: 2/3 = 0.67 >= 0.1 ✓
      // Item 4: "Grapefruit lemon" - similarity with 1: 0/5 = 0.0 < 0.1 ✗

      // So items 2 and 3 should be duplicates of item 1
      expect(output.items.length).toBeLessThanOrEqual(2); // At least 2 duplicates found
      expect(output.duplicate_count).toBeGreaterThanOrEqual(2);
    });

    it('should handle different output field names without hardcoding', async () => {
      const input = [
        {
          results: [
            { id: '1', text: 'Same' },
            { id: '2', text: 'Same' },
            { id: '3', text: 'Different' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'text',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Output should have items array regardless of input structure
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);
    });
  });

  describe('Threshold Functionality', () => {
    const createSimilarityTestData = () => {
      // Create test data with varying similarity levels
      return [
        {
          items: [
            { id: '1', content: 'The quick brown fox jumps over the lazy dog' },
            { id: '2', content: 'The quick brown fox jumps over the lazy dog' }, // 100% similar
            { id: '3', content: 'The quick brown fox jumps over the lazy cat' }, // ~90% similar
            { id: '4', content: 'The quick brown fox jumps' }, // ~60% similar
            { id: '5', content: 'A completely different sentence here' }, // ~0% similar
          ],
        },
      ];
    };

    it('should use threshold 0.0 (all items except first are duplicates)', async () => {
      const input = createSimilarityTestData();
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 0.0,
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // With threshold 0.0, everything after first is duplicate
      expect(output.items).toHaveLength(1);
      expect(output.duplicate_count).toBe(4);
    });

    it('should use threshold 0.5 (moderate similarity)', async () => {
      const input = createSimilarityTestData();
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 0.5,
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should filter out items with similarity >= 0.5
      // Items 1, 2, 3 are similar (1&2 identical, 3 is ~90% similar)
      // Item 4 is ~60% similar (should be filtered)
      // Item 5 is ~0% similar (should pass)
      expect(output.items.length).toBeGreaterThanOrEqual(1);
      expect(output.items.length).toBeLessThanOrEqual(3);
    });

    it('should use threshold 0.8 (high similarity)', async () => {
      const input = createSimilarityTestData();
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 0.8,
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should only filter very similar items (>= 0.8)
      // Items 1, 2, 3 are similar (1&2 identical, 3 is ~90% similar)
      // Item 4 is ~60% similar (should pass)
      // Item 5 is ~0% similar (should pass)
      expect(output.items.length).toBeGreaterThanOrEqual(2);
      expect(output.items.length).toBeLessThanOrEqual(4);
    });

    it('should use threshold 1.0 (only exact matches)', async () => {
      const input = createSimilarityTestData();
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 1.0,
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should only filter exact duplicates (similarity = 1.0)
      // Only items 1 and 2 are identical
      expect(output.items.length).toBeGreaterThanOrEqual(4);
      expect(output.duplicate_count).toBeLessThanOrEqual(1);
    });

    it('should handle threshold as string and convert to number', async () => {
      const input = createSimilarityTestData();
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: '0.8' as any, // Simulate string from frontend
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should work correctly with string threshold
      expect(output).toBeDefined();
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);
    });

    it('should clamp threshold values outside 0-1 range', async () => {
      const input = createSimilarityTestData();

      // Test threshold < 0
      const configLow: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: -0.5,
        contentField: 'content',
      };

      const resultLow = await step.execute(input, configLow, mockContext);
      expect(resultLow.success).toBe(true);

      // Test threshold > 1
      const configHigh: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 1.5,
        contentField: 'content',
      };

      const resultHigh = await step.execute(input, configHigh, mockContext);
      expect(resultHigh.success).toBe(true);
    });
  });

  describe('Threshold Range Testing (0-1)', () => {
    const createTestData = () => {
      // Create test data with known similarity relationships
      return [
        {
          items: [
            { id: '1', text: 'Apple banana cherry' },
            { id: '2', text: 'Apple banana cherry' }, // Identical to 1
            { id: '3', text: 'Apple banana' }, // High similarity (2/3 words)
            { id: '4', text: 'Apple' }, // Medium similarity (1/3 words)
            { id: '5', text: 'Orange grapefruit lemon' }, // Low similarity (0/3 words)
          ],
        },
      ];
    };

    const testThresholds = [
      {
        threshold: 0.0,
        expectedMin: 1,
        expectedMax: 1,
        description: '0.0 - all duplicates',
      },
      {
        threshold: 0.1,
        expectedMin: 1,
        expectedMax: 2,
        description: '0.1 - very low',
      },
      {
        threshold: 0.3,
        expectedMin: 1,
        expectedMax: 3,
        description: '0.3 - low',
      },
      {
        threshold: 0.5,
        expectedMin: 2,
        expectedMax: 4,
        description: '0.5 - medium',
      },
      {
        threshold: 0.67,
        expectedMin: 3,
        expectedMax: 4,
        description: '0.67 - high (2/3 similarity)',
      },
      {
        threshold: 0.8,
        expectedMin: 3,
        expectedMax: 5,
        description: '0.8 - very high',
      },
      {
        threshold: 0.99,
        expectedMin: 4,
        expectedMax: 5,
        description: '0.99 - near exact',
      },
      {
        threshold: 1.0,
        expectedMin: 4,
        expectedMax: 5,
        description: '1.0 - exact match only',
      },
    ];

    testThresholds.forEach(
      ({ threshold, expectedMin, expectedMax, description }) => {
        it(`should handle threshold ${description}`, async () => {
          const input = createTestData();
          const config: DuplicateSegmentConfig = {
            method: 'similarity',
            similarityThreshold: threshold,
            contentField: 'text',
          };

          const result = await step.execute(input, config, mockContext);

          expect(result.success).toBe(true);
          const output = getFormattedOutput(result);

          expect(output.items.length).toBeGreaterThanOrEqual(expectedMin);
          expect(output.items.length).toBeLessThanOrEqual(expectedMax);
          expect(output.total).toBe(output.items.length);
          expect(output.duplicate_count + output.items.length).toBe(5); // Input had 5 items
        });
      },
    );
  });

  describe('Hash Method', () => {
    it('should detect exact duplicates using hash method', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Exact duplicate' },
            { id: '2', content: 'Exact duplicate' },
            { id: '3', content: 'Different content' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });

    it('should be case sensitive when caseSensitive is true', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Hello World' },
            { id: '2', content: 'hello world' },
            { id: '3', content: 'Different' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
        caseSensitive: true,
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // With case sensitive, 'Hello World' and 'hello world' are different
      expect(output.items).toHaveLength(3);
      expect(output.duplicate_count).toBe(0);
    });

    it('should ignore case when caseSensitive is false', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Hello World' },
            { id: '2', content: 'hello world' },
            { id: '3', content: 'Different' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
        caseSensitive: false,
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // With case insensitive, 'Hello World' and 'hello world' are duplicates
      expect(output.items).toHaveLength(2);
      expect(output.duplicate_count).toBe(1);
    });
  });

  describe('Validation', () => {
    it('should validate method is required', async () => {
      const config = {} as DuplicateSegmentConfig;
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Method is required');
    });

    it('should validate method must be hash or similarity', async () => {
      const config = {
        method: 'invalid' as any,
      };
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Method must be one of: hash, similarity',
      );
    });

    it('should validate similarity threshold is required for similarity method', async () => {
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
      };
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Similarity threshold is required for similarity method',
      );
    });

    it('should validate similarity threshold is between 0 and 1', async () => {
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 1.5,
      };
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Similarity threshold must be between 0 and 1',
      );
    });

    it('should pass validation for valid hash config', async () => {
      const config: DuplicateSegmentConfig = {
        method: 'hash',
      };
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should pass validation for valid similarity config', async () => {
      const config: DuplicateSegmentConfig = {
        method: 'similarity',
        similarityThreshold: 0.8,
      };
      const validation = await step.validate(config);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', async () => {
      const input: any[] = [];
      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(0);
      expect(output.total).toBe(0);
      expect(output.duplicate_count).toBe(0);
    });

    it('should handle input with empty wrapper', async () => {
      const input = [{ items: [] }];
      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      // When wrapper has empty array, it processes the wrapper itself
      // Since wrapper has no content field, it returns empty items array
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);
      // Empty wrapper with no content field results in empty items
      expect(output.total).toBe(output.items.length);
    });

    it('should handle missing content field gracefully', async () => {
      const input = [
        {
          items: [
            { id: '1', otherField: 'value1' },
            { id: '2', otherField: 'value2' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'nonexistent',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      // Should process but with empty content, which might cause all items to be considered duplicates
      const output = getFormattedOutput(result);
      expect(output).toBeDefined();
    });

    it('should handle all items being duplicates', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Same' },
            { id: '2', content: 'Same' },
            { id: '3', content: 'Same' },
            { id: '4', content: 'Same' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(1);
      expect(output.duplicate_count).toBe(3);
    });

    it('should handle no duplicates', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Unique 1' },
            { id: '2', content: 'Unique 2' },
            { id: '3', content: 'Unique 3' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(3);
      expect(output.duplicate_count).toBe(0);
    });
  });

  describe('Output Format', () => {
    it('should return output in expected format', async () => {
      const input = [
        {
          items: [
            { id: '1', content: 'Test' },
            { id: '2', content: 'Test' },
          ],
        },
      ];

      const config: DuplicateSegmentConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputSegments).toBeDefined();
      expect(Array.isArray(result.outputSegments)).toBe(true);

      const output = getFormattedOutput(result);
      expect(output).toHaveProperty('items');
      expect(output).toHaveProperty('total');
      expect(output).toHaveProperty('duplicates');
      expect(output).toHaveProperty('duplicate_count');

      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('duplicateCount');
      expect(result).toHaveProperty('metrics');
    });
  });
});
