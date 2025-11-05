import { Injectable, Logger } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { PostsService, PostSearchFilters } from '../../posts/posts.service';

export interface PostDataSourceConfig extends StepConfig {
  // Filter options (matching PostSearchFilters)
  hash?: string;
  provider?: string;
  source?: string;
  title?: string;
  metaKey?: string;
  metaValue?: string;
  startDate?: string; // ISO 8601 date string
  endDate?: string; // ISO 8601 date string
  postedAtStart?: string; // ISO 8601 date string
  postedAtEnd?: string; // ISO 8601 date string
  page?: number;
  limit?: number;
}

@Injectable()
export class PostDataSourceStep extends BaseStep {
  constructor(private readonly postsService: PostsService) {
    super('post_datasource', 'Post Data Source');
  }

  protected async executeStep(
    _inputSegments: DocumentSegment[],
    _config: any,
    _context: any,
  ): Promise<DocumentSegment[]> {
    this.logger.warn('executeStep() not yet migrated - using old execute()');
    return [];
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: PostDataSourceConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log('='.repeat(80));
    this.logger.log('Post Data Source - Starting Execution');
    this.logger.log('='.repeat(80));

    // Log input
    this.logger.log(`Input Segments Count: ${inputSegments.length}`);
    this.logger.log(
      `Configuration: ${JSON.stringify(
        {
          hash: config.hash,
          provider: config.provider,
          source: config.source,
          title: config.title?.substring(0, 100) + '...',
          metaKey: config.metaKey,
          startDate: config.startDate,
          endDate: config.endDate,
          postedAtStart: config.postedAtStart,
          postedAtEnd: config.postedAtEnd,
          page: config.page,
          limit: config.limit,
        },
        null,
        2,
      )}`,
    );

    try {
      // Normalize numeric values (handle string numbers from JSON)
      const normalizedLimit =
        config.limit !== undefined
          ? typeof config.limit === 'string'
            ? Number(config.limit)
            : config.limit
          : undefined;
      const normalizedPage =
        config.page !== undefined
          ? typeof config.page === 'string'
            ? Number(config.page)
            : config.page
          : undefined;

      // Build filters from config
      // Handle limit: 0 means "no limit" - use a very large number to effectively get all results
      const limitValue =
        normalizedLimit === 0
          ? Number.MAX_SAFE_INTEGER
          : normalizedLimit !== undefined
            ? normalizedLimit
            : 100; // Default limit when not specified

      const filters: PostSearchFilters = {
        hash: config.hash,
        provider: config.provider,
        source: config.source,
        title: config.title,
        metaKey: config.metaKey,
        metaValue: config.metaValue
          ? this.parseMetaValue(config.metaValue)
          : undefined,
        startDate: config.startDate ? new Date(config.startDate) : undefined,
        endDate: config.endDate ? new Date(config.endDate) : undefined,
        postedAtStart: config.postedAtStart
          ? new Date(config.postedAtStart)
          : undefined,
        postedAtEnd: config.postedAtEnd
          ? new Date(config.postedAtEnd)
          : undefined,
        page: normalizedPage && normalizedPage > 0 ? normalizedPage : 1,
        limit: limitValue,
      };

      // Fetch posts using PostsService
      this.logger.log('Fetching posts with filters...');
      const result = await this.postsService.search(filters);

      // Format output as { items: [], total: xxx }
      const output = {
        items: result.data || [],
        total: result.total || 0,
      };

      this.logger.log(
        `Fetched ${output.items.length} posts (total: ${output.total})`,
      );

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        [output as any], // Wrap output in array for metrics calculation
        startTime,
        endTime,
      );

      // Log output
      this.logger.log('='.repeat(80));
      this.logger.log('Post Data Source - Execution Complete');
      this.logger.log('='.repeat(80));
      this.logger.log(`Output Items Count: ${output.items.length}`);
      this.logger.log(`Total Available: ${output.total}`);
      this.logger.log(`Duration: ${endTime.getTime() - startTime.getTime()}ms`);

      if (output.items.length > 0) {
        this.logger.log('Sample Output Items:');
        output.items.slice(0, 3).forEach((item, i) => {
          this.logger.log(
            `  [${i + 1}] ID: ${item.id}, Title: ${item.title?.substring(0, 50) || 'N/A'}...`,
          );
        });
      }
      this.logger.log('='.repeat(80));

      // Return output as single segment object (similar to lenx-api-datasource)
      return {
        success: true,
        outputSegments: [output] as any, // Return output as single item in array
        metrics: {
          ...metrics,
          itemsFetched: output.items.length,
          totalAvailable: output.total,
        },
      };
    } catch (error) {
      this.logger.error(
        `Post data source failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        outputSegments: [],
        metrics: this.calculateMetrics(
          inputSegments,
          [],
          startTime,
          new Date(),
        ),
        error: error.message,
      };
    }
  }

  async validate(
    config: PostDataSourceConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Normalize numeric values (handle string numbers from JSON)
    if (config.page !== undefined && typeof config.page === 'string') {
      config.page = Number(config.page);
      if (isNaN(config.page)) {
        errors.push('Page must be a valid number');
      }
    }
    if (config.limit !== undefined && typeof config.limit === 'string') {
      config.limit = Number(config.limit);
      if (isNaN(config.limit)) {
        errors.push('Limit must be a valid number');
      }
    }

    // Validate date formats if provided
    if (config.startDate) {
      const startDate = new Date(config.startDate);
      if (isNaN(startDate.getTime())) {
        errors.push('Start date is invalid');
      }
    }

    if (config.endDate) {
      const endDate = new Date(config.endDate);
      if (isNaN(endDate.getTime())) {
        errors.push('End date is invalid');
      }
    }

    // Validate date relationship if both provided
    if (config.startDate && config.endDate) {
      const start = new Date(config.startDate);
      const end = new Date(config.endDate);
      if (start > end) {
        errors.push('Start date must be before end date');
      }
    }

    if (config.postedAtStart) {
      const postedAtStart = new Date(config.postedAtStart);
      if (isNaN(postedAtStart.getTime())) {
        errors.push('Posted at start date is invalid');
      }
    }

    if (config.postedAtEnd) {
      const postedAtEnd = new Date(config.postedAtEnd);
      if (isNaN(postedAtEnd.getTime())) {
        errors.push('Posted at end date is invalid');
      }
    }

    // Validate date relationship if both provided
    if (config.postedAtStart && config.postedAtEnd) {
      const start = new Date(config.postedAtStart);
      const end = new Date(config.postedAtEnd);
      if (start > end) {
        errors.push('Posted at start date must be before posted at end date');
      }
    }

    // Validate pagination
    // Allow page: 0 or empty to default to 1, but reject negative values
    if (config.page !== undefined && config.page < 0) {
      errors.push('Page must be greater than or equal to 0');
    }

    // Allow limit: 0 to mean "no limit" (unlimited)
    if (config.limit !== undefined && config.limit < 0) {
      errors.push('Limit must be greater than or equal to 0');
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
    this.logger.log('Post data source rollback - no action needed');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'post_datasource',
      name: 'Post Data Source',
      description:
        'Fetches posts from the post service using filters (supports all post page filter options)',
      version: '1.0.0',
      inputTypes: [],
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          hash: {
            type: 'string',
            description: 'Filter by post hash',
          },
          provider: {
            type: 'string',
            description: 'Filter by provider (e.g., "google api", "lenx api")',
          },
          source: {
            type: 'string',
            description:
              'Filter by source/platform (e.g., "facebook", "twitter")',
          },
          title: {
            type: 'string',
            description: 'Search in title (partial match)',
          },
          metaKey: {
            type: 'string',
            description: 'Filter by meta key',
          },
          metaValue: {
            type: 'string',
            description:
              'Filter by meta value (supports JSON strings, plain values, or regex patterns)',
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Start date for date range filter (ISO 8601)',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'End date for date range filter (ISO 8601)',
          },
          postedAtStart: {
            type: 'string',
            format: 'date-time',
            description: 'Start date for posted_at range filter (ISO 8601)',
          },
          postedAtEnd: {
            type: 'string',
            format: 'date-time',
            description: 'End date for posted_at range filter (ISO 8601)',
          },
          page: {
            type: 'number',
            description: 'Page number (default: 1, 0 or empty = use default)',
            default: 1,
          },
          limit: {
            type: 'number',
            description:
              'Items per page (default: 100, 0 = no limit/unlimited)',
            default: 100,
          },
        },
        required: [],
      },
    };
  }

  /**
   * Parse meta value - handles JSON strings, plain values, or regex patterns
   * Similar to PostsController.search() parsing logic
   */
  private parseMetaValue(metaValue: string): any {
    if (!metaValue) return undefined;

    try {
      // First, try parsing as JSON (handles quoted strings, booleans, numbers, objects, arrays)
      return JSON.parse(metaValue);
    } catch {
      // If JSON parsing fails, treat as plain string value
      // Also handle common boolean/number string representations
      const trimmed = metaValue.trim();
      if (trimmed === 'true') {
        return true;
      } else if (trimmed === 'false') {
        return false;
      } else if (trimmed === 'null') {
        return null;
      } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
        // Numeric string
        return Number(trimmed);
      } else {
        // Plain string value
        return metaValue;
      }
    }
  }

  /**
   * Format output for storage/display
   * Returns the raw response object directly (not wrapped in array)
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    // The outputSegments is an array with one object like [{items: [], total: 12}]
    // Return the object directly, not wrapped in array
    if (
      Array.isArray(result.outputSegments) &&
      result.outputSegments.length === 1 &&
      typeof result.outputSegments[0] === 'object' &&
      result.outputSegments[0] !== null
    ) {
      return result.outputSegments[0];
    }
    // Fallback to base implementation
    return super.formatOutput(result, _originalInput);
  }
}
