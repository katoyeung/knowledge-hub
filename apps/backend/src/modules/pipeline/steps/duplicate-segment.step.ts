import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export interface DuplicateSegmentConfig extends StepConfig {
  method: 'hash' | 'similarity';
  similarityThreshold?: number; // For similarity method (0-1)
  contentField?: string; // Path to content field (e.g., "data.post_message", "post_message")
  caseSensitive?: boolean;
  ignoreWhitespace?: boolean;
  normalizeText?: boolean;
}

@Injectable()
export class DuplicateSegmentStep extends BaseStep {
  constructor() {
    super('duplicate_segment', 'Duplicate Segment Detection');
  }

  /**
   * Main execution logic - detect and remove duplicates
   */
  protected async executeStep(
    inputSegments: any[],
    config: DuplicateSegmentConfig,
    _context: StepExecutionContext,
  ): Promise<any[]> {
    this.logger.log(
      `Starting duplicate detection for ${inputSegments.length} segments`,
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
                const originalField = adjustedContentField;
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
              const originalField = adjustedContentField;
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

    if (segmentsToProcess.length > 0) {
      const firstSegment = segmentsToProcess[0];

      // Try extracting content
      const extractedContent = this.extractContent(firstSegment, config);

      if (extractedContent.length < 100) {
      } else {
      }

      // If content is empty, show more details
      if (!extractedContent || extractedContent.trim() === '') {
        for (const key in firstSegment) {
        }
      }
    }

    // Log similarity threshold

    const outputSegments: any[] = [];
    const seenHashes = new Set<string>();
    const seenContents = new Set<string>();
    let duplicatesFound = 0;
    let segmentsProcessed = 0;

    // Process segments in batches to avoid blocking the event loop
    const batchSize = 100;
    let currentIndex = 0;

    while (currentIndex < segmentsToProcess.length) {
      const batch = segmentsToProcess.slice(
        currentIndex,
        currentIndex + batchSize,
      );

      for (const segment of batch) {
        segmentsProcessed++;


        const content = this.extractContent(segment, config);
        const normalizedContent = this.normalizeContent(content, config);


        if (!content || content.trim() === '') {
          this.logger.warn(
            `Empty content extracted from segment ${segment.id || 'unknown'}`,
          );
        }

        const isDuplicate = this.isDuplicate(
          segment,
          normalizedContent,
          config,
          seenHashes,
          seenContents,
        );


        if (isDuplicate) {
          duplicatesFound++;
          continue;
        } else {
          // Add to seen sets
          if (config.method === 'hash') {
            const hash = this.generateContentHash(normalizedContent);
            seenHashes.add(hash);
          } else if (config.method === 'similarity') {
            seenContents.add(normalizedContent);
          }
          // Return the raw data object, not wrapped in DocumentSegment
          outputSegments.push(segment);
        }
      }

      currentIndex += batchSize;

      // Log progress
      if (inputSegments.length > 0) {
        const progress = Math.round(
          Math.min(100, (currentIndex / inputSegments.length) * 100),
        );
        this.logger.log(
          `Duplicate detection progress: ${progress}% (${currentIndex}/${inputSegments.length} segments processed)`,
        );
      }

      // Yield control back to the event loop after each batch
      if (currentIndex < inputSegments.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    this.logger.log(
      `Duplicate detection completed. Processed ${segmentsProcessed} segments, found ${duplicatesFound} duplicates, returning ${outputSegments.length} unique segments`,
    );

    return outputSegments;
  }

  async execute(
    inputSegments: any[],
    config: DuplicateSegmentConfig,
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting duplicate detection for ${inputSegments.length} segments`,
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
                const originalField = adjustedContentField;
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
              const originalField = adjustedContentField;
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

    if (segmentsToProcess.length > 0) {
      const firstSegment = segmentsToProcess[0];

      const extractedContent = this.extractContent(firstSegment, config);

      if (extractedContent.length < 100) {
      } else {
      }

      if (!extractedContent || extractedContent.trim() === '') {
        for (const key in firstSegment) {
        }
      }
    }

    try {
      const outputSegments: any[] = [];
      const duplicateSegments: any[] = [];
      const seenHashes = new Set<string>();
      const seenContents = new Set<string>();
      let duplicatesFound = 0;
      let segmentsProcessed = 0;

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
          const normalizedContent = this.normalizeContent(content, config);


          // Log if content is empty
          if (!content || content.trim() === '') {
            this.logger.warn(
              `Empty content extracted from segment ${segment.id || 'unknown'}. Segment keys: ${Object.keys(segment).join(', ')}`,
            );
          }

          const isDuplicate = this.isDuplicate(
            segment,
            normalizedContent,
            config,
            seenHashes,
            seenContents,
          );


          if (isDuplicate) {
            duplicatesFound++;
            duplicateSegments.push(segment);
            // Skip duplicate segments (removed)
            continue;
          } else {
            // Add to seen sets
            if (config.method === 'hash') {
              const hash = this.generateContentHash(normalizedContent);
              seenHashes.add(hash);
            } else if (config.method === 'similarity') {
              seenContents.add(normalizedContent);
            }

            outputSegments.push(segment);
          }
        }

        currentIndex += batchSize;

        // Log progress
        if (inputSegments.length > 0) {
          const progress = Math.round(
            Math.min(100, (currentIndex / inputSegments.length) * 100),
          );
          this.logger.log(
            `Duplicate detection progress: ${progress}% (${currentIndex}/${inputSegments.length} segments processed)`,
          );
        }

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

      // Add specific metrics for duplicate detection
      metrics.duplicatesFound = duplicatesFound;
      metrics.segmentsProcessed = segmentsProcessed;
      metrics.deduplicationRate =
        inputSegments.length > 0 ? duplicatesFound / inputSegments.length : 0;

      this.logger.log(
        `Duplicate detection completed: ${duplicatesFound} duplicates found, ${outputSegments.length} segments remaining`,
      );

      // Format output according to user specification
      const formattedOutput = {
        items: outputSegments,
        total: outputSegments.length,
        duplicates: duplicateSegments,
        duplicate_count: duplicatesFound,
      };

      return {
        success: true,
        outputSegments: [formattedOutput] as any, // Wrap in array to maintain compatibility
        // duplicates field is already included in formattedOutput, no need to duplicate
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
        // Add count information for frontend display
        count: outputSegments.length,
        totalCount: segmentsToProcess.length,
        duplicateCount: duplicatesFound,
      };
    } catch (error) {
      this.logger.error('Duplicate detection failed:', error);

      // Format error output according to user specification
      const errorOutput = {
        items: inputSegments,
        total: inputSegments.length,
        duplicates: [],
        duplicate_count: 0,
      };

      return {
        success: false,
        outputSegments: [errorOutput] as any, // Wrap in array to maintain compatibility
        metrics: this.calculateMetrics(
          inputSegments,
          inputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegments, config),
        // Add count information for frontend display (error case)
        count: inputSegments.length,
        totalCount: inputSegments.length,
        duplicateCount: 0,
      };
    }
  }

  async validate(
    config: DuplicateSegmentConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.method) {
      errors.push('Method is required');
    } else if (!['hash', 'similarity'].includes(config.method)) {
      errors.push('Method must be one of: hash, similarity');
    }

    if (config.method === 'similarity') {
      if (config.similarityThreshold === undefined) {
        errors.push('Similarity threshold is required for similarity method');
      } else if (
        config.similarityThreshold < 0 ||
        config.similarityThreshold > 1
      ) {
        errors.push('Similarity threshold must be between 0 and 1');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async rollback(
    _rollbackData: any,
    _context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log('Rolling back duplicate detection step');
      // For duplicate detection, rollback is typically not needed as we don't modify the database
      // The original segments are preserved in rollbackData
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format output for storage/display
   * Returns the structured format with items, total, duplicates, etc.
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    // Extract outputSegments - handle both array and single object formats
    let outputSegments: any[] = [];
    if (Array.isArray(result.outputSegments)) {
      // If outputSegments is an array
      if (
        result.outputSegments.length === 1 &&
        typeof result.outputSegments[0] === 'object' &&
        result.outputSegments[0] !== null &&
        'items' in result.outputSegments[0]
      ) {
        // Already formatted structure
        return result.outputSegments[0];
      }
      outputSegments = result.outputSegments;
    } else if (
      result.outputSegments &&
      typeof result.outputSegments === 'object'
    ) {
      // If outputSegments is a single object (shouldn't happen, but handle it)
      outputSegments = [result.outputSegments];
    }

    // Build formatted output structure
    const duplicates = result.duplicates || [];
    const total = outputSegments.length;
    const duplicateCount = duplicates.length;

    return {
      items: outputSegments,
      total,
      duplicates,
      duplicate_count: duplicateCount,
    };
  }

  getMetadata() {
    return {
      type: 'duplicate_segment',
      name: 'Duplicate Segment Detection',
      description: 'Detect duplicate segments using hash or similarity',
      version: '2.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['hash', 'similarity'],
            description: 'Method for detecting duplicates (hash or similarity)',
            default: 'hash',
          },
          similarityThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Similarity threshold for similarity method (0-1)',
            default: 0.8,
          },
          contentField: {
            type: 'string',
            description:
              'Path to content field (e.g., "data.post_message", "post_message")',
            default: 'content',
          },
          caseSensitive: {
            type: 'boolean',
            default: false,
            description: 'Whether to consider case when comparing content',
          },
          ignoreWhitespace: {
            type: 'boolean',
            default: true,
            description: 'Whether to ignore whitespace differences',
          },
          normalizeText: {
            type: 'boolean',
            default: true,
            description: 'Whether to normalize text before comparison',
          },
        },
        required: ['method'],
      },
    };
  }

  /**
   * Extract content from segment using the specified field path
   * Supports nested paths like "data.post_message" or "post_message"
   */
  private extractContent(segment: any, config: DuplicateSegmentConfig): string {
    const fieldPath = config.contentField || 'content';

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

    // For nested paths like "data.post_message", traverse the object
    const parts = fieldPath.split('.');
    let value: any = segment;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        if (part in value) {
          value = value[part];
        } else {
          // Field not found - try to find the last part at the top level
          const lastPart = parts[parts.length - 1];
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

  private normalizeContent(
    content: string,
    config: DuplicateSegmentConfig,
  ): string {
    let normalized = content;

    if (config.normalizeText !== false) {
      // Normalize unicode characters
      normalized = normalized.normalize('NFD');
    }

    if (config.ignoreWhitespace !== false) {
      // Replace multiple whitespace with single space
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    if (config.caseSensitive === false) {
      normalized = normalized.toLowerCase();
    }

    return normalized;
  }

  private generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private isDuplicate(
    segment: any,
    normalizedContent: string,
    config: DuplicateSegmentConfig,
    seenHashes: Set<string>,
    seenContents: Set<string>,
  ): boolean {
    switch (config.method) {
      case 'hash': {
        const hash = this.generateContentHash(normalizedContent);
        return seenHashes.has(hash);
      }

      case 'similarity': {
        // Check similarity against all seen contents
        const threshold =
          config.similarityThreshold !== undefined
            ? config.similarityThreshold
            : 0.8;

        // Special case: threshold 0 means everything is a duplicate
        if (threshold === 0) {
          return seenContents.size > 0; // First item is not duplicate, rest are
        }

        for (const seenContent of seenContents) {
          const similarity = this.calculateSimilarity(
            normalizedContent,
            seenContent,
          );
          if (similarity >= threshold) {
            return true;
          }
        }
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * Calculate similarity between two text strings using Jaccard similarity
   * @param text1 First text string
   * @param text2 Second text string
   * @returns Similarity score between 0 and 1
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    // Convert to lowercase and split into words
    const words1 = text1
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    const words2 = text2
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);

    // Create sets of unique words
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // Calculate Jaccard similarity: |A ∩ B| / |A ∪ B|
    const intersection = new Set([...set1].filter((word) => set2.has(word)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0.0;

    return intersection.size / union.size;
  }
}
