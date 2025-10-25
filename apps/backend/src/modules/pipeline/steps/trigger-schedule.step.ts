import { Injectable, Logger } from '@nestjs/common';
import { BaseStep } from './base.step';
import {
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface TriggerScheduleConfig extends StepConfig {
  schedule: string; // Cron expression
  timezone?: string;
  enabled?: boolean;
  description?: string;
}

@Injectable()
export class TriggerScheduleStep extends BaseStep {
  constructor() {
    super('trigger_schedule', 'Schedule Trigger');
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: TriggerScheduleConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.logger.log(`Executing scheduled trigger: ${config.schedule}`);

    try {
      // Schedule triggers would typically be handled by a scheduler
      // This execution is for testing or immediate execution
      return {
        success: true,
        outputSegments: inputSegments, // Pass through input segments
        metrics: {
          triggerType: 'schedule',
          schedule: config.schedule,
          timezone: config.timezone || 'UTC',
          description: config.description || 'Scheduled workflow execution',
          timestamp: new Date().toISOString(),
          nextExecution: this.getNextExecutionTime(config.schedule),
          context: context.executionId,
        },
      };
    } catch (error) {
      this.logger.error(`Scheduled trigger execution failed: ${error.message}`);
      return {
        success: false,
        outputSegments: [],
        metrics: {},
        error: error.message,
      };
    }
  }

  async validate(
    config: TriggerScheduleConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate cron expression
    if (!config.schedule) {
      errors.push('Schedule is required');
    } else {
      // Basic cron validation (5 fields: minute hour day month weekday)
      const cronParts = config.schedule.trim().split(/\s+/);
      if (cronParts.length !== 5) {
        errors.push('Schedule must be a valid cron expression with 5 fields');
      }
    }

    // Validate timezone if provided
    if (config.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: config.timezone });
      } catch {
        errors.push('Invalid timezone provided');
      }
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
    this.logger.log('Rolling back scheduled trigger');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'trigger_schedule',
      name: 'Schedule Trigger',
      description:
        'Trigger workflow execution on a schedule using cron expressions',
      version: '1.0.0',
      inputTypes: [], // Triggers don't have inputs
      outputTypes: ['trigger_data'],
      configSchema: {
        type: 'object',
        properties: {
          schedule: {
            type: 'string',
            description:
              'Cron expression for scheduling (e.g., "0 9 * * *" for daily at 9 AM)',
            pattern: '^\\s*((\\*|\\?|\\d+)(\\s+(\\*|\\?|\\d+)){4})\\s*$',
          },
          timezone: {
            type: 'string',
            description:
              'Timezone for the schedule (e.g., "UTC", "America/New_York")',
            default: 'UTC',
          },
          enabled: {
            type: 'boolean',
            description: 'Whether this trigger is enabled',
            default: true,
          },
          description: {
            type: 'string',
            description: 'Description of what this trigger does',
          },
        },
        required: ['schedule'],
      },
    };
  }

  private getNextExecutionTime(cronExpression: string): string {
    // This is a simplified implementation
    // In a real system, you'd use a proper cron parser
    try {
      const now = new Date();
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours as placeholder
      return next.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}
