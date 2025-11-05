import { Injectable } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { PostsService } from '../../posts/posts.service';
import { CreatePostDto } from '../../posts/dto/create-post.dto';
import { Post } from '../../posts/entities/post.entity';
import { DeduplicationStrategy } from '../../posts/enums/deduplication-strategy.enum';
import { createHash } from 'crypto';

export interface PostUpserterConfig extends StepConfig {
  // Field mappings from input data to post fields
  // Format: { "postField": "inputField" } or { "postField": "inputField.path" }
  fieldMappings?: {
    title?: string; // Input field path for title
    provider?: string; // Input field path for provider
    source?: string; // Input field path for source
    postedAt?: string; // Input field path for posted_at (e.g., "data.posted_at", "timestamp")
    userId?: string; // Input field path or static value for userId
    datasetId?: string; // Input field path or static value for datasetId
    meta?: Record<string, string>; // Meta field mappings { "metaKey": "inputFieldPath" }
  };

  // Hash generation config (required)
  hashConfig: {
    algorithm?: 'sha256' | 'sha512' | 'md5';
    fields: string[]; // Input fields to use for hash (e.g., ["title", "content", "id"])
    separator?: string; // Separator for hash fields (default: '|')
    prefix?: string; // Optional prefix for hash
  };

  // Static/default values (can override mapped values)
  defaults?: {
    provider?: string;
    source?: string;
    userId?: string;
    datasetId?: string;
    meta?: Record<string, any>;
  };
}

@Injectable()
export class PostUpserterStep extends BaseStep {
  constructor(private readonly postsService: PostsService) {
    super('post_upserter', 'Post Upserter');
  }

