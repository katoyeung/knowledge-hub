import { Injectable, Logger } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { ValidationResult } from '../interfaces/step.interfaces';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface TestConfig extends StepConfig {
  testName?: string;
  description?: string;
  enabled?: boolean;
  showJsonOutput?: boolean;
  maxOutputItems?: number;
}

@Injectable()
export class TestStep extends BaseStep {
  constructor() {
    super('test', 'Test Step');
  }

  /**
   * Main execution logic - create test output
   */
  protected async executeStep(
    inputSegments: DocumentSegment[],
    config: TestConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    this.logger.log(
      `Executing test step: ${config.testName || 'Unnamed Test'}`,
    );

    // Process input segments and create test output
    const testOutput = {
      stepName: config.testName || 'Test Step',
      description: config.description || 'Testing workflow output',
      inputCount: inputSegments.length,
      processedAt: new Date().toISOString(),
      inputSegments: inputSegments
        .slice(0, config.maxOutputItems || 10)
        .map((segment) => ({
          id: segment.id,
          content:
            segment.content.substring(0, 200) +
            (segment.content.length > 200 ? '...' : ''),
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          status: segment.status,
          createdAt: segment.createdAt,
        })),
      summary: {
        totalSegments: inputSegments.length,
        processedSegments: Math.min(
          inputSegments.length,
          config.maxOutputItems || 10,
        ),
        averageWordCount:
          inputSegments.reduce((sum, s) => sum + (s.wordCount || 0), 0) /
          inputSegments.length,
        averageTokens:
          inputSegments.reduce((sum, s) => sum + (s.tokens || 0), 0) /
          inputSegments.length,
      },
      executionContext: {
        executionId: context.executionId,
        pipelineConfigId: context.pipelineConfigId,
        userId: context.userId,
        timestamp: new Date().toISOString(),
      },
    };

    this.logger.log(
      `Test step completed: ${JSON.stringify(testOutput.summary)}`,
    );

    // Return original segments (test step doesn't modify them)
    return inputSegments;
  }

  // Old execute() method removed - using BaseStep template pattern now

  async validate(config: TestConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.testName || config.testName.trim().length === 0) {
      errors.push('Test name is required');
    }

    if (
      config.maxOutputItems &&
      (config.maxOutputItems < 1 || config.maxOutputItems > 100)
    ) {
      errors.push('Max output items must be between 1 and 100');
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
    this.logger.log('Rolling back test step');

    try {
      // Test step doesn't modify data, so rollback is simple
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Test step rollback failed: ${error.message}`,
        error.stack,
      );
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'test',
      name: 'Test Step',
      description: 'Test and preview workflow output with JSON visualization',
      version: '1.0.0',
      inputTypes: ['document_segments'],
      outputTypes: ['test_output'],
      configSchema: {
        type: 'object',
        properties: {
          testName: {
            type: 'string',
            title: 'Test Name',
            description: 'Name for this test step',
            default: 'Test Output',
          },
          description: {
            type: 'string',
            title: 'Description',
            description: 'Description of what this test is checking',
            default: 'Testing workflow output',
          },
          enabled: {
            type: 'boolean',
            title: 'Enabled',
            description: 'Whether this test step is enabled',
            default: true,
          },
          showJsonOutput: {
            type: 'boolean',
            title: 'Show JSON Output',
            description: 'Display output in JSON format',
            default: true,
          },
          maxOutputItems: {
            type: 'number',
            title: 'Max Output Items',
            description: 'Maximum number of items to show in output preview',
            default: 10,
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['testName'],
      },
    };
  }
}
