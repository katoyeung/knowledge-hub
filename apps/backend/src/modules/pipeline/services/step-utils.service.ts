import { Injectable, Logger } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  StepExecutionContext,
  ExecutionMetrics,
  ValidationResult,
} from '../interfaces/step.interfaces';

/**
 * Utility service providing common functionality for steps
 * Reduces code duplication and promotes reusability
 */
@Injectable()
export class StepUtils {
  /**
   * Execute a function with standard error handling
   */
  async executeWithErrorHandling<T>(
    fn: () => Promise<T>,
    context: StepExecutionContext,
    errorMessage: string,
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      context.logger.error(`${errorMessage}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry execution with exponential backoff
   */
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Retry failed with no error message');
  }

  /**
   * Process items in batches to avoid blocking event loop
   */
  async processInBatches<T, R>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<R[]>,
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Track and log progress
   */
  trackProgress(
    current: number,
    total: number,
    logger: Logger,
    label: string,
  ): void {
    const percent = Math.round((current / total) * 100);
    logger.log(`${label}: ${current}/${total} (${percent}%)`);
  }

  /**
   * Validate a document segment
   */
  validateSegment(segment: DocumentSegment): ValidationResult {
    const errors: string[] = [];

    if (!segment.id) {
      errors.push('Segment must have an ID');
    }

    if (!segment.content || segment.content.trim() === '') {
      errors.push('Segment must have content');
    }

    if (segment.wordCount !== undefined && segment.wordCount < 0) {
      errors.push('Word count cannot be negative');
    }

    if (segment.tokens !== undefined && segment.tokens < 0) {
      errors.push('Token count cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate multiple segments
   */
  validateSegments(segments: DocumentSegment[]): ValidationResult {
    const errors: string[] = [];

    for (const segment of segments) {
      const validation = this.validateSegment(segment);
      if (!validation.isValid) {
        errors.push(...validation.errors.map((e) => `${segment.id}: ${e}`));
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract and calculate execution metrics
   */
  extractMetrics(
    input: DocumentSegment[],
    output: DocumentSegment[],
    startTime: Date,
    endTime: Date,
    stepType?: string,
    stepName?: string,
  ): ExecutionMetrics {
    const duration = endTime.getTime() - startTime.getTime();
    const filteredCount = input.length - output.length;

    return {
      inputCount: input.length,
      outputCount: output.length,
      filteredCount,
      duration,
      throughput: duration > 0 ? input.length / (duration / 1000) : 0,
      memoryUsage: process.memoryUsage().heapUsed,
      averageProcessingTime: input.length > 0 ? duration / input.length : 0,
      stepType,
      stepName,
    };
  }

  /**
   * Calculate processing statistics
   */
  calculateProcessingStats(
    inputCount: number,
    outputCount: number,
    duration: number,
  ): {
    throughput: number;
    averageTime: number;
    reductionRate: number;
  } {
    return {
      throughput: duration > 0 ? inputCount / (duration / 1000) : 0,
      averageTime: inputCount > 0 ? duration / inputCount : 0,
      reductionRate:
        inputCount > 0 ? (inputCount - outputCount) / inputCount : 0,
    };
  }

  /**
   * Check if segment matches a condition
   */
  matchesCondition(
    segment: DocumentSegment,
    condition: (segment: DocumentSegment) => boolean,
  ): boolean {
    return condition(segment);
  }

  /**
   * Filter segments by condition
   */
  filterSegments(
    segments: DocumentSegment[],
    condition: (segment: DocumentSegment) => boolean,
  ): DocumentSegment[] {
    return segments.filter((segment) => condition(segment));
  }

  /**
   * Transform segments using a mapper function
   */
  transformSegments<T>(
    segments: DocumentSegment[],
    mapper: (segment: DocumentSegment) => T,
  ): T[] {
    return segments.map((segment) => mapper(segment));
  }

  /**
   * Group segments by a key
   */
  groupSegments<T>(
    segments: DocumentSegment[],
    keyExtractor: (segment: DocumentSegment) => T,
  ): Map<T, DocumentSegment[]> {
    const grouped = new Map<T, DocumentSegment[]>();

    for (const segment of segments) {
      const key = keyExtractor(segment);
      const existing = grouped.get(key) || [];
      existing.push(segment);
      grouped.set(key, existing);
    }

    return grouped;
  }

  /**
   * Create a throttled function
   */
  throttle<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn(...args);
      }
    };
  }

  /**
   * Create a debounced function
   */
  debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Deep clone an object
   */
  deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Merge objects deeply
   */
  deepMerge<T>(target: T, source: Partial<T>): T {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key]) && source[key] !== null) {
          (output as any)[key] = this.deepMerge(
            (target as any)[key],
            source[key],
          );
        } else if (source[key] !== undefined) {
          (output as any)[key] = source[key];
        }
      }
    }

    return output;
  }

  /**
   * Check if value is an object
   */
  private isObject(item: any): item is Record<string, any> {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Extract common segment fields for comparison
   */
  extractSegmentFields(segment: DocumentSegment): {
    content: string;
    wordCount: number;
    tokens: number;
    status: string;
  } {
    return {
      content: segment.content || '',
      wordCount: segment.wordCount || 0,
      tokens: segment.tokens || 0,
      status: segment.status || 'unknown',
    };
  }
}
