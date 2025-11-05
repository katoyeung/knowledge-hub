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
  contentField?: string; // Path to content field (e.g., "data.post_message", "post_message")
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

  protected async executeStep(
    inputSegments: any[],
    config: RuleBasedFilterConfig,
    _context: StepExecutionContext,
  ): Promise<any[]> {
    this.logger.log(
      `Starting rule-based filtering for ${inputSegments.length} segments`,
    );

    // Handle case where input is a wrapper structure containing an array
    let segmentsToProcess: any[] = inputSegments;
    let adjustedContentField = config.contentField;

    if (
      inputSegments.length === 1 &&
      inputSegments[0] &&
      typeof inputSegments[0] === 'object'
    ) {
      const wrapper = inputSegments[0];

      // Look for any array property in the wrapper
      for (const [key, value] of Object.entries(wrapper)) {
        if (Array.isArray(value) && value.length > 0) {
          // Check if this array contains objects (not primitives)
          if (
            value.length > 0 &&
            typeof value[0] === 'object' &&
            value[0] !== null
          ) {
            // Special case: if array[0] has a 'data' array, extract that
            if (
              'data' in value[0] &&
              Array.isArray(value[0].data) &&
              value[0].data.length > 0
            ) {
              segmentsToProcess = value[0].data;

              // Adjust content field if it starts with "data."
              if (
                adjustedContentField &&
                adjustedContentField.startsWith('data.')
              ) {
                adjustedContentField = adjustedContentField.substring(5); // Remove "data." prefix
              }
              break;
            }

            segmentsToProcess = value;

            // Adjust content field by removing the array property prefix
            if (
              adjustedContentField &&
              adjustedContentField.startsWith(`${key}.`)
            ) {
              adjustedContentField = adjustedContentField.substring(
                key.length + 1,
              ); // Remove "key." prefix
            }
            break;
          }
        }
      }
    }

    // Update the config with adjusted content field
    config.contentField = adjustedContentField;

    const outputSegments: any[] = [];
    const filteredSegments: any[] = [];
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

    while (currentIndex < segmentsToProcess.length) {
      const batch = segmentsToProcess.slice(
        currentIndex,
        currentIndex + batchSize,
      );

      for (const segment of batch) {
        segmentsProcessed++;

        // Extract content using the specified field path
        const content = this.extractContent(segment, config);

        // Check content length constraints
        if (this.shouldFilterByLength(content, config)) {
          segmentsFiltered++;
          filteredSegments.push(segment);
          continue;
        }

        // Apply filtering rules
        const ruleResult = this.applyRules(content, config, ruleMatches);

        if (ruleResult.action === 'remove') {
          segmentsFiltered++;
          filteredSegments.push(segment);
          this.logger.debug(
            `Filtered segment ${segment.id || 'unknown'} by rule: ${ruleResult.ruleName}`,
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
        (currentIndex / segmentsToProcess.length) * 100,
      );
      this.logger.log(
        `Rule-based filtering progress: ${progress}% (${currentIndex}/${segmentsToProcess.length} segments processed)`,
      );

      // Yield control back to the event loop after each batch
      if (currentIndex < segmentsToProcess.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    this.logger.log(
      `Rule-based filtering completed: ${segmentsFiltered} filtered, ${segmentsKept} kept`,
    );

    return outputSegments;
  }

  async execute(
    inputSegments: any, // Can be array, object, or anything - no wrapping
    config: RuleBasedFilterConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `[RULE-BASED-FILTER] Received input: type=${Array.isArray(inputSegments) ? 'array' : typeof inputSegments}, length=${Array.isArray(inputSegments) ? inputSegments.length : 'N/A'}, value=${JSON.stringify(inputSegments).substring(0, 300)}`,
    );

    // Use shared unwrapInput utility from BaseStep
    const unwrapResult = this.unwrapInput(inputSegments, config.contentField);
    const segmentsToProcess = unwrapResult.segments;
    const adjustedContentField =
      unwrapResult.adjustedFieldPath || config.contentField;

    // Update the config with adjusted content field
    const originalContentField = config.contentField;
    config.contentField = adjustedContentField;

    this.logger.log(
      `Processing ${segmentsToProcess.length} items${unwrapResult.extractedKey ? ` (extracted from ${unwrapResult.extractedKey} array)` : ''}`,
    );

    if (originalContentField !== adjustedContentField) {
      this.logger.log(
        `Content field adjusted from "${originalContentField}" to "${adjustedContentField}" (processing ${segmentsToProcess.length} segments)`,
      );
    } else if (adjustedContentField) {
      this.logger.log(
        `Using content field: "${adjustedContentField}" (processing ${segmentsToProcess.length} segments)`,
      );
    }

    if (segmentsToProcess.length > 0) {
      const firstSegment = segmentsToProcess[0];
      this.logger.log(
        `First segment keys: ${Object.keys(firstSegment).join(', ')}`,
      );

      const extractedContent = this.extractContent(firstSegment, config);
      this.logger.log(
        `First segment extracted content length: ${extractedContent?.length || 0}`,
      );
    }

    try {
      const outputSegments: any[] = [];
      const filteredSegments: any[] = [];
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

      while (currentIndex < segmentsToProcess.length) {
        const batch = segmentsToProcess.slice(
          currentIndex,
          currentIndex + batchSize,
        );

        for (const segment of batch) {
          segmentsProcessed++;

          // Extract content using the specified field path
          const content = this.extractContent(segment, config);

          // Log if content is empty
          if (!content || content.trim() === '') {
            this.logger.warn(
              `Empty content extracted from segment ${segment.id || 'unknown'}. Segment keys: ${Object.keys(segment).join(', ')}, contentField: "${config.contentField}"`,
            );
          } else {
            this.logger.debug(
              `Extracted content from segment ${segment.id || 'unknown'}: length=${content.length}, preview="${content.substring(0, 100)}"`,
            );
          }

          // Check content length constraints
          if (this.shouldFilterByLength(content, config)) {
            segmentsFiltered++;
            filteredSegments.push(segment);
            continue;
          }

          // Apply filtering rules
          const ruleResult = this.applyRules(content, config, ruleMatches);

          if (ruleResult.action === 'remove') {
            segmentsFiltered++;
            filteredSegments.push(segment);
            this.logger.debug(
              `Filtered segment ${segment.id || 'unknown'} by rule: ${ruleResult.ruleName}`,
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
        if (segmentsToProcess.length > 0) {
          const progress = Math.round(
            Math.min(100, (currentIndex / segmentsToProcess.length) * 100),
          );
          this.logger.log(
            `Rule-based filtering progress: ${progress}% (${currentIndex}/${segmentsToProcess.length} segments processed)`,
          );
        }

        // Yield control back to the event loop after each batch
        if (currentIndex < segmentsToProcess.length) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const endTime = new Date();
      // Convert segmentsToProcess to DocumentSegment[] for metrics calculation
      const inputSegmentsForMetrics =
        this.segmentsToDocumentSegments(segmentsToProcess);
      const metrics = this.calculateMetrics(
        inputSegmentsForMetrics,
        outputSegments,
        startTime,
        endTime,
      );

      // Add specific metrics for filtering
      metrics.segmentsProcessed = segmentsProcessed;
      metrics.segmentsFiltered = segmentsFiltered;
      metrics.segmentsKept = segmentsKept;
      metrics.filteringRate =
        segmentsToProcess.length > 0
          ? segmentsFiltered / segmentsToProcess.length
          : 0;
      metrics.ruleMatches = ruleMatches;

      this.logger.log(
        `Rule-based filtering completed: ${segmentsFiltered} filtered, ${segmentsKept} kept`,
      );

      // Format output according to user specification
      const formattedOutput = {
        items: outputSegments,
        total: outputSegments.length,
        filtered: filteredSegments,
        filtered_count: segmentsFiltered,
      };

      return {
        success: true,
        outputSegments: [formattedOutput] as any, // Wrap in array to maintain compatibility
        metrics,
        rollbackData: this.createRollbackData(inputSegmentsForMetrics, config),
        // Add count information for frontend display
        count: outputSegments.length,
        totalCount: segmentsToProcess.length,
        metadata: {
          filteredCount: segmentsFiltered,
        },
      };
    } catch (error) {
      this.logger.error('Rule-based filtering failed:', error);

      // Format error output according to user specification
      // Convert segmentsToProcess to DocumentSegment[] for error handling
      const inputSegmentsForError =
        this.segmentsToDocumentSegments(segmentsToProcess);
      const errorOutput = {
        items: segmentsToProcess,
        total: segmentsToProcess.length,
        filtered: [],
        filtered_count: 0,
      };

      return {
        success: false,
        outputSegments: [errorOutput] as any, // Wrap in array to maintain compatibility
        metrics: this.calculateMetrics(
          inputSegmentsForError,
          inputSegmentsForError,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegmentsForError, config),
        // Add count information for frontend display (error case)
        count: segmentsToProcess.length,
        totalCount: segmentsToProcess.length,
        metadata: {
          filteredCount: 0,
        },
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

  /**
   * Format output for storage/display
   * Returns the structured format with items, total, filtered, etc.
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    // Extract outputSegments - handle both array and single object formats
    let outputSegments: any[] = [];
    let filtered: any[] = [];
    let filteredCount = 0;

    if (Array.isArray(result.outputSegments)) {
      // If outputSegments is an array
      if (
        result.outputSegments.length === 1 &&
        typeof result.outputSegments[0] === 'object' &&
        result.outputSegments[0] !== null
      ) {
        const firstItem = result.outputSegments[0] as any;

        // Check if it's already a formatted structure with items
        if ('items' in firstItem) {
          // Already formatted structure - return as-is
          return firstItem;
        }

        // Check if it's a formatted structure with filtered data
        if ('filtered' in firstItem) {
          filtered = Array.isArray(firstItem.filtered)
            ? firstItem.filtered
            : [];
          filteredCount =
            typeof firstItem.filtered_count === 'number'
              ? firstItem.filtered_count
              : 0;
          outputSegments = Array.isArray(firstItem.items)
            ? firstItem.items
            : [];
        } else {
          // Regular segments array
          outputSegments = result.outputSegments as any[];
        }
      } else {
        // Multiple segments - treat as regular array
        outputSegments = result.outputSegments as any[];
      }
    } else if (
      result.outputSegments &&
      typeof result.outputSegments === 'object'
    ) {
      // If outputSegments is a single object (shouldn't happen, but handle it)
      outputSegments = [result.outputSegments as any];
    }

    // If we didn't get filtered count from the structure, try metadata
    if (filteredCount === 0 && result.metadata?.filteredCount !== undefined) {
      filteredCount = result.metadata.filteredCount;
    }

    const total = outputSegments.length;

    return {
      items: outputSegments,
      total,
      filtered,
      filtered_count: filteredCount,
    };
  }

  getMetadata() {
    return {
      type: 'rule_based_filter',
      name: 'Rule-Based Content Filtering',
      description:
        'Filter segments using configurable regex rules and patterns',
      version: '2.0.0',
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
          contentField: {
            type: 'string',
            description:
              'Path to content field (e.g., "data.post_message", "post_message"). Must be selected from previous output.',
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

  /**
   * Extract content from segment using the specified field path
   * Supports nested paths like "data.post_message" or "post_message"
   * Also handles paths that start with array keys (items, data, etc.) when segments are already extracted
   */
  private extractContent(segment: any, config: RuleBasedFilterConfig): string {
    // contentField is required - no default fallback
    if (!config.contentField) {
      this.logger.warn(
        'Content field not specified in config. Available segment keys: ' +
          Object.keys(segment).join(', '),
      );
      return '';
    }
    let fieldPath = config.contentField;

    this.logger.debug(
      `Extracting content with fieldPath="${fieldPath}", segment keys: ${Object.keys(segment).join(', ')}`,
    );

    // If it's a simple field (no dots), just get it directly
    if (!fieldPath.includes('.')) {
      const value = segment[fieldPath];
      if (value === undefined || value === null) {
        this.logger.warn(
          `Content field '${fieldPath}' not found in segment. Available fields: ${Object.keys(segment).join(', ')}`,
        );
        return '';
      }
      return String(value);
    }

    // Check if path starts with common array keys that might not exist in already-extracted segments
    // Common array property names: items, data, results, segments, output
    const commonArrayKeys = ['items', 'data', 'results', 'segments', 'output'];
    const parts = fieldPath.split('.');

    // If the first part is a common array key and doesn't exist in the segment, skip it
    if (parts.length > 1 && commonArrayKeys.includes(parts[0])) {
      if (!(parts[0] in segment)) {
        this.logger.debug(
          `Content field path starts with array key '${parts[0]}' which doesn't exist in segment. Removing prefix.`,
        );
        // Remove the array key prefix and try again
        fieldPath = parts.slice(1).join('.');
        this.logger.debug(`Adjusted content field path to: "${fieldPath}"`);
      }
    }

    // For nested paths like "data.post_message" or "meta.post_message", traverse the object
    const adjustedParts = fieldPath.split('.');
    let value: any = segment;

    for (let i = 0; i < adjustedParts.length; i++) {
      const part = adjustedParts[i];
      if (value && typeof value === 'object') {
        if (part in value) {
          value = value[part];
        } else {
          // Field not found - try to find the last part at the current level or top level
          const lastPart = adjustedParts[adjustedParts.length - 1];

          // Try to find the last part at current level
          if (value && typeof value === 'object' && lastPart in value) {
            this.logger.log(
              `Content field '${part}' not found, but found '${lastPart}' at current level. Using that instead.`,
            );
            value = value[lastPart];
            break;
          }

          // Try to find the last part at the top level
          if (lastPart in segment) {
            this.logger.log(
              `Content field '${part}' not found, but found '${lastPart}' at top level. Using that instead.`,
            );
            value = segment[lastPart];
            break;
          } else {
            this.logger.warn(
              `Content field path '${fieldPath}' not valid. Stuck at '${part}' in path. Available fields: ${value ? Object.keys(value).join(', ') : 'none'}`,
            );
            return '';
          }
        }
      } else {
        this.logger.warn(
          `Content field path '${fieldPath}' not valid. Stuck at '${part}' in path. Available fields: ${value ? Object.keys(value).join(', ') : 'none'}`,
        );
        return '';
      }
    }

    // Convert to string if it's not already
    if (typeof value === 'string') {
      return value;
    } else if (value !== undefined && value !== null) {
      return String(value);
    }

    this.logger.warn(
      `Content field path '${fieldPath}' resulted in null/undefined value`,
    );
    return '';
  }

  private shouldFilterByLength(
    content: string,
    config: RuleBasedFilterConfig,
  ): boolean {
    const contentLength = content.length;

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
    content: string,
    config: RuleBasedFilterConfig,
    ruleMatches: Record<string, number>,
  ): { action: string; ruleName: string } {
    const normalizedContent = config.caseSensitive
      ? content
      : content.toLowerCase();

    this.logger.debug(
      `Applying ${config.rules.filter((r) => r.enabled).length} enabled rules to content (length: ${content.length})`,
    );

    for (const rule of config.rules) {
      if (!rule.enabled) {
        this.logger.debug(
          `Rule ${rule.name} (${rule.id}) is disabled, skipping`,
        );
        continue;
      }

      try {
        const regex = new RegExp(rule.pattern, rule.flags || '');

        if (regex.test(normalizedContent)) {
          ruleMatches[rule.id]++;
          this.logger.debug(
            `Rule "${rule.name}" (${rule.id}) matched! Pattern: "${rule.pattern}", Action: ${rule.action}`,
          );
          return { action: rule.action, ruleName: rule.name };
        } else {
          this.logger.debug(
            `Rule "${rule.name}" (${rule.id}) did not match. Pattern: "${rule.pattern}"`,
          );
        }
      } catch (error) {
        this.logger.warn(`Error applying rule ${rule.name}: ${error.message}`);
      }
    }

    this.logger.debug(
      `No rules matched, using default action: ${config.defaultAction}`,
    );
    return { action: config.defaultAction, ruleName: 'default' };
  }
}
