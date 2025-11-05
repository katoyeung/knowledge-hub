import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

export type DateMode = 'fixed' | 'dynamic';

export interface LenxApiDataSourceConfig extends StepConfig {
  apiUrl: string;
  authToken: string;
  dateMode: DateMode;
  query: string;
  timeout?: number;
  maxRetries?: number;

  // Fixed mode fields
  startDate?: string; // ISO 8601 date string
  endDate?: string; // ISO 8601 date string
  dateIntervalMinutes?: number; // For chunking in fixed mode

  // Dynamic mode fields
  intervalMinutes?: number; // For dynamic mode: how many minutes back from now

  // Old fields for backward compatibility
  from?: number; // Timestamp
  to?: number; // Timestamp
}

@Injectable()
export class LenxApiDataSourceStep extends BaseStep {
  constructor(private readonly httpService: HttpService) {
    super('lenx_api_datasource', 'Lenx API Data Source');
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
    config: LenxApiDataSourceConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log('='.repeat(80));
    this.logger.log('Lenx API Data Source - Starting Execution');
    this.logger.log('='.repeat(80));

    // Log input
    this.logger.log(`Input Segments Count: ${inputSegments.length}`);
    this.logger.log(
      `Configuration: ${JSON.stringify(
        {
          apiUrl: config.apiUrl,
          dateMode: config.dateMode,
          query: config.query?.substring(0, 100) + '...',
          intervalMinutes: config.intervalMinutes,
          startDate: config.startDate,
          endDate: config.endDate,
        },
        null,
        2,
      )}`,
    );

    try {
      let allSegments: any[] = [];

      if (config.dateMode === 'dynamic') {
        // Dynamic mode: single request with now() - intervalibt
        const rawResponse = await this.fetchDynamicData(config);
        // Return raw response as single segment object
        allSegments = [rawResponse];
        this.logger.log(
          `Dynamic mode: Fetched ${allSegments.length} items from last ${config.intervalMinutes} minutes`,
        );
      } else if (config.dateMode === 'fixed') {
        // Fixed mode: chunked requests
        // Validate that both dates are provided at execution time
        if (!config.startDate || !config.endDate) {
          throw new Error(
            'Fixed mode requires both startDate and endDate to be set. Please configure both dates in the node settings.',
          );
        }

        const chunks = this.calculateDateChunks(config);

        // In test mode (detected by executionId starting with "test_"), only process first chunk
        const isTestMode = context.executionId?.startsWith('test_') ?? false;
        const chunksToProcess = isTestMode ? chunks.slice(0, 1) : chunks;

        if (isTestMode) {
          this.logger.log(
            `Fixed mode (TEST): Processing only first chunk of ${chunks.length} total chunks`,
          );
        } else {
          this.logger.log(
            `Fixed mode: Processing ${chunks.length} time chunks`,
          );
        }

        // Collect all chunk responses
        const chunkResponses: any[] = [];

        for (let i = 0; i < chunksToProcess.length; i++) {
          const chunk = chunksToProcess[i];
          this.logger.log(
            `Processing chunk ${i + 1}/${chunksToProcess.length}${isTestMode ? ` (of ${chunks.length} total in full run)` : ''}: ${new Date(chunk.from).toISOString()} to ${new Date(chunk.to).toISOString()}`,
          );

          try {
            const response = await this.fetchApiDataForChunk(
              config,
              chunk.from,
              chunk.to,
            );

            // Store raw API response - don't extract
            const rawResponse = response.data;

            if (
              !rawResponse ||
              (typeof rawResponse === 'object' &&
                (!rawResponse.data || rawResponse.data.length === 0))
            ) {
              this.logger.warn(
                `Chunk ${i + 1} returned no results, continuing to next chunk`,
              );
              continue; // Continue to next chunk instead of breaking
            }

            chunkResponses.push(rawResponse);
            this.logger.log(
              `Chunk ${i + 1} completed: ${rawResponse.total || 0} items in raw response`,
            );
          } catch (error) {
            this.logger.error(`Chunk ${i + 1} failed: ${error.message}`);
            // Continue to next chunk instead of breaking on error
            continue;
          }
        }

        // Merge all chunk responses into a single response
        if (chunkResponses.length > 0) {
          const mergedData: any[] = [];
          let totalCount = 0;

          for (const chunkResponse of chunkResponses) {
            if (chunkResponse.data && Array.isArray(chunkResponse.data)) {
              mergedData.push(...chunkResponse.data);
            }
            // Sum up totals if available
            if (typeof chunkResponse.total === 'number') {
              totalCount += chunkResponse.total;
            }
          }

          // Create merged response
          const mergedResponse = {
            ...chunkResponses[0], // Keep metadata from first response
            data: mergedData,
            total: totalCount || mergedData.length,
          };

          allSegments = [mergedResponse];
          if (isTestMode) {
            this.logger.log(
              `Fixed mode (TEST): Processed ${chunkResponses.length} chunk(s) into ${mergedData.length} total items (limited for testing)`,
            );
          } else {
            this.logger.log(
              `Fixed mode: Merged ${chunkResponses.length} chunks into ${mergedData.length} total items`,
            );
          }
        } else {
          this.logger.warn('Fixed mode: No data returned from any chunks');
          allSegments = [];
        }
      }

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        allSegments,
        startTime,
        endTime,
      );

      // Log output
      this.logger.log('='.repeat(80));
      this.logger.log('Lenx API Data Source - Execution Complete');
      this.logger.log('='.repeat(80));
      this.logger.log(`Output Segments Count: ${allSegments.length}`);
      this.logger.log(`Duration: ${endTime.getTime() - startTime.getTime()}ms`);

      if (allSegments.length > 0) {
        this.logger.log('Sample Output Segments:');
        const firstResponse = allSegments[0];
        if (
          firstResponse &&
          firstResponse.data &&
          Array.isArray(firstResponse.data)
        ) {
          this.logger.log(
            `  Total items: ${firstResponse.total || firstResponse.data.length}`,
          );
          this.logger.log(
            `  Sample items: ${firstResponse.data.slice(0, 3).length}`,
          );
        } else {
          allSegments.slice(0, 3).forEach((seg, i) => {
            this.logger.log(
              `  [${i + 1}] Position: ${seg.position}, Words: ${seg.wordCount}, Tokens: ${seg.tokens}`,
            );
            this.logger.log(
              `       Content preview: ${seg.content?.substring(0, 100) || 'N/A'}...`,
            );
          });
        }
      }
      this.logger.log('='.repeat(80));

      // Return raw response directly in outputSegments array
      const rawResponse = allSegments.length > 0 ? allSegments[0] : null;

      return {
        success: true,
        outputSegments: rawResponse ? [rawResponse] : [], // Return raw response as single item
        metrics: {
          ...metrics,
          apiUrl: config.apiUrl,
          itemsFetched: allSegments.length,
          dateMode: config.dateMode,
        },
      };
    } catch (error) {
      this.logger.error(
        `Lenx API data source failed: ${error.message}`,
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
    config: LenxApiDataSourceConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.apiUrl) {
      errors.push('API URL is required');
    }

    if (!config.authToken) {
      errors.push('Auth token is required');
    }

    if (!config.query) {
      errors.push('Query is required');
    }

    if (!config.dateMode) {
      errors.push('Date mode is required (fixed or dynamic)');
    }

    if (config.dateMode === 'fixed') {
      // Allow partial configuration during editing (either date can be empty)
      // Only validate date relationship if both are provided
      if (config.startDate && config.endDate) {
        // Both dates provided, validate them
        const start = new Date(config.startDate);
        const end = new Date(config.endDate);
        if (isNaN(start.getTime())) {
          errors.push('Start date is invalid');
        } else if (isNaN(end.getTime())) {
          errors.push('End date is invalid');
        } else if (start > end) {
          errors.push('Start date must be before end date');
        }
      }
      // If only one date is provided, that's okay during editing
      // Validation for required fields happens at execution time

      if (config.dateIntervalMinutes && config.dateIntervalMinutes <= 0) {
        errors.push('Date interval must be greater than 0');
      }
    } else if (config.dateMode === 'dynamic') {
      // Allow partial configuration during editing
      if (config.intervalMinutes !== undefined && config.intervalMinutes <= 0) {
        errors.push('Interval minutes must be greater than 0');
      }
      // Note: intervalMinutes can be undefined during initial configuration
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
    this.logger.log('Lenx API data source rollback - no action needed');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'lenx_api_datasource',
      name: 'Lenx API Data Source',
      description:
        'Fetches data from Lenx search API with fixed or dynamic date ranges',
      version: '2.0.0',
      inputTypes: [],
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          apiUrl: {
            type: 'string',
            description: 'Lenx API endpoint URL',
          },
          authToken: {
            type: 'string',
            description: 'Authentication token (Basic Auth)',
          },
          dateMode: {
            type: 'string',
            enum: ['fixed', 'dynamic'],
            description: 'Date range mode',
          },
          query: {
            type: 'string',
            description: 'Search query with Boolean operators',
          },
          // Fixed mode
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Start date (ISO 8601) for fixed mode',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'End date (ISO 8601) for fixed mode',
          },
          dateIntervalMinutes: {
            type: 'number',
            description: 'Chunk interval in minutes for fixed mode',
            default: 60,
          },
          // Dynamic mode
          intervalMinutes: {
            type: 'number',
            description: 'Minutes back from now for dynamic mode',
            default: 30,
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds',
            default: 30000,
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum number of retry attempts',
            default: 3,
          },
        },
        required: ['apiUrl', 'authToken', 'dateMode', 'query'],
      },
    };
  }

  private async fetchDynamicData(
    config: LenxApiDataSourceConfig,
  ): Promise<any> {
    const now = Date.now();
    const from = now - (config.intervalMinutes || 30) * 60 * 1000;
    const to = now;

    this.logger.log(
      `Dynamic fetch: from ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`,
    );

    const response = await this.fetchApiDataForChunk(config, from, to);
    // Return raw response as single object - don't wrap in array
    return response.data;
  }

  private calculateDateChunks(
    config: LenxApiDataSourceConfig,
  ): Array<{ from: number; to: number }> {
    const start = new Date(config.startDate!);
    const end = new Date(config.endDate!);

    // Set start to beginning of day
    start.setHours(0, 0, 0, 0);

    // Set end to end of day
    end.setHours(23, 59, 59, 999);

    const intervalMinutes = config.dateIntervalMinutes || 60;
    const chunks: Array<{ from: number; to: number }> = [];

    let currentStart = start.getTime();
    const endTime = end.getTime();

    while (currentStart < endTime) {
      const chunkEnd = Math.min(
        currentStart + intervalMinutes * 60 * 1000,
        endTime,
      );

      chunks.push({
        from: currentStart,
        to: chunkEnd,
      });

      currentStart = chunkEnd;
    }

    return chunks;
  }

  private async fetchApiDataForChunk(
    config: LenxApiDataSourceConfig,
    from: number,
    to: number,
  ): Promise<any> {
    const timeout = config.timeout || 30000;
    const retries = config.maxRetries || 3;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.log(`Fetching from API (attempt ${attempt}/${retries})`);

        const requestBody = {
          from,
          to,
          query: config.query,
        };

        this.logger.log('API Request Details:');
        this.logger.log(`  URL: ${config.apiUrl}`);
        this.logger.log(`  Method: POST`);
        this.logger.log(
          `  Request Body: ${JSON.stringify(requestBody, null, 2)}`,
        );

        const response = await firstValueFrom(
          this.httpService.post(config.apiUrl, requestBody, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'knowledge-hub-workflow',
              Authorization: config.authToken,
            },
            timeout,
          }),
        );

        this.logger.log(`API request successful: ${response.status}`);
        this.logger.log(
          `  Response Headers: ${JSON.stringify(response.headers)}`,
        );
        this.logger.log(
          `  Response Data Type: ${Array.isArray(response.data) ? 'Array' : typeof response.data}`,
        );

        if (Array.isArray(response.data)) {
          this.logger.log(`  Response Array Length: ${response.data.length}`);
        } else if (typeof response.data === 'object') {
          this.logger.log(
            `  Response Object Keys: ${Object.keys(response.data || {}).join(', ')}`,
          );
        }

        return response;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `API request failed (attempt ${attempt}/${retries}): ${error.message}`,
        );
        if (error.response) {
          this.logger.warn(`  Status: ${error.response.status}`);
          this.logger.warn(
            `  Response Data: ${JSON.stringify(error.response.data)}`,
          );
        }
        if (error.request) {
          this.logger.warn(`  Request was made but no response received`);
        }

        if (attempt < retries) {
          const delay = 1000 * attempt;
          this.logger.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('API request failed after retries');
  }

  private transformApiResponseToSegments(apiData: any): any[] {
    this.logger.log('Raw API Response Type:', typeof apiData);
    this.logger.log(
      'Raw API Response:',
      JSON.stringify(apiData).substring(0, 500),
    );

    // Handle different response structures
    let items: any[] = [];

    if (Array.isArray(apiData)) {
      items = apiData;
      this.logger.log('API returned array, using directly');
    } else if (apiData && typeof apiData === 'object') {
      // Check if response has a data property (most common for paginated responses)
      if (apiData.data && Array.isArray(apiData.data)) {
        items = apiData.data;
        this.logger.log(`Extracted ${items.length} items from data property`);
      } else if (apiData.results && Array.isArray(apiData.results)) {
        items = apiData.results;
        this.logger.log(
          `Extracted ${items.length} items from results property`,
        );
      } else if (apiData.items && Array.isArray(apiData.items)) {
        items = apiData.items;
        this.logger.log(`Extracted ${items.length} items from items property`);
      } else if (apiData.hits && Array.isArray(apiData.hits)) {
        items = apiData.hits;
        this.logger.log(`Extracted ${items.length} items from hits property`);
      } else {
        // If it's a single object, wrap it in an array
        this.logger.log(
          'API response is not an array, treating as single item',
        );
        items = [apiData];
      }
    } else {
      this.logger.warn(
        'Unexpected API response format, returning empty segments',
      );
      return [];
    }

    if (items.length === 0) {
      this.logger.log('API returned no items');
      return [];
    }

    this.logger.log(`Returning ${items.length} raw items`);
    if (items.length > 0) {
      const firstItem = items[0];
      this.logger.log(
        `First item keys: ${Object.keys(firstItem).slice(0, 20).join(', ')}`,
      );
    }

    return items;
  }

  private extractContent(item: any): string {
    // Try various common fields for content
    if (item.text) return item.text;
    if (item.content) return item.content;
    if (item.body) return item.body;
    if (item.description) return item.description;
    if (item.message) return item.message;

    // If no direct content field, stringify the item
    return JSON.stringify(item);
  }

  private extractKeywords(item: any): object {
    const keywords = [];

    // Extract common metadata fields as keywords
    if (item.tags && Array.isArray(item.tags)) {
      keywords.push(...item.tags);
    }
    if (item.categories && Array.isArray(item.categories)) {
      keywords.push(...item.categories);
    }
    if (item.title) keywords.push(item.title);
    if (item.source) keywords.push(item.source);
    if (item.type) keywords.push(item.type);

    return {
      extracted: keywords,
      count: keywords.length,
      extractedAt: new Date().toISOString(),
    };
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Format output for storage/display
   * Returns the raw response object directly (not wrapped in array)
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    // The outputSegments is an array with one object like [{total: 12, data: [...]}]
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
