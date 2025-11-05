import { Injectable, Logger } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { ValidationResult } from '../interfaces/step.interfaces';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface DummyMockConfig extends StepConfig {
  count?: number;
  dynamicFields?: string[]; // Array of field names to generate dynamically
  fieldTypes?: Record<
    string,
    'string' | 'number' | 'boolean' | 'date' | 'object'
  >; // Field type mapping
  contentTemplate?: string; // Template for content generation
  includeMetadata?: boolean; // Whether to include random metadata
  seed?: number; // Random seed for reproducibility
}

@Injectable()
export class DummyMockStep extends BaseStep {
  constructor() {
    super('dummy_mock', 'Dummy Mock Step');
  }

  /**
   * Generate a random string
   */
  private randomString(length: number = 10, seed?: number): string {
    if (seed !== undefined) {
      // Simple seeded random (not cryptographically secure, but good enough for testing)
      const rng = this.seededRandom(seed);
      const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return Array.from(
        { length },
        () => chars[Math.floor(rng() * chars.length)],
      ).join('');
    }
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(
      { length },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  /**
   * Simple seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  /**
   * Generate a random number
   */
  private randomNumber(
    min: number = 0,
    max: number = 100,
    seed?: number,
  ): number {
    if (seed !== undefined) {
      const rng = this.seededRandom(seed);
      return Math.floor(rng() * (max - min + 1)) + min;
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate dynamic field value based on type
   */
  private generateDynamicField(
    fieldName: string,
    fieldType: string,
    index: number,
    seed?: number,
  ): any {
    const baseSeed = seed !== undefined ? seed + index : undefined;

    switch (fieldType) {
      case 'string':
        return `${fieldName}_${this.randomString(8, baseSeed)}_${index}`;
      case 'number':
        return this.randomNumber(0, 1000, baseSeed);
      case 'boolean':
        return baseSeed !== undefined
          ? baseSeed % 2 === 0
          : Math.random() > 0.5;
      case 'date':
        const date = new Date();
        date.setDate(date.getDate() - this.randomNumber(0, 365, baseSeed));
        return date.toISOString();
      case 'object':
        return {
          [`${fieldName}_nested`]: this.randomString(5, baseSeed),
          value: this.randomNumber(0, 100, baseSeed),
        };
      default:
        return `${fieldName}_value_${index}`;
    }
  }

  /**
   * Generate mock DocumentSegment with dynamic fields
   */
  private generateMockSegment(
    index: number,
    config: DummyMockConfig,
  ): Partial<DocumentSegment> & Record<string, any> {
    const baseSeed =
      config.seed !== undefined ? config.seed + index : undefined;
    const content = config.contentTemplate
      ? config.contentTemplate.replace('{index}', index.toString())
      : `Mock content segment ${index}. This is a test document segment with dynamic content. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;

    const segment: Partial<DocumentSegment> & Record<string, any> = {
      id: `mock-segment-${index}-${this.randomString(8, baseSeed)}`,
      content,
      wordCount: this.randomNumber(10, 500, baseSeed),
      tokens: this.randomNumber(15, 750, baseSeed),
      position: index,
      status: 'completed',
      enabled: true,
      datasetId: `mock-dataset-${this.randomString(8, baseSeed)}`,
      documentId: `mock-document-${this.randomString(8, baseSeed)}`,
      userId: `mock-user-${this.randomString(8, baseSeed)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add dynamic fields if specified
    if (config.dynamicFields && config.dynamicFields.length > 0) {
      config.dynamicFields.forEach((fieldName) => {
        const fieldType = config.fieldTypes?.[fieldName] || 'string';
        segment[fieldName] = this.generateDynamicField(
          fieldName,
          fieldType,
          index,
          baseSeed,
        );
      });
    }

    // Add random metadata if enabled
    if (config.includeMetadata) {
      segment.metadata = {
        generatedBy: 'dummy_mock_step',
        timestamp: new Date().toISOString(),
        index,
        randomValue: this.randomNumber(0, 1000, baseSeed),
      };
    }

    // Add some common workflow fields that might be expected
    segment.post_message = content;
    segment.post_content = content;
    segment.message = content;
    segment.text = content;

    return segment;
  }

  /**
   * Main execution logic - generate mock segments
   */
  protected async executeStep(
    inputSegments: DocumentSegment[],
    config: DummyMockConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    const count = config.count || 5;
    this.logger.log(
      `Generating ${count} mock segments with dynamic fields: ${config.dynamicFields?.join(', ') || 'none'}`,
    );

    const mockSegments: DocumentSegment[] = [];

    for (let i = 0; i < count; i++) {
      const mockData = this.generateMockSegment(i, config);
      // Create a DocumentSegment-like object
      // Note: In real usage, these would be actual DocumentSegment entities
      // For testing, we use plain objects that match the structure
      // Steps work with plain objects that match DocumentSegment structure
      const segment = {
        ...mockData,
      } as any as DocumentSegment;

      mockSegments.push(segment);
    }

    this.logger.log(
      `Generated ${mockSegments.length} mock segments. First segment keys: ${Object.keys(mockSegments[0] || {}).join(', ')}`,
    );

    // If there's input, merge it with mock data (for testing chaining)
    if (inputSegments.length > 0) {
      this.logger.log(
        `Merging ${inputSegments.length} input segments with mock data`,
      );
      // Prepend mock segments to input
      return [...mockSegments, ...inputSegments];
    }

    return mockSegments;
  }

  async validate(config: DummyMockConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (
      config.count !== undefined &&
      (config.count < 1 || config.count > 1000)
    ) {
      errors.push('Count must be between 1 and 1000');
    }

    if (config.dynamicFields && !Array.isArray(config.dynamicFields)) {
      errors.push('Dynamic fields must be an array');
    }

    if (config.fieldTypes && typeof config.fieldTypes !== 'object') {
      errors.push('Field types must be an object');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log('Rolling back dummy mock step');

    try {
      // Dummy step doesn't modify external state, so rollback is simple
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Dummy mock step rollback failed: ${error.message}`,
        error.stack,
      );
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'dummy_mock',
      name: 'Dummy Mock Step',
      description:
        'Generates mock DocumentSegment outputs with configurable dynamic fields for testing',
      version: '1.0.0',
      inputTypes: ['document_segments', 'any'],
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            title: 'Count',
            description: 'Number of mock segments to generate',
            default: 5,
            minimum: 1,
            maximum: 1000,
          },
          dynamicFields: {
            type: 'array',
            title: 'Dynamic Fields',
            description: 'Array of field names to generate dynamically',
            items: {
              type: 'string',
            },
            default: [],
          },
          fieldTypes: {
            type: 'object',
            title: 'Field Types',
            description:
              'Mapping of field names to their types (string, number, boolean, date, object)',
            additionalProperties: {
              type: 'string',
              enum: ['string', 'number', 'boolean', 'date', 'object'],
            },
            default: {},
          },
          contentTemplate: {
            type: 'string',
            title: 'Content Template',
            description:
              'Template for content generation (use {index} for segment index)',
            default:
              'Mock content segment {index}. This is a test document segment.',
          },
          includeMetadata: {
            type: 'boolean',
            title: 'Include Metadata',
            description: 'Whether to include random metadata in segments',
            default: false,
          },
          seed: {
            type: 'number',
            title: 'Random Seed',
            description: 'Random seed for reproducible output',
            default: undefined,
          },
        },
        required: [],
      },
    };
  }
}