  protected async executeStep(
    inputSegments: DocumentSegment[],
    config: PostUpserterConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    this.logger.log(
      `Processing ${inputSegments.length} items for post upsertion`,
    );

    const results: DocumentSegment[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Pre-process: If input segments contain structured data with a 'data' array,
    // expand them into individual segments
    const processedSegments: DocumentSegment[] = [];
    for (const segment of inputSegments) {
      const inputData = this.extractInputData(segment);

      // Check if this is a structured response with a 'data' array (like Lenx API output)
      if (
        inputData &&
        typeof inputData === 'object' &&
        Array.isArray(inputData.data)
      ) {
        this.logger.debug(
          `[Post Upserter] Detected structured response with data array. Expanding ${inputData.data.length} items`,
        );
        // Expand each item in the data array into a separate segment
        for (const dataItem of inputData.data) {
          const expandedSegment = {
            ...segment,
            content: JSON.stringify(dataItem),
          } as DocumentSegment;
          processedSegments.push(expandedSegment);
        }
      } else {
        // Regular segment, use as-is
        processedSegments.push(segment);
      }
    }

    this.logger.debug(
      `[Post Upserter] Processed ${inputSegments.length} input segments into ${processedSegments.length} items to process`,
    );

    for (let i = 0; i < processedSegments.length; i++) {
      const inputItem = processedSegments[i];
      try {
        // Extract input data - could be in content, meta, or the item itself
        this.logger.debug(
          `[Post Upserter] Item ${i} - Input item type: ${typeof inputItem}, isArray: ${Array.isArray(inputItem)}`,
        );
        this.logger.debug(
          `[Post Upserter] Item ${i} - Input item keys: ${Object.keys(inputItem).join(', ')}`,
        );
        this.logger.debug(
          `[Post Upserter] Item ${i} - Input item.content type: ${typeof (inputItem as any).content}, length: ${(inputItem as any).content?.length || 0}`,
        );
        if ((inputItem as any).content) {
          this.logger.debug(
            `[Post Upserter] Item ${i} - Input item.content preview: ${String((inputItem as any).content).substring(0, 300)}`,
          );
        }

        const inputData = this.extractInputData(inputItem);
        this.logger.debug(
          `[Post Upserter] Item ${i} - Extracted input data keys: ${Object.keys(inputData).join(', ')}`,
        );
        this.logger.debug(
          `[Post Upserter] Item ${i} - Input data sample: ${JSON.stringify(inputData).substring(0, 500)}`,
        );
        this.logger.debug(
          `[Post Upserter] Item ${i} - Field mappings config: ${JSON.stringify(config.fieldMappings)}`,
        );

        // Map input data to CreatePostDto
        const postData = this.mapToPostDto(inputData, config, context);

        // Always use hash-based deduplication strategy
        const strategy = DeduplicationStrategy.HASH;

        // Perform upsert
        const post = await this.postsService.upsert(
          postData,
          strategy,
          undefined,
        );

        // Create output segment representing the upserted post
        // Note: segment.id will be set to post.id, which we'll extract in formatOutput
        const outputSegment = this.postToSegment(post, inputItem);
        results.push(outputSegment);
        successCount++;

        this.logger.debug(
          `Upserted post ${post.id} (hash: ${post.hash}) - ${successCount}/${inputSegments.length}`,
        );
      } catch (error) {
        errorCount++;
        this.logger.error(
          `Failed to upsert post for item ${i}: ${error.message}`,
          error.stack,
        );
        // Continue processing other items even if one fails
      }
    }

    this.logger.log(
      `Post upsertion completed: ${successCount} succeeded, ${errorCount} failed`,
    );

    return results;
  }

  validate(
    config: PostUpserterConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Title is required - must be mapped from input data
    if (!config.fieldMappings?.title) {
      errors.push(
        'fieldMappings.title is required. Please select the title field from input data.',
      );
    }

    // Hash config is required
    if (!config.hashConfig) {
      errors.push(
        'hashConfig is required. Please configure hash generation settings.',
      );
    } else if (!config.hashConfig.fields?.length) {
      errors.push('hashConfig.fields must contain at least one field');
    }

    return Promise.resolve({
      isValid: errors.length === 0,
      errors,
    });
  }

  rollback(
    _rollbackData: any,
    _context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    // Posts are typically not rolled back, but we could mark them as deleted or archived
    this.logger.log('Post upserter rollback - posts already persisted');
    return Promise.resolve({ success: true });
  }

  getMetadata() {
    return {
      type: 'post_upserter',
      name: 'Post Upserter',
      description:
        'Upserts records into the posts table with configurable field mappings and deduplication strategy',
      version: '1.0.0',
      inputTypes: ['any'],
      outputTypes: ['post_records'],
      configSchema: {
        type: 'object',
        properties: {
          fieldMappings: {
            type: 'object',
            description: 'Field mappings from input data to post fields',
            properties: {
              title: {
                type: 'string',
                description: 'Input field path for title',
              },
              provider: {
                type: 'string',
                description: 'Input field path for provider',
              },
              source: {
                type: 'string',
                description: 'Input field path for source',
              },
              postedAt: {
                type: 'string',
                description:
                  'Input field path for posted_at date (e.g., "data.posted_at", "timestamp")',
              },
              meta: {
                type: 'object',
                description:
                  'Meta field mappings { "metaKey": "inputFieldPath" }',
                additionalProperties: {
                  type: 'string',
                },
              },
            },
          },
          hashConfig: {
            type: 'object',
            description: 'Hash generation configuration (required)',
            required: ['fields'],
            properties: {
              algorithm: {
                type: 'string',
                enum: ['sha256', 'sha512', 'md5'],
                default: 'md5',
                description:
                  'Hash algorithm (default: md5 - fastest and shortest)',
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description: 'Input fields to use for hash calculation',
                minItems: 1,
              },
              separator: {
                type: 'string',
                default: '|',
                description: 'Separator for hash fields',
              },
              prefix: {
                type: 'string',
                description: 'Optional prefix for hash',
              },
            },
          },
          defaults: {
            type: 'object',
            description:
              'Static/default values that will be applied to all posts. These values override mapped fields if the mapped field is empty. Useful for setting common values like provider and source. User ID will automatically use the authenticated user.',
            properties: {
              provider: {
                type: 'string',
                description:
                  'Default provider value to use if not mapped or empty',
              },
              source: {
                type: 'string',
                description:
                  'Default source value to use if not mapped or empty',
              },
              meta: {
                type: 'object',
                description:
                  'Default meta fields to merge into all posts (e.g., {"data_source": "news_api", "category": "finance"})',
              },
            },
          },
        },
        required: ['hashConfig'],
      },
    };
  }

  /**
   * Extract input data from segment
   * Handles different input formats (content JSON, meta, or segment properties)
   */
  private extractInputData(inputItem: DocumentSegment): Record<string, any> {
    // Cast to any to access flexible properties that may be added by workflow nodes
    const item = inputItem as any;

    this.logger.debug(
      `[Post Upserter] extractInputData - Input item has content: ${!!inputItem.content}, content length: ${inputItem.content?.length || 0}`,
    );

    // Try to parse content as JSON first
    if (inputItem.content) {
      try {
        const parsed = JSON.parse(inputItem.content);
        if (typeof parsed === 'object' && parsed !== null) {
          this.logger.debug(
            `[Post Upserter] extractInputData - Successfully parsed JSON from content. Keys: ${Object.keys(parsed).join(', ')}`,
          );
          return parsed;
        } else {
          this.logger.debug(
            `[Post Upserter] extractInputData - Parsed content is not an object, type: ${typeof parsed}`,
          );
        }
      } catch (error) {
        this.logger.debug(
          `[Post Upserter] extractInputData - Failed to parse content as JSON: ${error.message}, content preview: ${String(inputItem.content).substring(0, 200)}`,
        );
        // Not JSON, continue
      }
    } else {
      this.logger.debug(
        `[Post Upserter] extractInputData - inputItem.content is empty or undefined`,
      );
    }

    // Try meta object (may be added by previous workflow nodes)
    if (item.meta && typeof item.meta === 'object') {
      this.logger.debug(
        `[Post Upserter] extractInputData - Using meta object. Keys: ${Object.keys(item.meta).join(', ')}`,
      );
      return item.meta as Record<string, any>;
    }

    // Check if inputItem itself is already the data object (not a DocumentSegment)
    // This can happen when workflow executor passes raw data structures
    if (
      typeof inputItem === 'object' &&
      inputItem !== null &&
      !('content' in inputItem) &&
      !('datasetId' in inputItem) &&
      !('documentId' in inputItem)
    ) {
      // Looks like raw data object, not a DocumentSegment
      this.logger.debug(
        `[Post Upserter] extractInputData - Input item appears to be raw data object. Keys: ${Object.keys(inputItem).join(', ')}`,
      );
      return inputItem as Record<string, any>;
    }

    // Fallback to segment properties
    const fallbackData = {
      id: inputItem.id,
      content: inputItem.content,
      ...(item.meta || {}),
      ...(item.keywords || {}),
      ...(item.hierarchyMetadata || {}),
    };
    this.logger.debug(
      `[Post Upserter] extractInputData - Using fallback data. Keys: ${Object.keys(fallbackData).join(', ')}`,
    );

    // Last resort: if content exists but couldn't be parsed, and we only have id/content in fallback,
    // try parsing content one more time with more detailed error info
    if (
      Object.keys(fallbackData).length <= 2 &&
      inputItem.content &&
      typeof inputItem.content === 'string'
    ) {
      try {
        const reparsed = JSON.parse(inputItem.content);
        if (typeof reparsed === 'object' && reparsed !== null) {
          this.logger.debug(
            `[Post Upserter] extractInputData - Successfully re-parsed content in fallback. Keys: ${Object.keys(reparsed).join(', ')}`,
          );
          return reparsed;
        }
      } catch {
        // Ignore, already tried
      }
    }

    return fallbackData;
  }

  /**
   * Map input data to CreatePostDto using field mappings
   */
  private mapToPostDto(
    inputData: Record<string, any>,
    config: PostUpserterConfig,
    context: StepExecutionContext,
  ): CreatePostDto {
    const postData: Partial<CreatePostDto> = {
      meta: {},
    };

    const mappings = config.fieldMappings || {};

    // Generate hash from required hashConfig
    if (!config.hashConfig) {
      throw new Error('hashConfig is required');
    }
    postData.hash = this.generateHash(inputData, config.hashConfig);

    // Map title (required - must be provided via field mapping)
    this.logger.debug(
      `[Post Upserter] Mapping title - fieldMappings.title: ${mappings.title}, inputData.title: ${inputData.title}`,
    );
    if (mappings.title) {
      const titleValue = this.extractFieldValue(inputData, mappings.title);
      this.logger.debug(
        `[Post Upserter] Extracted title value from path "${mappings.title}": ${titleValue}`,
      );
      if (titleValue !== null && titleValue !== undefined) {
        postData.title = String(titleValue);
      }
    } else if (inputData.title) {
      this.logger.debug(
        `[Post Upserter] Using inputData.title directly: ${inputData.title}`,
      );
      postData.title = String(inputData.title);
    }

    // Title is required
    this.logger.debug(
      `[Post Upserter] Final postData.title: ${postData.title}, available keys in inputData: ${Object.keys(inputData).join(', ')}`,
    );
    if (!postData.title) {
      this.logger.error(
        `[Post Upserter] Title extraction failed. Input data structure: ${JSON.stringify(inputData)}`,
      );
      this.logger.error(
        `[Post Upserter] Field mappings: ${JSON.stringify(mappings)}`,
      );
      throw new Error(
        'Title is required. Please configure fieldMappings.title to map the title field from input data.',
      );
    }

    // Map provider
    if (mappings.provider) {
      const providerValue = this.extractFieldValue(
        inputData,
        mappings.provider,
      );
      if (providerValue !== null && providerValue !== undefined) {
        postData.provider = String(providerValue);
      }
    } else if (inputData.provider) {
      postData.provider = String(inputData.provider);
    }

    // Apply default provider
    if (config.defaults?.provider && !postData.provider) {
      postData.provider = config.defaults.provider;
    }

    // Map source
    if (mappings.source) {
      const sourceValue = this.extractFieldValue(inputData, mappings.source);
      if (sourceValue !== null && sourceValue !== undefined) {
        postData.source = String(sourceValue);
      }
    } else if (inputData.source) {
      postData.source = String(inputData.source);
    }

    // Apply default source
    if (config.defaults?.source && !postData.source) {
      postData.source = config.defaults.source;
    }

    // Map postedAt
    if (mappings.postedAt) {
      const postedAtValue = this.extractFieldValue(
        inputData,
        mappings.postedAt,
      );
      if (postedAtValue !== null && postedAtValue !== undefined) {
        // Handle both string and Date values
        if (typeof postedAtValue === 'string') {
          postData.postedAt = new Date(postedAtValue);
        } else if (postedAtValue instanceof Date) {
          postData.postedAt = postedAtValue;
        } else if (typeof postedAtValue === 'number') {
          // Handle Unix timestamps
          postData.postedAt = new Date(postedAtValue);
        }
      }
    } else if (inputData.postedAt || inputData.posted_at) {
      // Fallback to direct field access
      const postedAtValue = inputData.postedAt || inputData.posted_at;
      if (typeof postedAtValue === 'string') {
        postData.postedAt = new Date(postedAtValue);
      } else if (postedAtValue instanceof Date) {
        postData.postedAt = postedAtValue;
      } else if (typeof postedAtValue === 'number') {
        postData.postedAt = new Date(postedAtValue);
      }
    }

    // Always use authenticated user from context (userId removed from field mappings)
    postData.userId = context.userId;

    // Map meta fields
    if (mappings.meta) {
      for (const [metaKey, inputFieldPath] of Object.entries(mappings.meta)) {
        const metaValue = this.extractFieldValue(inputData, inputFieldPath);
        if (metaValue !== null && metaValue !== undefined) {
          postData.meta![metaKey] = metaValue;
        }
      }
    }

    // Merge default meta
    if (config.defaults?.meta) {
      postData.meta = {
        ...config.defaults.meta,
        ...postData.meta,
      };
    }

    // Copy unmapped fields from input data to meta
    // This ensures all original data is preserved even if not explicitly mapped
    const mappedFields = new Set([
      'hash',
      'title',
      'provider',
      'source',
      'postedAt',
      'posted_at',
      'userId',
      'datasetId',
    ]);

    // Get all keys from inputData that aren't in mappedFields
    for (const key of Object.keys(inputData)) {
      if (
        !mappedFields.has(key) &&
        inputData[key] !== null &&
        inputData[key] !== undefined
      ) {
        // Avoid overwriting explicitly mapped meta fields
        if (!postData.meta![key]) {
          postData.meta![key] = inputData[key];
        }
      }
    }

    // Ensure meta object exists (should already exist, but be safe)
    if (!postData.meta) {
      postData.meta = {};
    }

    return postData as CreatePostDto;
  }

  /**
   * Extract field value from nested object using dot notation
   * Automatically strips 'data.' prefix if fieldPath starts with it but data doesn't have 'data' property
   */
  private extractFieldValue(data: Record<string, any>, fieldPath: string): any {
    this.logger.debug(
      `[Post Upserter] extractFieldValue - fieldPath: "${fieldPath}", data keys: ${Object.keys(data).join(', ')}`,
    );

    // Handle common case: fieldPath is "data.fieldName" but data is already the item (not wrapped in data)
    // This happens when previousOutput is converted to segments - each segment's content is the item itself
    if (
      fieldPath.startsWith('data.') &&
      !data.data &&
      typeof data.data !== 'object'
    ) {
      const strippedPath = fieldPath.substring(5); // Remove "data." prefix
      this.logger.debug(
        `[Post Upserter] extractFieldValue - Stripping "data." prefix. Original: "${fieldPath}", New: "${strippedPath}"`,
      );
      fieldPath = strippedPath;
    }

    const parts = fieldPath.split('.');
    let value = data;
    this.logger.debug(
      `[Post Upserter] extractFieldValue - Splitting path into parts: ${parts.join(', ')}`,
    );

    for (const part of parts) {
      this.logger.debug(
        `[Post Upserter] extractFieldValue - Current part: "${part}", value type: ${typeof value}, is object: ${typeof value === 'object' && value !== null}`,
      );
      if (value === null || value === undefined) {
        this.logger.debug(
          `[Post Upserter] extractFieldValue - Value is null/undefined at part "${part}", returning null`,
        );
        return null;
      }
      if (typeof value !== 'object') {
        this.logger.debug(
          `[Post Upserter] extractFieldValue - Value is not an object (type: ${typeof value}), cannot traverse further`,
        );
        return null;
      }
      value = value[part];
      this.logger.debug(
        `[Post Upserter] extractFieldValue - After accessing "${part}": ${value !== undefined && value !== null ? (typeof value === 'object' ? `[object with keys: ${Object.keys(value as any).join(', ')}]` : String(value).substring(0, 100)) : 'undefined/null'}`,
      );
    }

    this.logger.debug(
      `[Post Upserter] extractFieldValue - Final extracted value: ${value !== undefined && value !== null ? (typeof value === 'object' ? `[object]` : String(value).substring(0, 100)) : 'undefined/null'}`,
    );
    return value;
  }

  /**
   * Generate hash from input data using hash config
   */
  private generateHash(
    inputData: Record<string, any>,
    hashConfig: NonNullable<PostUpserterConfig['hashConfig']>,
  ): string {
    const values: string[] = [];

    for (const fieldPath of hashConfig.fields) {
      const value = this.extractFieldValue(inputData, fieldPath);
      if (value !== null && value !== undefined) {
        values.push(String(value));
      }
    }

    const separator = hashConfig.separator || '|';
    const combined = values.join(separator);
    const prefix = hashConfig.prefix || '';
    const toHash = prefix + combined;

    const algorithm = hashConfig.algorithm || 'md5';
    const hash = createHash(algorithm);
    hash.update(toHash);
    return hash.digest('hex');
  }

  /**
   * Convert Post entity to DocumentSegment for output
   */
  private postToSegment(
    post: Post,
    originalInput?: DocumentSegment,
  ): DocumentSegment {
    // Create a segment-like object representing the post
    // Note: DocumentSegment requires datasetId and documentId, but for workflow purposes
    // we'll use the post's datasetId if available, or placeholder values
    const segment = new DocumentSegment();
    segment.id = post.id;
    segment.content = post.title || JSON.stringify(post.meta || {});

    // Set meta with post information using type assertion
    // (DocumentSegment doesn't have meta in type definition, but workflow nodes can add it)
    const segmentWithMeta = segment as any;
    segmentWithMeta.meta = {
      ...(post.meta || {}),
      postHash: post.hash,
      postProvider: post.provider,
      postSource: post.source,
      postCreatedAt: post.createdAt,
      postUpdatedAt: post.updatedAt,
    };

    // Use original input's datasetId/documentId if available, otherwise use empty strings
    // (Workflow executor may handle these differently)
    segment.datasetId = originalInput?.datasetId || '';
    segment.documentId = originalInput?.documentId || '';
    segment.userId = originalInput?.userId || '';
    segment.status = 'completed';
    segment.position = originalInput?.position || 0;
    segment.wordCount = 0;
    segment.tokens = 0;

    return segment;
  }

  /**
   * Override formatOutput to return structured response with items, total, and lastUpdated
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): { items: string[]; total: number; lastUpdated: string } {
    // Extract post IDs from output segments
    // In postToSegment, we set segment.id = post.id, so we can extract them here
    const outputSegments = result.outputSegments || [];
    const postIds: string[] = outputSegments
      .map((segment) => segment.id)
      .filter((id): id is string => Boolean(id));

    return {
      items: postIds,
      total: postIds.length,
      lastUpdated: new Date().toISOString(),
    };
  }
}
