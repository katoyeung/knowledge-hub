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
          undefined, // seenWordSets not used in old executeStep path
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
    inputSegments: any,
    config: DuplicateSegmentConfig,
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();

    // Ensure inputSegments is handled correctly - it might be an array, object, or anything
    this.logger.log(
      `Starting duplicate detection. Input type: ${Array.isArray(inputSegments) ? 'array' : typeof inputSegments}, length: ${Array.isArray(inputSegments) ? inputSegments.length : 'N/A'}`,
    );

    // Normalize similarityThreshold to number if it's a string
    if (
      config.method === 'similarity' &&
      config.similarityThreshold !== undefined
    ) {
      if (typeof config.similarityThreshold === 'string') {
        const parsed = parseFloat(config.similarityThreshold);
        if (!isNaN(parsed)) {
          const originalValue = config.similarityThreshold;
          config.similarityThreshold = parsed;
          this.logger.log(
            `Converted similarityThreshold from string "${originalValue}" to number: ${parsed}`,
          );
        } else {
          this.logger.warn(
            `Invalid similarityThreshold string: "${config.similarityThreshold}", using default 0.8`,
          );
          config.similarityThreshold = 0.8;
        }
      }
      // Ensure it's within valid range
      if (config.similarityThreshold < 0 || config.similarityThreshold > 1) {
        this.logger.warn(
          `Similarity threshold ${config.similarityThreshold} out of range, clamping to [0, 1]`,
        );
        config.similarityThreshold = Math.max(
          0,
          Math.min(1, config.similarityThreshold),
        );
      }
      this.logger.log(
        `Using similarity method with threshold: ${config.similarityThreshold} (type: ${typeof config.similarityThreshold})`,
      );
    }

    // Use shared unwrapInput utility from BaseStep
    const unwrapResult = this.unwrapInput(inputSegments, config.contentField);
    let segmentsToProcess = unwrapResult.segments;

    // Defensive check: ensure segmentsToProcess is always an array
    if (!Array.isArray(segmentsToProcess)) {
      this.logger.warn(
        `unwrapInput returned non-array segments. Type: ${typeof segmentsToProcess}, converting to array.`,
      );
      segmentsToProcess = segmentsToProcess ? [segmentsToProcess] : [];
    }

    let adjustedContentField =
      unwrapResult.adjustedFieldPath || config.contentField;
    const extractedArrayKey = unwrapResult.extractedKey;

    // Additional adjustment: if segments are already extracted (multiple segments),
    // try to detect which array property they came from and remove its prefix
    // This handles the case where convertPreviousOutputToSegments already extracted items/data/results
    if (
      segmentsToProcess.length > 1 &&
      adjustedContentField &&
      !extractedArrayKey // Only do this if we didn't already extract from a wrapper
    ) {
      // Common array property names that might be in contentField paths
      const commonArrayKeys = [
        'items',
        'data',
        'results',
        'segments',
        'output',
      ];

      for (const arrayKey of commonArrayKeys) {
        if (adjustedContentField.startsWith(`${arrayKey}.`)) {
          const beforeAdjust = adjustedContentField;
          adjustedContentField = adjustedContentField.substring(
            arrayKey.length + 1,
          ); // Remove "arrayKey." prefix
          this.logger.log(
            `Content field adjusted from "${beforeAdjust}" to "${adjustedContentField}" (segments already extracted from ${arrayKey} array)`,
          );
          break;
        }
      }
    }

    // Update the config with adjusted content field
    const originalContentField = config.contentField;
    config.contentField = adjustedContentField;

    if (originalContentField !== adjustedContentField) {
      this.logger.log(
        `Content field adjusted from "${originalContentField}" to "${adjustedContentField}" (processing ${segmentsToProcess.length} segments)`,
      );
    } else {
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
      // Cache word sets for similarity method to avoid recomputing
      const seenWordSets = new Map<string, Set<string>>();
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
            seenWordSets,
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
              // Cache word set for faster future comparisons
              const words = this.extractWords(normalizedContent);
              seenWordSets.set(normalizedContent, words);
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

      // Convert segmentsToProcess to DocumentSegment format for rollback
      const inputSegmentsForRollback =
        this.segmentsToDocumentSegments(segmentsToProcess);

      return {
        success: true,
        outputSegments: [formattedOutput] as any, // Wrap in array to maintain compatibility
        // duplicates field is already included in formattedOutput, no need to duplicate
        metrics,
        rollbackData: this.createRollbackData(inputSegmentsForRollback, config),
        // Add count information for frontend display
        count: outputSegments.length,
        totalCount: segmentsToProcess.length,
        duplicateCount: duplicatesFound,
      };
    } catch (error) {
      this.logger.error('Duplicate detection failed:', error);

      // Convert inputSegments to array format for error handling
      // Use unwrapInput to safely extract segments
      const unwrapResult = this.unwrapInput(inputSegments, config.contentField);
      let errorSegments = unwrapResult.segments;
      if (!Array.isArray(errorSegments)) {
        errorSegments = errorSegments ? [errorSegments] : [];
      }

      // Convert to DocumentSegment format for rollback and metrics
      const errorInputSegments = this.segmentsToDocumentSegments(errorSegments);

      // Format error output according to user specification
      const errorOutput = {
        items: errorSegments,
        total: errorSegments.length,
        duplicates: [],
        duplicate_count: 0,
      };

      return {
        success: false,
        outputSegments: [errorOutput] as any, // Wrap in array to maintain compatibility
        metrics: this.calculateMetrics(
          errorInputSegments,
          errorInputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(errorInputSegments, config),
        // Add count information for frontend display (error case)
        count: errorSegments.length,
        totalCount: errorSegments.length,
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
   * Also handles paths that start with array keys (items, data, etc.) when segments are already extracted
   */
  private extractContent(segment: any, config: DuplicateSegmentConfig): string {
    let fieldPath = config.contentField || 'content';

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
    seenWordSets?: Map<string, Set<string>>,
  ): boolean {
    switch (config.method) {
      case 'hash': {
        const hash = this.generateContentHash(normalizedContent);
        return seenHashes.has(hash);
      }

      case 'similarity': {
        // Check similarity against all seen contents
        // Ensure threshold is a number (handle string conversion from frontend)
        let threshold =
          config.similarityThreshold !== undefined
            ? config.similarityThreshold
            : 0.8;

        // Convert to number if it's a string (common issue from frontend form inputs)
        if (typeof threshold === 'string') {
          threshold = parseFloat(threshold);
          if (isNaN(threshold)) {
            this.logger.warn(
              `Invalid similarity threshold: ${config.similarityThreshold}, using default 0.8`,
            );
            threshold = 0.8;
          }
        }

        // Validate threshold is between 0 and 1
        if (threshold < 0 || threshold > 1) {
          this.logger.warn(
            `Similarity threshold ${threshold} out of range [0, 1], clamping to valid range`,
          );
          threshold = Math.max(0, Math.min(1, threshold));
        }

        this.logger.debug(
          `Checking similarity with threshold: ${threshold} (type: ${typeof threshold})`,
        );

        // Special case: threshold 0 means everything is a duplicate
        if (threshold === 0) {
          return seenContents.size > 0; // First item is not duplicate, rest are
        }

        // Pre-compute word set for current content
        const currentWords = this.extractWords(normalizedContent);
        const currentWordCount = currentWords.size;

        // Quick optimization: if current content is empty, skip similarity check
        if (currentWordCount === 0) {
          return seenContents.size > 0;
        }

        // For high thresholds (>0.8), we can use length-based filtering first
        // If texts are very different in length, similarity will be low
        const useLengthFilter = threshold > 0.8;
        const currentLength = normalizedContent.length;

        let comparisons = 0;
        const maxComparisons = 100; // Limit comparisons for performance
        const seenContentsArray = Array.from(seenContents);

        // Process in batches and limit comparisons for very large datasets
        for (
          let i = 0;
          i < seenContentsArray.length && comparisons < maxComparisons;
          i++
        ) {
          const seenContent = seenContentsArray[i];
          comparisons++;

          // Quick length-based filter for high thresholds
          if (useLengthFilter) {
            const seenLength = seenContent.length;
            const lengthRatio =
              Math.min(currentLength, seenLength) /
              Math.max(currentLength, seenLength);
            // If length ratio is too different, similarity will be low
            if (lengthRatio < threshold * 0.7) {
              continue;
            }
          }

          // Use cached word sets if available for faster comparison
          let similarity: number;
          if (seenWordSets && seenWordSets.has(seenContent)) {
            const seenWords = seenWordSets.get(seenContent)!;
            similarity = this.calculateSimilarityFast(currentWords, seenWords);
          } else {
            similarity = this.calculateSimilarity(
              normalizedContent,
              seenContent,
            );
          }

          // Log first few comparisons for debugging
          if (seenContents.size <= 3) {
            this.logger.log(
              `Comparing with seen content (${seenContents.size} total): similarity=${similarity.toFixed(4)}, threshold=${threshold}, isDuplicate=${similarity >= threshold}`,
            );
          }

          if (similarity >= threshold) {
            this.logger.debug(
              `Duplicate found: similarity ${similarity.toFixed(4)} >= threshold ${threshold}`,
            );
            return true;
          }
        }

        // If we hit the comparison limit, sample remaining items
        if (
          seenContentsArray.length > maxComparisons &&
          comparisons >= maxComparisons
        ) {
          const remainingItems = seenContentsArray.slice(maxComparisons);
          // Sample every Nth item for very large datasets
          const sampleRate = Math.ceil(remainingItems.length / 50); // Sample ~50 more items
          for (let i = 0; i < remainingItems.length; i += sampleRate) {
            const seenContent = remainingItems[i];
            const similarity =
              seenWordSets && seenWordSets.has(seenContent)
                ? this.calculateSimilarityFast(
                    currentWords,
                    seenWordSets.get(seenContent)!,
                  )
                : this.calculateSimilarity(normalizedContent, seenContent);

            if (similarity >= threshold) {
              return true;
            }
          }
        }

        return false;
      }

      default:
        return false;
    }
  }

  /**
   * Extract words from text for similarity calculation
   */
  private extractWords(text: string): Set<string> {
    if (!text) return new Set();
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    return new Set(words);
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

    const set1 = this.extractWords(text1);
    const set2 = this.extractWords(text2);

    return this.calculateSimilarityFast(set1, set2);
  }

  /**
   * Fast similarity calculation using pre-computed word sets
   * @param set1 First word set
   * @param set2 Second word set
   * @returns Similarity score between 0 and 1
   */
  private calculateSimilarityFast(
    set1: Set<string>,
    set2: Set<string>,
  ): number {
    if (set1.size === 0 && set2.size === 0) return 1.0;
    if (set1.size === 0 || set2.size === 0) return 0.0;

    // Use the smaller set for iteration to optimize
    const [smallerSet, largerSet] =
      set1.size <= set2.size ? [set1, set2] : [set2, set1];

    // Calculate intersection efficiently
    let intersection = 0;
    for (const word of smallerSet) {
      if (largerSet.has(word)) {
        intersection++;
      }
    }

    // Union size = set1.size + set2.size - intersection
    const union = set1.size + set2.size - intersection;

    if (union === 0) return 0.0;

    return intersection / union;
  }
}
