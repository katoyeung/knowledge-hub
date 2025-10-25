import { Injectable } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';

export interface FilterRule {
  id: string;
  name: string;
  pattern: string;
  flags?: string; // Regex flags like 'i', 'g', 'm'
  action: 'remove' | 'keep' | 'flag';
  description?: string;
  enabled: boolean;
}

export interface RuleBasedFilterConfig extends StepConfig {
  rules: FilterRule[];
  defaultAction: 'keep' | 'remove'; // Action when no rules match
  caseSensitive?: boolean;
  wholeWord?: boolean;
  minContentLength?: number;
  maxContentLength?: number;
  preserveEmptySegments?: boolean;
}

@Injectable()
export class RuleBasedFilterStep extends BaseStep {
  constructor() {
    super('rule_based_filter', 'Rule-Based Content Filtering');
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: RuleBasedFilterConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting rule-based filtering for ${inputSegments.length} segments`,
    );

    try {
      const outputSegments: DocumentSegment[] = [];
      const filteredSegments: DocumentSegment[] = [];
      let segmentsProcessed = 0;
      let segmentsFiltered = 0;
      let segmentsKept = 0;
      const ruleMatches: Record<string, number> = {};

      // Initialize rule match counters
      config.rules.forEach((rule) => {
        ruleMatches[rule.id] = 0;
      });

      // Process segments in batches to avoid blocking the event loop
      const batchSize = 100; // Process 100 segments at a time
      let currentIndex = 0;

      while (currentIndex < inputSegments.length) {
        const batch = inputSegments.slice(
          currentIndex,
          currentIndex + batchSize,
        );

        for (const segment of batch) {
          segmentsProcessed++;

          // Check content length constraints
          if (this.shouldFilterByLength(segment, config)) {
            segmentsFiltered++;
            filteredSegments.push(segment);
            continue;
          }

          // Apply filtering rules
          const ruleResult = this.applyRules(segment, config, ruleMatches);

          if (ruleResult.action === 'remove') {
            segmentsFiltered++;
            filteredSegments.push(segment);
            this.logger.debug(
              `Filtered segment ${segment.id} by rule: ${ruleResult.ruleName}`,
            );
          } else if (ruleResult.action === 'keep') {
            segmentsKept++;
            outputSegments.push(segment);
          } else if (ruleResult.action === 'flag') {
            // For now, treat 'flag' as 'keep' but could be extended to add metadata
            segmentsKept++;
            outputSegments.push(segment);
          } else {
            // Default action
            if (config.defaultAction === 'remove') {
              segmentsFiltered++;
              filteredSegments.push(segment);
            } else {
              segmentsKept++;
              outputSegments.push(segment);
            }
          }
        }

        currentIndex += batchSize;

        // Log progress
        const progress = Math.round(
          (currentIndex / inputSegments.length) * 100,
        );
        this.logger.log(
          `Rule-based filtering progress: ${progress}% (${currentIndex}/${inputSegments.length} segments processed)`,
        );

        // Yield control back to the event loop after each batch
        if (currentIndex < inputSegments.length) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        outputSegments,
        startTime,
        endTime,
      );

      // Add specific metrics for filtering
      metrics.segmentsProcessed = segmentsProcessed;
      metrics.segmentsFiltered = segmentsFiltered;
      metrics.segmentsKept = segmentsKept;
      metrics.filteringRate =
        inputSegments.length > 0 ? segmentsFiltered / inputSegments.length : 0;
      metrics.ruleMatches = ruleMatches;

      this.logger.log(
        `Rule-based filtering completed: ${segmentsFiltered} filtered, ${segmentsKept} kept`,
      );

      return {
        success: true,
        outputSegments,
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      this.logger.error('Rule-based filtering failed:', error);
      return {
        success: false,
        outputSegments: inputSegments, // Return original segments on error
        metrics: this.calculateMetrics(
          inputSegments,
          inputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    }
  }

  async validate(
    config: RuleBasedFilterConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.rules || !Array.isArray(config.rules)) {
      errors.push('Rules array is required');
    } else {
      config.rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`Rule ${index}: ID is required`);
        }
        if (!rule.name) {
          errors.push(`Rule ${index}: Name is required`);
        }
        if (!rule.pattern) {
          errors.push(`Rule ${index}: Pattern is required`);
        } else {
          // Validate regex pattern
          try {
            new RegExp(rule.pattern, rule.flags || '');
          } catch (regexError) {
            errors.push(
              `Rule ${index}: Invalid regex pattern - ${regexError.message}`,
            );
          }
        }
        if (!rule.action || !['remove', 'keep', 'flag'].includes(rule.action)) {
          errors.push(
            `Rule ${index}: Action must be one of: remove, keep, flag`,
          );
        }
      });
    }

    if (
      !config.defaultAction ||
      !['keep', 'remove'].includes(config.defaultAction)
    ) {
      errors.push('Default action must be one of: keep, remove');
    }

    if (config.minContentLength !== undefined && config.minContentLength < 0) {
      errors.push('Minimum content length must be non-negative');
    }

    if (config.maxContentLength !== undefined && config.maxContentLength < 0) {
      errors.push('Maximum content length must be non-negative');
    }

    if (
      config.minContentLength !== undefined &&
      config.maxContentLength !== undefined &&
      config.minContentLength > config.maxContentLength
    ) {
      errors.push(
        'Minimum content length cannot be greater than maximum content length',
      );
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
    try {
      this.logger.log('Rolling back rule-based filtering step');
      // For filtering, rollback is typically not needed as we don't modify the database
      // The original segments are preserved in rollbackData
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'rule_based_filter',
      name: 'Rule-Based Content Filtering',
      description:
        'Filter segments using configurable regex rules and patterns',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique rule identifier' },
                name: { type: 'string', description: 'Rule name' },
                pattern: { type: 'string', description: 'Regex pattern' },
                flags: {
                  type: 'string',
                  description: 'Regex flags (i, g, m, etc.)',
                },
                action: {
                  type: 'string',
                  enum: ['remove', 'keep', 'flag'],
                  description: 'Action to take when pattern matches',
                },
                description: {
                  type: 'string',
                  description: 'Rule description',
                },
                enabled: {
                  type: 'boolean',
                  default: true,
                  description: 'Whether rule is enabled',
                },
              },
              required: ['id', 'name', 'pattern', 'action'],
            },
            description: 'Array of filtering rules',
          },
          defaultAction: {
            type: 'string',
            enum: ['keep', 'remove'],
            description: 'Default action when no rules match',
          },
          caseSensitive: {
            type: 'boolean',
            default: false,
            description: 'Whether pattern matching is case sensitive',
          },
          wholeWord: {
            type: 'boolean',
            default: false,
            description: 'Whether to match whole words only',
          },
          minContentLength: {
            type: 'number',
            minimum: 0,
            description: 'Minimum content length to keep',
          },
          maxContentLength: {
            type: 'number',
            minimum: 0,
            description: 'Maximum content length to keep',
          },
          preserveEmptySegments: {
            type: 'boolean',
            default: false,
            description: 'Whether to preserve empty segments',
          },
        },
        required: ['rules', 'defaultAction'],
      },
    };
  }

  private shouldFilterByLength(
    segment: DocumentSegment,
    config: RuleBasedFilterConfig,
  ): boolean {
    const contentLength = segment.content.length;

    if (
      config.minContentLength !== undefined &&
      contentLength < config.minContentLength
    ) {
      return true;
    }

    if (
      config.maxContentLength !== undefined &&
      contentLength > config.maxContentLength
    ) {
      return true;
    }

    if (!config.preserveEmptySegments && contentLength === 0) {
      return true;
    }

    return false;
  }

  private applyRules(
    segment: DocumentSegment,
    config: RuleBasedFilterConfig,
    ruleMatches: Record<string, number>,
  ): { action: string; ruleName: string } {
    for (const rule of config.rules) {
      if (!rule.enabled) {
        continue;
      }

      try {
        const regex = new RegExp(rule.pattern, rule.flags || '');
        const content = config.caseSensitive
          ? segment.content
          : segment.content.toLowerCase();

        if (regex.test(content)) {
          ruleMatches[rule.id]++;
          return { action: rule.action, ruleName: rule.name };
        }
      } catch (error) {
        this.logger.warn(`Error applying rule ${rule.name}: ${error.message}`);
      }
    }

    return { action: config.defaultAction, ruleName: 'default' };
  }
}
