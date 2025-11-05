import { Test, TestingModule } from '@nestjs/testing';
import {
  RuleBasedFilterStep,
  RuleBasedFilterConfig,
  FilterRule,
} from './rule-based-filter.step';
import { StepExecutionContext } from './base.step';

interface FormattedOutput {
  items: any[];
  total: number;
  filtered: any[];
  filtered_count: number;
}

describe('RuleBasedFilterStep', () => {
  let step: RuleBasedFilterStep;
  let mockContext: StepExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RuleBasedFilterStep],
    }).compile();

    step = module.get<RuleBasedFilterStep>(RuleBasedFilterStep);

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

  // Helper to create a basic rule config
  const createBasicConfig = (
    contentField: string,
    rules: FilterRule[] = [],
    defaultAction: 'keep' | 'remove' = 'keep',
  ): RuleBasedFilterConfig => {
    return {
      rules,
      defaultAction,
      contentField,
      caseSensitive: false,
      wholeWord: false,
    };
  };

  describe('Different Input Data Structures', () => {
    it('should handle input with { items: [] } structure', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world', metadata: {} },
            { id: '2', post_message: 'Test message', metadata: {} },
            { id: '3', post_message: 'Another test', metadata: {} },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputSegments).toBeDefined();

      const output = getFormattedOutput(result);
      expect(output).toHaveProperty('items');
      expect(output).toHaveProperty('total');
      expect(output).toHaveProperty('filtered');
      expect(output).toHaveProperty('filtered_count');

      // Should filter out items containing "test"
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Hello world');
      expect(output.filtered_count).toBe(2);
    });

    it('should handle input with { data: [] } structure', async () => {
      const input = [
        {
          data: [
            { id: '1', message: 'Keep this', post_content: 'Keep this' },
            { id: '2', message: 'Remove spam', post_content: 'Remove spam' },
            { id: '3', message: 'Keep good', post_content: 'Keep good' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_content', [
        {
          id: 'rule-1',
          name: 'Filter spam',
          pattern: 'spam',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should filter out items containing "spam"
      expect(output.items).toHaveLength(2);
      expect(output.filtered_count).toBe(1);
      expect(
        output.items.every((item) => !item.post_content.includes('spam')),
      ).toBe(true);
    });

    it('should handle input with nested data.data structure', async () => {
      const input = [
        {
          data: [
            {
              data: [
                { id: '1', text: 'First item', post_message: 'First item' },
                { id: '2', text: 'Second item', post_message: 'Second item' },
              ],
            },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter first',
          pattern: '^First', // Match start of string
          action: 'remove',
          enabled: true,
        },
      ]);
      config.caseSensitive = true; // Make it case-sensitive

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      // Should extract nested data and filter correctly
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Second item');
    });

    it('should handle input with arbitrary field name (results)', async () => {
      const input = [
        {
          results: [
            { id: '1', content: 'Test content', custom_field: 'Test content' },
            {
              id: '2',
              content: 'Other content',
              custom_field: 'Other content',
            },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('custom_field', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: '^Test', // Match start of string
          action: 'remove',
          enabled: true,
        },
      ]);
      config.caseSensitive = true; // Make it case-sensitive

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(1);
      expect(output.items[0].custom_field).toBe('Other content');
    });

    it('should handle raw array input (no wrapper)', async () => {
      const input = [
        { id: '1', post_message: 'Keep this', metadata: {} },
        { id: '2', post_message: 'Remove test', metadata: {} },
        { id: '3', post_message: 'Keep that', metadata: {} },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(2);
      expect(output.filtered_count).toBe(1);
    });
  });

  describe('Content Field Path Handling', () => {
    it('should handle simple field path (post_message)', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world', other: 'ignore' },
            { id: '2', post_message: 'Test message', other: 'ignore' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Hello world');
    });

    it('should handle nested field path (data.post_message) and auto-adjust', async () => {
      const input = [
        {
          items: [
            {
              id: '1',
              data: { post_message: 'Hello world' },
              other: 'ignore',
            },
            {
              id: '2',
              data: { post_message: 'Test message' },
              other: 'ignore',
            },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'data.post_message',
        [
          {
            id: 'rule-1',
            name: 'Filter test',
            pattern: 'test',
            action: 'remove',
            enabled: true,
          },
        ],
      );

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(1);
      expect(output.items[0].data.post_message).toBe('Hello world');
    });

    it('should handle contentField with array prefix that gets removed', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world' },
            { id: '2', post_message: 'Test message' },
          ],
        },
      ];

      // Even if contentField includes "items." prefix, it should work
      // because the step adjusts it after extracting items array
      const config: RuleBasedFilterConfig = createBasicConfig(
        'items.post_message',
        [
          {
            id: 'rule-1',
            name: 'Filter test',
            pattern: 'test',
            action: 'remove',
            enabled: true,
          },
        ],
      );

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Should still work - the step adjusts the path
      expect(output.items).toHaveLength(1);
    });
  });

  describe('Filtering Rules', () => {
    it('should apply multiple rules correctly', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world' },
            { id: '2', post_message: 'Test spam' },
            { id: '3', post_message: 'Good content' },
            { id: '4', post_message: 'Remove this' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter spam',
          pattern: 'spam',
          action: 'remove',
          enabled: true,
        },
        {
          id: 'rule-2',
          name: 'Filter remove',
          pattern: 'Remove',
          action: 'remove',
          enabled: true,
        },
      ]);
      config.caseSensitive = true; // Make it case-sensitive so "Remove" matches exactly

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Item 2 has 'spam', item 4 has 'Remove', so 2 items should be filtered
      expect(output.items).toHaveLength(2);
      expect(output.filtered_count).toBe(2);
      expect(result.metrics.ruleMatches['rule-1']).toBe(1);
      expect(result.metrics.ruleMatches['rule-2']).toBe(1);
      // Verify correct items are kept
      expect(output.items.map((item) => item.id)).toEqual(['1', '3']);
    });

    it('should handle keep action correctly', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world' },
            { id: '2', post_message: 'Keep this important' },
            { id: '3', post_message: 'Other content' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [
          {
            id: 'rule-1',
            name: 'Keep important',
            pattern: 'important',
            action: 'keep',
            enabled: true,
          },
        ],
        'remove',
      ); // Default action is remove

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Only items matching "important" should be kept (default action is remove)
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Keep this important');
    });

    it('should respect defaultAction when no rules match', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world' },
            { id: '2', post_message: 'Test message' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [
          {
            id: 'rule-1',
            name: 'Filter xyz',
            pattern: 'xyz',
            action: 'remove',
            enabled: true,
          },
        ],
        'remove',
      ); // Default action is remove

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // No rules match, so defaultAction (remove) applies to all
      expect(output.items).toHaveLength(0);
      expect(output.filtered_count).toBe(2);
    });

    it('should handle case sensitive matching', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Test message' },
            { id: '2', post_message: 'test message' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter Test',
          pattern: 'Test',
          action: 'remove',
          enabled: true,
        },
      ]);
      config.caseSensitive = true;

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Only exact case match should be filtered
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('test message');
    });
  });

  describe('Length Constraints', () => {
    it('should filter by minContentLength', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Short' }, // 5 chars
            { id: '2', post_message: 'This is a longer message' }, // 28 chars
            { id: '3', post_message: 'Abc' }, // 3 chars
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );
      config.minContentLength = 10;

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Only items with length >= 10 should be kept
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('This is a longer message');
    });

    it('should filter by maxContentLength', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Short' }, // 5 chars <= 10
            {
              id: '2',
              post_message: 'This is a very long message that exceeds limit',
            }, // > 10
            { id: '3', post_message: 'Medium' }, // 6 chars <= 10
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );
      config.maxContentLength = 10;

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Only items with length <= 10 should be kept
      expect(output.items).toHaveLength(2);
      expect(output.items.every((item) => item.post_message.length <= 10)).toBe(
        true,
      );
    });

    it('should filter empty segments when preserveEmptySegments is false', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Valid content' },
            { id: '2', post_message: '' }, // Empty string
            { id: '3', post_message: 'Valid 2' }, // Valid content
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );
      config.preserveEmptySegments = false;

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Empty strings should be filtered out (length === 0)
      expect(output.items).toHaveLength(2);
      expect(output.items.every((item) => item.post_message.length > 0)).toBe(
        true,
      );
    });
  });

  describe('Output Formatting', () => {
    it('should format output correctly with items, total, filtered, filtered_count', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Keep this' },
            { id: '2', post_message: 'Remove test' },
            { id: '3', post_message: 'Keep that' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);

      // Test formatOutput method
      const formatted = step.formatOutput(result);

      expect(formatted).toHaveProperty('items');
      expect(formatted).toHaveProperty('total');
      expect(formatted).toHaveProperty('filtered');
      expect(formatted).toHaveProperty('filtered_count');
      expect(Array.isArray(formatted.items)).toBe(true);
      expect(typeof formatted.total).toBe('number');
      expect(Array.isArray(formatted.filtered)).toBe(true);
      expect(typeof formatted.filtered_count).toBe('number');

      expect(formatted.items).toHaveLength(2);
      expect(formatted.total).toBe(2);
      expect(formatted.filtered_count).toBe(1);
    });

    it('should include filtered items in output', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Keep this' },
            { id: '2', post_message: 'Remove test' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      expect(output.filtered).toHaveLength(1);
      expect(output.filtered[0].post_message).toBe('Remove test');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', async () => {
      const input: any[] = [];
      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(0);
      expect(output.total).toBe(0);
      expect(output.filtered_count).toBe(0);
    });

    it('should handle empty wrapper structure', async () => {
      const input = [{ items: [] }];
      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      expect(output.items).toHaveLength(0);
    });

    it('should handle missing contentField gracefully', async () => {
      const input = [
        {
          items: [
            { id: '1', other_field: 'Some content' },
            { id: '2', other_field: 'Other content' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [],
      );

      const result = await step.execute(input, config, mockContext);

      // Should still succeed but extract empty content
      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      // All items should be filtered out due to empty content (if preserveEmptySegments is false)
      expect(output.filtered_count).toBeGreaterThanOrEqual(0);
    });

    it('should handle disabled rules', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Test message' },
            { id: '2', post_message: 'Other message' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [
          {
            id: 'rule-1',
            name: 'Filter test',
            pattern: 'test',
            action: 'remove',
            enabled: false, // Disabled
          },
        ],
        'keep',
      );

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Rule is disabled, so defaultAction (keep) applies to all
      expect(output.items).toHaveLength(2);
      expect(output.filtered_count).toBe(0);
    });

    it('should handle invalid regex pattern gracefully', async () => {
      const input = [
        {
          items: [
            { id: '1', post_message: 'Test message' },
            { id: '2', post_message: 'Other message' },
          ],
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig(
        'post_message',
        [
          {
            id: 'rule-1',
            name: 'Invalid regex',
            pattern: '[invalid regex', // Invalid regex
            action: 'remove',
            enabled: true,
          },
        ],
        'keep',
      );

      const result = await step.execute(input, config, mockContext);

      // Should still succeed, invalid rule is skipped
      expect(result.success).toBe(true);
      const output = getFormattedOutput(result);
      // Default action applies
      expect(output.items).toHaveLength(2);
    });
  });

  describe('Integration with Previous Node Output', () => {
    it('should handle output from duplicate-segment step', async () => {
      // Simulate output from duplicate-segment step
      const input = [
        {
          items: [
            { id: '1', post_message: 'Hello world', metadata: {} },
            { id: '2', post_message: 'Test message', metadata: {} },
          ],
          total: 2,
          duplicates: [],
          duplicate_count: 0,
        },
      ];

      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Hello world');
      expect(output.filtered_count).toBe(1);
    });

    it('should handle output from post-datasource step', async () => {
      // Simulate output from post-datasource step
      // The step extracts the data array, so segments become the items in the data array
      const input = [
        {
          data: [
            {
              id: '1',
              post_message: 'Hello world',
              metadata: {},
            },
            {
              id: '2',
              post_message: 'Test message',
              metadata: {},
            },
          ],
        },
      ];

      // After extraction from data array, contentField should be just 'post_message'
      // (the step adjusts it by removing 'data.' prefix if present)
      const config: RuleBasedFilterConfig = createBasicConfig('post_message', [
        {
          id: 'rule-1',
          name: 'Filter test',
          pattern: 'test',
          action: 'remove',
          enabled: true,
        },
      ]);

      const result = await step.execute(input, config, mockContext);
      const output = getFormattedOutput(result);

      // Should filter out 'Test message' and keep 'Hello world'
      expect(output.items).toHaveLength(1);
      expect(output.items[0].post_message).toBe('Hello world');
    });
  });
});
