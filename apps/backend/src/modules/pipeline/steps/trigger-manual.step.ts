import { Injectable, Logger } from '@nestjs/common';
import { BaseStep } from './base.step';
import {
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface TriggerManualConfig extends StepConfig {
  triggerName?: string;
  description?: string;
  enabled?: boolean;
}

@Injectable()
export class TriggerManualStep extends BaseStep {
  constructor() {
    super('trigger_manual', 'Manual Trigger');
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: TriggerManualConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.logger.log(
      `Executing manual trigger: ${config.triggerName || 'Unnamed'}`,
    );

    try {
      // Manual triggers don't need to do anything special
      // They just pass through the execution context
      return {
        success: true,
        outputSegments: inputSegments, // Pass through input segments
        metrics: {
          triggerType: 'manual',
          triggerName: config.triggerName || 'Manual Trigger',
          description: config.description || 'Manually triggered workflow',
          timestamp: new Date().toISOString(),
          context: context.executionId,
        },
      };
    } catch (error) {
      this.logger.error(`Manual trigger execution failed: ${error.message}`);
      return {
        success: false,
        outputSegments: [],
        metrics: {},
        error: error.message,
      };
    }
  }

  async validate(
    config: TriggerManualConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Manual triggers don't have strict validation requirements
    if (config.triggerName && config.triggerName.length > 100) {
      errors.push('Trigger name must be 100 characters or less');
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
    this.logger.log('Rolling back manual trigger');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'trigger_manual',
      name: 'Manual Trigger',
      description: 'Manually triggered workflow execution',
      version: '1.0.0',
      inputTypes: [], // Triggers don't have inputs
      outputTypes: ['trigger_data'],
      configSchema: {
        type: 'object',
        properties: {
          triggerName: {
            type: 'string',
            description: 'Name for this manual trigger',
            default: 'Manual Trigger',
          },
          description: {
            type: 'string',
            description: 'Description of what this trigger does',
          },
          enabled: {
            type: 'boolean',
            description: 'Whether this trigger is enabled',
            default: true,
          },
        },
        required: [],
      },
    };
  }
}
