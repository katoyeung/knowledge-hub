import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';

export interface DuplicateSegmentConfig extends StepConfig {
  method: 'content_hash' | 'content_similarity' | 'exact_match';
  action: 'skip' | 'remove' | 'merge';
  similarityThreshold?: number; // For content_similarity method (0-1)
  mergeStrategy?: 'first' | 'last' | 'longest' | 'shortest';
  caseSensitive?: boolean;
  ignoreWhitespace?: boolean;
  normalizeText?: boolean;
}

@Injectable()
export class DuplicateSegmentStep extends BaseStep {
  constructor() {
    super('duplicate_segment', 'Duplicate Segment Detection');
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: DuplicateSegmentConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting duplicate detection for ${inputSegments.length} segments`,
    );

    try {
      const outputSegments: DocumentSegment[] = [];
      const duplicateSegments: DocumentSegment[] = [];
      const seenHashes = new Set<string>();
      const seenContents = new Set<string>();
      let duplicatesFound = 0;
      let segmentsProcessed = 0;

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

          const normalizedContent = this.normalizeContent(
            segment.content,
            config,
          );
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
            this.logger.debug(
              `Found duplicate segment: ${segment.id} - "${segment.content.substring(0, 50)}..."`,
            );

            if (config.action === 'skip') {
              // Skip duplicate segments
              continue;
            } else if (config.action === 'remove') {
              // Remove duplicate segments
              continue;
            } else if (config.action === 'merge') {
              // Merge with existing segment (keep the first one)
              continue;
            }
          } else {
            // Add to seen sets
            if (config.method === 'content_hash') {
              const hash = this.generateContentHash(normalizedContent);
              seenHashes.add(hash);
            } else if (
              config.method === 'exact_match' ||
              config.method === 'content_similarity'
            ) {
              seenContents.add(normalizedContent);
            }

            outputSegments.push(segment);
          }
        }

        currentIndex += batchSize;

        // Log progress
        const progress = Math.round(
          (currentIndex / inputSegments.length) * 100,
        );
        this.logger.log(
          `Duplicate detection progress: ${progress}% (${currentIndex}/${inputSegments.length} segments processed)`,
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

      // Add specific metrics for duplicate detection
      metrics.duplicatesFound = duplicatesFound;
      metrics.segmentsProcessed = segmentsProcessed;
      metrics.deduplicationRate =
        inputSegments.length > 0 ? duplicatesFound / inputSegments.length : 0;

      this.logger.log(
        `Duplicate detection completed: ${duplicatesFound} duplicates found, ${outputSegments.length} segments remaining`,
      );

      return {
        success: true,
        outputSegments,
        duplicates: duplicateSegments,
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      this.logger.error('Duplicate detection failed:', error);
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
    config: DuplicateSegmentConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.method) {
      errors.push('Method is required');
    } else if (
      !['content_hash', 'content_similarity', 'exact_match'].includes(
        config.method,
      )
    ) {
      errors.push(
        'Method must be one of: content_hash, content_similarity, exact_match',
      );
    }

    if (!config.action) {
      errors.push('Action is required');
    } else if (!['skip', 'remove', 'merge'].includes(config.action)) {
      errors.push('Action must be one of: skip, remove, merge');
    }

    if (config.method === 'content_similarity') {
      if (config.similarityThreshold === undefined) {
        errors.push(
          'Similarity threshold is required for content_similarity method',
        );
      } else if (
        config.similarityThreshold < 0 ||
        config.similarityThreshold > 1
      ) {
        errors.push('Similarity threshold must be between 0 and 1');
      }
    }

    if (config.action === 'merge' && !config.mergeStrategy) {
      errors.push('Merge strategy is required when action is merge');
    } else if (
      config.mergeStrategy &&
      !['first', 'last', 'longest', 'shortest'].includes(config.mergeStrategy)
    ) {
      errors.push(
        'Merge strategy must be one of: first, last, longest, shortest',
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
      this.logger.log('Rolling back duplicate detection step');
      // For duplicate detection, rollback is typically not needed as we don't modify the database
      // The original segments are preserved in rollbackData
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'duplicate_segment',
      name: 'Duplicate Segment Detection',
      description: 'Detect and handle duplicate segments using various methods',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['content_hash', 'content_similarity', 'exact_match'],
            description: 'Method for detecting duplicates',
          },
          action: {
            type: 'string',
            enum: ['skip', 'remove', 'merge'],
            description: 'Action to take with duplicate segments',
          },
          similarityThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Similarity threshold for content_similarity method',
          },
          mergeStrategy: {
            type: 'string',
            enum: ['first', 'last', 'longest', 'shortest'],
            description: 'Strategy for merging duplicate segments',
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
        required: ['method', 'action'],
      },
    };
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
    segment: DocumentSegment,
    normalizedContent: string,
    config: DuplicateSegmentConfig,
    seenHashes: Set<string>,
    seenContents: Set<string>,
  ): boolean {
    switch (config.method) {
      case 'content_hash':
        const hash = this.generateContentHash(normalizedContent);
        return seenHashes.has(hash);

      case 'exact_match':
        return seenContents.has(normalizedContent);

      case 'content_similarity':
        // Check similarity against all seen contents
        for (const seenContent of seenContents) {
          const similarity = this.calculateSimilarity(
            normalizedContent,
            seenContent,
          );
          if (similarity >= (config.similarityThreshold || 0.8)) {
            return true;
          }
        }
        return false;

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
