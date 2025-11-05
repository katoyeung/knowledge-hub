import { Injectable } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { PostsService } from '../../posts/posts.service';

export interface PostDeleterConfig extends StepConfig {
  // Field mappings from input data to post ID
  // Format: { "id": "inputField" } or { "id": "inputField.path" }
  fieldMappings?: {
    id?: string; // Input field path for post ID (e.g., "id", "postId", "data.id")
  };
}

@Injectable()
export class PostDeleterStep extends BaseStep {
  constructor(private readonly postsService: PostsService) {
    super('post_deleter', 'Post Deleter');
  }

  protected async executeStep(
    _inputSegments: DocumentSegment[],
    _config: PostDeleterConfig,
    _context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    // This method is not used - the execute() method overrides the base class behavior
    // Keeping it for interface compliance but it should not be called
    this.logger.warn('executeStep() called but execute() is overridden');
    return Promise.resolve([]);
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: PostDeleterConfig,
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log('='.repeat(80));
    this.logger.log('Post Deleter - Starting Execution');
    this.logger.log('='.repeat(80));

    // Log input
    this.logger.log(`Input Segments Count: ${inputSegments.length}`);
    this.logger.log(
      `Configuration: ${JSON.stringify(
        {
          fieldMappings: config.fieldMappings || {},
        },
        null,
        2,
      )}`,
    );

    try {
      // Pre-process: Expand arrays based on field mapping
      // If field mapping is "duplicates.id", expand duplicates array
      // If field mapping is "items.id", expand items array
      // Otherwise, check for 'data' array (like Lenx API output)
      const processedSegments: DocumentSegment[] = [];
      const idFieldPath = config.fieldMappings?.id || 'id';

      for (const segment of inputSegments) {
        const inputData = this.extractInputData(segment);

        // Check if field mapping indicates we should use a specific array
        // e.g., "duplicates.id" means extract from duplicates array
        if (idFieldPath.startsWith('duplicates.')) {
          if (
            inputData &&
            typeof inputData === 'object' &&
            Array.isArray(inputData.duplicates)
          ) {
            this.logger.debug(
              `[Post Deleter] Field mapping is "${idFieldPath}". Expanding duplicates array with ${inputData.duplicates.length} items`,
            );
            // Expand each duplicate item into a separate segment
            for (const duplicateItem of inputData.duplicates) {
              const expandedSegment = {
                ...segment,
                content: JSON.stringify(duplicateItem),
              } as DocumentSegment;
              processedSegments.push(expandedSegment);
            }
          } else {
            this.logger.warn(
              `[Post Deleter] Field mapping requires duplicates array but input data doesn't have one`,
            );
            processedSegments.push(segment);
          }
        } else if (idFieldPath.startsWith('items.')) {
          if (
            inputData &&
            typeof inputData === 'object' &&
            Array.isArray(inputData.items)
          ) {
            this.logger.debug(
              `[Post Deleter] Field mapping is "${idFieldPath}". Expanding items array with ${inputData.items.length} items`,
            );
            // Expand each item into a separate segment
            for (const item of inputData.items) {
              const expandedSegment = {
                ...segment,
                content: JSON.stringify(item),
              } as DocumentSegment;
              processedSegments.push(expandedSegment);
            }
          } else {
            this.logger.warn(
              `[Post Deleter] Field mapping requires items array but input data doesn't have one`,
            );
            processedSegments.push(segment);
          }
        } else if (
          inputData &&
          typeof inputData === 'object' &&
          Array.isArray(inputData.data)
        ) {
          this.logger.debug(
            `[Post Deleter] Detected structured response with data array. Expanding ${inputData.data.length} items`,
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
        `[Post Deleter] Processed ${inputSegments.length} input segments into ${processedSegments.length} items to process`,
      );

      // Loop through input dataset to extract post IDs
      const postIds: string[] = [];
      for (let i = 0; i < processedSegments.length; i++) {
        const inputItem = processedSegments[i];
        try {
          // Extract input data from segment
          const inputData = this.extractInputData(inputItem);

          // Extract post ID using field mapping
          const postId = this.extractPostId(inputData, config);

          if (postId) {
            postIds.push(postId);
            this.logger.debug(
              `[Post Deleter] Extracted post ID ${postId} from item ${i + 1}`,
            );
          } else {
            this.logger.warn(
              `[Post Deleter] Could not extract post ID from item ${i + 1}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to extract post ID from item ${i}: ${error.message}`,
            error.stack,
          );
          // Continue processing other items even if one fails
        }
      }

      if (postIds.length === 0) {
        this.logger.warn('No post IDs found in input data');
        const endTime = new Date();
        const metrics = this.calculateMetrics(
          inputSegments,
          [],
          startTime,
          endTime,
        );

        return {
          success: true,
          outputSegments: [
            {
              deleted: 0,
              requested: 0,
              failed: 0,
              postIds: [],
            },
          ] as any,
          metrics: {
            ...metrics,
            postsDeleted: 0,
            postsRequested: 0,
          },
        };
      }

      this.logger.log(`Found ${postIds.length} post IDs to delete`);
      this.logger.log(
        `Sample IDs: ${postIds.slice(0, 5).join(', ')}${
          postIds.length > 5 ? '...' : ''
        }`,
      );

      // Delete posts using batch delete
      const deleteResult = await this.postsService.batchDelete(postIds);

      this.logger.log(
        `Successfully deleted ${deleteResult.deleted} posts out of ${postIds.length} requested`,
      );

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        [deleteResult as any],
        startTime,
        endTime,
      );

      // Format output
      const output = {
        deleted: deleteResult.deleted,
        requested: postIds.length,
        failed: postIds.length - deleteResult.deleted,
        postIds: postIds,
      };

      // Log output
      this.logger.log('='.repeat(80));
      this.logger.log('Post Deleter - Execution Complete');
      this.logger.log('='.repeat(80));
      this.logger.log(`Posts Deleted: ${output.deleted}`);
      this.logger.log(`Posts Requested: ${output.requested}`);
      this.logger.log(`Failed: ${output.failed}`);
      this.logger.log(`Duration: ${endTime.getTime() - startTime.getTime()}ms`);
      this.logger.log('='.repeat(80));

      return {
        success: true,
        outputSegments: [output] as any,
        metrics: {
          ...metrics,
          postsDeleted: output.deleted,
          postsRequested: output.requested,
          postsFailed: output.failed,
        },
      };
    } catch (error) {
      this.logger.error(`Post deletion failed: ${error.message}`, error.stack);
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

  validate(
    config: PostDeleterConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // ID field mapping is optional - defaults to "id" if not provided
    if (
      config.fieldMappings?.id &&
      typeof config.fieldMappings.id !== 'string'
    ) {
      errors.push('fieldMappings.id must be a string');
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
    this.logger.log(
      'Post deleter rollback - deletion cannot be undone automatically',
    );
    return Promise.resolve({ success: true });
  }

  getMetadata() {
    return {
      type: 'post_deleter',
      name: 'Post Deleter',
      description:
        'Deletes posts by extracting post IDs from input data using field mappings. Loops through input dataset items and deletes each post by mapped ID field.',
      version: '1.0.0',
      inputTypes: ['document_segments'],
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          fieldMappings: {
            type: 'object',
            description: 'Field mappings from input data to post ID',
            properties: {
              id: {
                type: 'string',
                description:
                  'Input field path for post ID (e.g., "id", "postId", "data.id"). Default: "id"',
                default: 'id',
              },
            },
          },
        },
        required: [],
      },
    };
  }

  /**
   * Extract input data from segment
   * Handles different input formats (content JSON, meta, or segment properties)
   * Similar to post-upserter's extractInputData
   */
  private extractInputData(inputItem: DocumentSegment): Record<string, any> {
    // Cast to any to access flexible properties that may be added by workflow nodes
    const item = inputItem as any;

    this.logger.debug(
      `[Post Deleter] extractInputData - Input item has content: ${!!inputItem.content}, content length: ${inputItem.content?.length || 0}`,
    );

    // Try to parse content as JSON first
    if (inputItem.content) {
      try {
        const parsed = JSON.parse(inputItem.content);
        if (typeof parsed === 'object' && parsed !== null) {
          this.logger.debug(
            `[Post Deleter] extractInputData - Successfully parsed JSON from content. Keys: ${Object.keys(parsed).join(', ')}`,
          );
          return parsed;
        } else {
          this.logger.debug(
            `[Post Deleter] extractInputData - Parsed content is not an object, type: ${typeof parsed}`,
          );
        }
      } catch (error) {
        this.logger.debug(
          `[Post Deleter] extractInputData - Failed to parse content as JSON: ${error.message}, content preview: ${String(inputItem.content).substring(0, 200)}`,
        );
        // Not JSON, continue
      }
    } else {
      this.logger.debug(
        `[Post Deleter] extractInputData - inputItem.content is empty or undefined`,
      );
    }

    // Try meta object (may be added by previous workflow nodes)
    if (item.meta && typeof item.meta === 'object') {
      this.logger.debug(
        `[Post Deleter] extractInputData - Using meta object. Keys: ${Object.keys(item.meta).join(', ')}`,
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
        `[Post Deleter] extractInputData - Input item appears to be raw data object. Keys: ${Object.keys(inputItem).join(', ')}`,
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
      `[Post Deleter] extractInputData - Using fallback data. Keys: ${Object.keys(fallbackData).join(', ')}`,
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
            `[Post Deleter] extractInputData - Successfully re-parsed content in fallback. Keys: ${Object.keys(reparsed).join(', ')}`,
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
   * Extract post ID from input data using field mapping
   * Similar to post-upserter's field extraction
   * Handles paths like "duplicates.id" by extracting the remaining path after array expansion
   */
  private extractPostId(
    inputData: Record<string, any>,
    config: PostDeleterConfig,
  ): string | null {
    if (!inputData || typeof inputData !== 'object') {
      return null;
    }

    let idFieldPath = config.fieldMappings?.id || 'id';

    this.logger.debug(
      `[Post Deleter] extractPostId - fieldMappings.id: ${idFieldPath}, inputData keys: ${Object.keys(inputData).join(', ')}`,
    );

    // If field path starts with "duplicates." or "items.", strip the prefix
    // because we've already expanded those arrays in pre-processing
    if (idFieldPath.startsWith('duplicates.')) {
      idFieldPath = idFieldPath.substring(11); // Remove "duplicates." prefix
      this.logger.debug(
        `[Post Deleter] extractPostId - Stripped "duplicates." prefix. New path: "${idFieldPath}"`,
      );
    } else if (idFieldPath.startsWith('items.')) {
      idFieldPath = idFieldPath.substring(6); // Remove "items." prefix
      this.logger.debug(
        `[Post Deleter] extractPostId - Stripped "items." prefix. New path: "${idFieldPath}"`,
      );
    }

    // If path is empty after stripping, default to "id"
    if (!idFieldPath) {
      idFieldPath = 'id';
    }

    // Extract ID using field mapping
    const id = this.extractFieldValue(inputData, idFieldPath);

    if (id !== null && id !== undefined) {
      const idString = String(id).trim();
      if (idString) {
        this.logger.debug(
          `[Post Deleter] extractPostId - Extracted ID: ${idString}`,
        );
        return idString;
      }
    }

    this.logger.warn(
      `[Post Deleter] extractPostId - Could not extract post ID from input data using path "${idFieldPath}". Input data keys: ${Object.keys(inputData).join(', ')}`,
    );
    return null;
  }

  /**
   * Extract field value from nested object using dot notation
   * Automatically strips 'data.' prefix if fieldPath starts with it but data doesn't have 'data' property
   * Similar to post-upserter's extractFieldValue
   */
  private extractFieldValue(data: Record<string, any>, fieldPath: string): any {
    this.logger.debug(
      `[Post Deleter] extractFieldValue - fieldPath: "${fieldPath}", data keys: ${Object.keys(data).join(', ')}`,
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
        `[Post Deleter] extractFieldValue - Stripping "data." prefix. Original: "${fieldPath}", New: "${strippedPath}"`,
      );
      fieldPath = strippedPath;
    }

    const parts = fieldPath.split('.');
    let value = data;
    this.logger.debug(
      `[Post Deleter] extractFieldValue - Splitting path into parts: ${parts.join(', ')}`,
    );

    for (const part of parts) {
      this.logger.debug(
        `[Post Deleter] extractFieldValue - Current part: "${part}", value type: ${typeof value}, is object: ${typeof value === 'object' && value !== null}`,
      );
      if (value === null || value === undefined) {
        this.logger.debug(
          `[Post Deleter] extractFieldValue - Value is null/undefined at part "${part}", returning null`,
        );
        return null;
      }
      if (typeof value !== 'object') {
        this.logger.debug(
          `[Post Deleter] extractFieldValue - Value is not an object (type: ${typeof value}), cannot traverse further`,
        );
        return null;
      }
      value = value[part];
      this.logger.debug(
        `[Post Deleter] extractFieldValue - After accessing "${part}": ${value !== undefined && value !== null ? (typeof value === 'object' ? `[object with keys: ${Object.keys(value as any).join(', ')}]` : String(value).substring(0, 100)) : 'undefined/null'}`,
      );
    }

    this.logger.debug(
      `[Post Deleter] extractFieldValue - Final extracted value: ${value !== undefined && value !== null ? (typeof value === 'object' ? `[object]` : String(value).substring(0, 100)) : 'undefined/null'}`,
    );
    return value;
  }

  /**
   * Format output for storage/display
   * Always returns a structured object with deleted, requested, failed, and postIds
   * NEVER returns an empty array - always returns an object
   */
  formatOutput(
    result: StepExecutionResult,
    _originalInput?: DocumentSegment[],
  ): any {
    this.logger.debug(
      `[Post Deleter] formatOutput - outputSegments type: ${Array.isArray(result.outputSegments) ? 'array' : typeof result.outputSegments}, length: ${Array.isArray(result.outputSegments) ? result.outputSegments.length : 'N/A'}`,
    );

    // The outputSegments is an array with one object like {deleted: 5, requested: 10, ...}
    if (
      Array.isArray(result.outputSegments) &&
      result.outputSegments.length === 1 &&
      typeof result.outputSegments[0] === 'object' &&
      result.outputSegments[0] !== null
    ) {
      const output = result.outputSegments[0];
      this.logger.debug(
        `[Post Deleter] formatOutput - Returning output object with keys: ${Object.keys(output).join(', ')}`,
      );
      return output;
    }

    // If outputSegments is empty or not in expected format, return default structure
    // This ensures we always return a consistent object format, not an empty array
    if (
      !result.outputSegments ||
      !Array.isArray(result.outputSegments) ||
      result.outputSegments.length === 0
    ) {
      this.logger.debug(
        `[Post Deleter] formatOutput - outputSegments is empty, returning default structure`,
      );
      return {
        deleted: 0,
        requested: 0,
        failed: 0,
        postIds: [],
      };
    }

    // If outputSegments has multiple items or unexpected format, try to extract from first item
    if (
      Array.isArray(result.outputSegments) &&
      result.outputSegments.length > 0
    ) {
      const firstItem = result.outputSegments[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        // Check if it has the expected structure
        if (
          'deleted' in firstItem ||
          'requested' in firstItem ||
          'postIds' in firstItem
        ) {
          this.logger.debug(
            `[Post Deleter] formatOutput - Using first item from outputSegments`,
          );
          return firstItem;
        }
      }
    }

    // Last resort: return default structure (never return array)
    this.logger.warn(
      `[Post Deleter] formatOutput - Unexpected outputSegments format, returning default structure`,
    );
    return {
      deleted: 0,
      requested: 0,
      failed: 0,
      postIds: [],
    };
  }
}
