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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _inputSegments: DocumentSegment[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: PostDeleterConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    // This method is not used - the execute() method overrides the base class behavior
    // Keeping it for interface compliance but it should not be called
    this.logger.warn('executeStep() called but execute() is overridden');
    return Promise.resolve([]);
  }

  async execute(
    inputSegments: any,
    config: PostDeleterConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log('='.repeat(80));
    this.logger.log('Post Deleter - Starting Execution');
    this.logger.log('='.repeat(80));

    // Check field mapping first to determine which array to extract
    const idFieldPath = config.fieldMappings?.id || 'id';

    // Extract the array name from the field path (e.g., "duplicates" from "duplicates.id")
    // This makes the code generic and works with any array name, not just "duplicates" or "items"
    const getArrayNameFromPath = (path: string): string | null => {
      if (!path.includes('.')) {
        return null; // Simple field like "id", not an array path
      }
      const parts = path.split('.');
      return parts[0]; // First part is the array name
    };

    const targetArrayName = getArrayNameFromPath(idFieldPath);

    // Unwrap input to safely extract segments
    // If field mapping targets a specific array (e.g., "duplicates.id", "items.id", "data.id"),
    // we need to preserve the full structure to access the correct array
    let unwrapResult: any;
    let segmentsToProcess: any[] = [];

    // Special handling: if field mapping targets a specific array,
    // we need to extract that array specifically, not the first array found
    if (targetArrayName) {
      // For paths like "duplicates.id", "items.id", "data.id", etc., we need to preserve
      // the full object structure and extract the specific array later in the processing loop
      if (Array.isArray(inputSegments)) {
        // If input is already an array, check if first item has the structure
        if (inputSegments.length > 0 && typeof inputSegments[0] === 'object') {
          segmentsToProcess = inputSegments;
        } else {
          segmentsToProcess = inputSegments;
        }
      } else if (typeof inputSegments === 'object' && inputSegments !== null) {
        // Input is an object - check if it has the target array structure
        // Use dynamic property access instead of hardcoding field names
        const hasTargetArray =
          targetArrayName && Array.isArray(inputSegments[targetArrayName]);

        if (hasTargetArray) {
          // This is the structure we need - wrap it to preserve
          segmentsToProcess = [inputSegments];
          this.logger.log(
            `[Post Deleter] Input is object with target array "${targetArrayName}", wrapping in array`,
          );
        } else {
          // Regular object, wrap it
          segmentsToProcess = [inputSegments];
        }
      } else {
        segmentsToProcess = [];
      }
      unwrapResult = {
        segments: segmentsToProcess,
        extractedKey: null,
        adjustedFieldPath: idFieldPath,
      };
    } else {
      // Normal unwrap for other field mappings (simple field paths like "id")
      unwrapResult = this.unwrapInput(inputSegments);
      segmentsToProcess = unwrapResult.segments;
    }

    // Defensive check: ensure segmentsToProcess is always an array
    if (!Array.isArray(segmentsToProcess)) {
      this.logger.warn(
        `unwrapInput returned non-array segments. Type: ${typeof segmentsToProcess}, converting to array.`,
      );
      segmentsToProcess = segmentsToProcess ? [segmentsToProcess] : [];
    }

    // Convert to DocumentSegment format
    const inputSegmentsArray =
      this.segmentsToDocumentSegments(segmentsToProcess);

    // Log input structure for debugging
    this.logger.log(`Input Segments Count: ${inputSegmentsArray.length}`);
    this.logger.log(
      `Raw input type: ${Array.isArray(inputSegments) ? 'array' : typeof inputSegments}`,
    );
    if (
      typeof inputSegments === 'object' &&
      inputSegments !== null &&
      !Array.isArray(inputSegments)
    ) {
      this.logger.log(
        `Raw input keys: ${Object.keys(inputSegments).join(', ')}`,
      );
    }
    if (segmentsToProcess.length > 0) {
      const firstRaw = segmentsToProcess[0];
      this.logger.log(
        `First raw segment type: ${typeof firstRaw}, keys: ${typeof firstRaw === 'object' && firstRaw !== null ? Object.keys(firstRaw).join(', ') : 'N/A'}`,
      );
    }
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
      // First, validate that the target field/array exists in input data
      // If field mapping requires a specific array (duplicates/items) but it's not found, skip deletion
      // We need to check the raw input before conversion to DocumentSegment, or after extraction
      let targetArrayFound = false;

      // Check raw input first (before DocumentSegment conversion)
      // Also check if inputSegments itself is the object (not wrapped)
      let firstInputData: any = null;

      // First, check if inputSegments itself is the object structure we need
      // Use dynamic check based on targetArrayName instead of hardcoding
      if (
        typeof inputSegments === 'object' &&
        inputSegments !== null &&
        !Array.isArray(inputSegments) &&
        targetArrayName &&
        Array.isArray(inputSegments[targetArrayName])
      ) {
        firstInputData = inputSegments;
        this.logger.log(
          `[Post Deleter] Found structure directly in inputSegments (not wrapped) with array "${targetArrayName}"`,
        );
      } else if (segmentsToProcess.length > 0) {
        const firstRawSegment = segmentsToProcess[0];

        // Try to get the data directly from the raw segment
        if (typeof firstRawSegment === 'object' && firstRawSegment !== null) {
          // Check if it has the target array structure (dynamic check)
          if (
            targetArrayName &&
            Array.isArray(firstRawSegment[targetArrayName])
          ) {
            firstInputData = firstRawSegment;
            this.logger.log(
              `[Post Deleter] Found structure in first raw segment with array "${targetArrayName}"`,
            );
          } else if (firstRawSegment.content) {
            // Try parsing content
            try {
              firstInputData = JSON.parse(firstRawSegment.content);
              this.logger.log(
                `[Post Deleter] Parsed structure from content field`,
              );
            } catch {
              // Not JSON, continue
            }
          }
        }
      }

      // If still not found, try extracting from converted segment
      if (!firstInputData && inputSegmentsArray.length > 0) {
        firstInputData = this.extractInputData(inputSegmentsArray[0]);
        if (firstInputData) {
          this.logger.log(
            `[Post Deleter] Extracted structure using extractInputData`,
          );
        }
      }

      // Validate that the target array exists (generic check using targetArrayName)
      if (targetArrayName) {
        const targetArrayValue =
          firstInputData && typeof firstInputData === 'object'
            ? firstInputData[targetArrayName]
            : null;

        if (Array.isArray(targetArrayValue) && targetArrayValue.length > 0) {
          targetArrayFound = true;
          this.logger.log(
            `[Post Deleter] Found ${targetArrayName} array with ${targetArrayValue.length} items`,
          );
        } else {
          this.logger.warn(
            `[Post Deleter] Field mapping "${idFieldPath}" requires ${targetArrayName} array but it's not found or empty in input data. Available keys: ${firstInputData ? Object.keys(firstInputData).join(', ') : 'none'}. Skipping deletion.`,
          );
        }
      } else {
        // For simple field mappings (not array paths), we'll proceed and check during ID extraction
        targetArrayFound = true;
      }

      // If field mapping requires a specific array but it's not found, return early without deleting
      if (!targetArrayFound && targetArrayName) {
        this.logger.warn(
          `[Post Deleter] Cannot find target field from field mapping "${idFieldPath}". Skipping deletion to prevent accidental deletion.`,
        );
        const endTime = new Date();
        const metrics = this.calculateMetrics(
          inputSegmentsArray,
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
              warning: `Target field not found: field mapping "${idFieldPath}" requires ${targetArrayName} array but it's not present in input data`,
            },
          ] as any,
          metrics: {
            ...metrics,
            postsDeleted: 0,
            postsRequested: 0,
          },
        };
      }

      // Pre-process: Expand arrays based on field mapping
      // If field mapping is "duplicates.id", expand duplicates array
      // If field mapping is "items.id", expand items array
      // If field mapping is "data.id", expand data array
      // Otherwise, check for 'data' array (like Lenx API output)
      const processedSegments: DocumentSegment[] = [];

      for (const segment of inputSegmentsArray) {
        const inputData = this.extractInputData(segment);

        this.logger.debug(
          `[Post Deleter] Processing segment. Field mapping: "${idFieldPath}", inputData keys: ${inputData ? Object.keys(inputData).join(', ') : 'none'}`,
        );

        // Check if field mapping indicates we should use a specific array
        // Use dynamic array name from fieldMappings, not hardcoded
        if (targetArrayName) {
          // Field mapping targets a specific array (e.g., "duplicates.id", "items.id")
          // Extract that array from inputData using the array name from fieldMappings
          const targetArray =
            inputData && typeof inputData === 'object'
              ? inputData[targetArrayName]
              : null;

          if (Array.isArray(targetArray) && targetArray.length > 0) {
            this.logger.debug(
              `[Post Deleter] Field mapping "${idFieldPath}" targets array "${targetArrayName}". Expanding ${targetArray.length} items`,
            );
            // Expand each item in the target array into a separate segment
            for (const arrayItem of targetArray) {
              // If arrayItem is a DocumentSegment with content, use its content
              // Otherwise, stringify the item itself
              let itemContent: string;
              if (
                typeof arrayItem === 'object' &&
                arrayItem !== null &&
                'content' in arrayItem &&
                typeof arrayItem.content === 'string'
              ) {
                // It's a DocumentSegment - use its content directly
                itemContent = arrayItem.content;
              } else {
                // It's a plain object - stringify it
                itemContent = JSON.stringify(arrayItem);
              }

              // Create new segment with only the content, don't preserve segment.id
              const expandedSegment = {
                content: itemContent,
                wordCount: segment.wordCount || 0,
                tokens: segment.tokens || 0,
                status: segment.status || 'pending',
                position: segment.position || 0,
              } as DocumentSegment;
              processedSegments.push(expandedSegment);
            }
          } else {
            this.logger.warn(
              `[Post Deleter] Field mapping "${idFieldPath}" requires array "${targetArrayName}" but it's not found or empty in input data. Skipping this segment.`,
            );
            // Skip this segment - don't add it to processedSegments
          }
        } else {
          // Field mapping is a simple path (e.g., "id", "postId") - no array expansion needed
          // Use the segment as-is for ID extraction
          this.logger.debug(
            `[Post Deleter] Field mapping "${idFieldPath}" is a simple path, using segment as-is`,
          );
          processedSegments.push(segment);
        }
      }

      this.logger.debug(
        `[Post Deleter] Processed ${inputSegmentsArray.length} input segments into ${processedSegments.length} items to process`,
      );

      // Loop through input dataset to extract post IDs
      const postIds: string[] = [];
      const failedExtractions: number[] = [];

      for (let i = 0; i < processedSegments.length; i++) {
        const inputItem = processedSegments[i];
        try {
          // Extract input data from segment
          const inputData = this.extractInputData(inputItem);

          // Debug: log what we extracted
          this.logger.debug(
            `[Post Deleter] Item ${i + 1} - Extracted inputData keys: ${inputData ? Object.keys(inputData).join(', ') : 'none'}`,
          );
          if (inputData && inputData.id) {
            this.logger.debug(
              `[Post Deleter] Item ${i + 1} - Found id field: ${inputData.id} (type: ${typeof inputData.id})`,
            );
          }

          // Extract post ID using field mapping
          const postId = this.extractPostId(inputData, config);

          if (postId) {
            postIds.push(postId);
            this.logger.debug(
              `[Post Deleter] Extracted post ID ${postId} from item ${i + 1}`,
            );
          } else {
            failedExtractions.push(i + 1);
            this.logger.warn(
              `[Post Deleter] Could not extract post ID from item ${i + 1} using field mapping "${idFieldPath}"`,
            );
          }
        } catch (error) {
          failedExtractions.push(i + 1);
          this.logger.error(
            `Failed to extract post ID from item ${i}: ${error.message}`,
            error.stack,
          );
          // Continue processing other items even if one fails
        }
      }

      // If field mapping requires a specific field but we couldn't extract any IDs, skip deletion
      if (postIds.length === 0) {
        this.logger.warn(
          `[Post Deleter] Could not extract any post IDs using field mapping "${idFieldPath}". This may indicate the target field is not present in input data. Skipping deletion to prevent accidental deletion.`,
        );
        const endTime = new Date();
        const metrics = this.calculateMetrics(
          inputSegmentsArray,
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
              warning: `No post IDs could be extracted using field mapping "${idFieldPath}". Target field may not be present in input data.`,
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
        inputSegmentsArray,
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

      // Convert inputSegments to array format for error handling
      let errorSegments: DocumentSegment[] = [];
      try {
        const unwrapResult = this.unwrapInput(inputSegments);
        let segments = unwrapResult.segments;
        if (!Array.isArray(segments)) {
          segments = segments ? [segments] : [];
        }
        errorSegments = this.segmentsToDocumentSegments(segments);
      } catch (unwrapError) {
        this.logger.warn(
          `Failed to unwrap input for error handling: ${unwrapError.message}`,
        );
        errorSegments = [];
      }

      return {
        success: false,
        outputSegments: [],
        metrics: this.calculateMetrics(
          errorSegments,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _rollbackData: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
   * Always prioritizes content parsing as it contains the actual data structure
   * No hardcoded field names - works with any data structure
   */
  private extractInputData(inputItem: DocumentSegment): Record<string, any> {
    // Cast to any to access flexible properties that may be added by workflow nodes
    const item = inputItem as any;

    this.logger.debug(
      `[Post Deleter] extractInputData - Input item has content: ${!!inputItem.content}, content length: ${inputItem.content?.length || 0}`,
    );

    // Try to parse content as JSON first - this is the primary source of post data
    // Content should contain the post object with the actual post ID
    // We prioritize content parsing because it contains the actual data structure
    if (inputItem.content) {
      try {
        const parsed = JSON.parse(inputItem.content);
        if (typeof parsed === 'object' && parsed !== null) {
          this.logger.debug(
            `[Post Deleter] extractInputData - Successfully parsed JSON from content. Keys: ${Object.keys(parsed).join(', ')}, has id: ${!!parsed.id}`,
          );
          // If parsed object has an id field, this is likely the post object
          // Return it directly - this is what we want
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

    // Check if inputItem itself is already the data object (not a DocumentSegment)
    // This can happen when workflow executor passes raw data structures
    // Only use this if it doesn't have DocumentSegment properties
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

    // Check if the item itself has array structures directly (not in content)
    // This handles cases where the full object structure is preserved in the segment
    // But only if content parsing didn't work
    // Use generic check - look for any array property, not hardcoded names
    if (typeof item === 'object' && item !== null) {
      // Check if item has any array properties (generic check)
      const hasArrayProperty = Object.keys(item).some((key) =>
        Array.isArray(item[key]),
      );
      if (hasArrayProperty) {
        this.logger.debug(
          `[Post Deleter] extractInputData - Found structure directly in item with array properties. Keys: ${Object.keys(item).join(', ')}`,
        );
        return item as Record<string, any>;
      }
    }

    // Try meta object (may be added by previous workflow nodes)
    if (item.meta && typeof item.meta === 'object') {
      this.logger.debug(
        `[Post Deleter] extractInputData - Using meta object. Keys: ${Object.keys(item.meta).join(', ')}`,
      );
      return item.meta as Record<string, any>;
    }

    // Fallback: try to parse content one more time with more detailed error info
    // Never use segment.id as fallback - it's not a post ID
    if (inputItem.content && typeof inputItem.content === 'string') {
      try {
        const reparsed = JSON.parse(inputItem.content);
        if (typeof reparsed === 'object' && reparsed !== null) {
          this.logger.debug(
            `[Post Deleter] extractInputData - Successfully re-parsed content in fallback. Keys: ${Object.keys(reparsed).join(', ')}`,
          );
          return reparsed;
        }
      } catch (error) {
        this.logger.debug(
          `[Post Deleter] extractInputData - Final parse attempt failed: ${error.message}`,
        );
      }
    }

    // Last resort: return meta/other properties but NEVER use segment.id
    // Segment IDs like "seg-0" are not post IDs
    const fallbackData: Record<string, any> = {
      content: inputItem.content,
      ...(item.meta || {}),
      ...(item.keywords || {}),
      ...(item.hierarchyMetadata || {}),
    };
    this.logger.debug(
      `[Post Deleter] extractInputData - Using fallback data (without segment.id). Keys: ${Object.keys(fallbackData).join(', ')}`,
    );

    return fallbackData;
  }

  /**
   * Extract post ID from input data using field mapping
   * Similar to post-upserter's field extraction
   * Handles paths like "duplicates.id", "items.id", "data.id", etc. by extracting the remaining path after array expansion
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

    // Extract array name from path (e.g., "duplicates" from "duplicates.id")
    const getArrayNameFromPath = (path: string): string | null => {
      if (!path.includes('.')) {
        return null;
      }
      const parts = path.split('.');
      return parts[0];
    };

    const arrayName = getArrayNameFromPath(idFieldPath);

    // If field path starts with an array name (e.g., "duplicates.", "items.", "data."),
    // strip the prefix because we've already expanded those arrays in pre-processing
    if (arrayName && idFieldPath.startsWith(`${arrayName}.`)) {
      idFieldPath = idFieldPath.substring(arrayName.length + 1); // Remove "arrayName." prefix
      this.logger.debug(
        `[Post Deleter] extractPostId - Stripped "${arrayName}." prefix. New path: "${idFieldPath}"`,
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
   * Generic implementation that works with any field path
   */
  private extractFieldValue(data: Record<string, any>, fieldPath: string): any {
    this.logger.debug(
      `[Post Deleter] extractFieldValue - fieldPath: "${fieldPath}", data keys: ${Object.keys(data).join(', ')}`,
    );

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
