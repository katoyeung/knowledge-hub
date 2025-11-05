/**
 * Workflow constants for pipeline node processing
 * Centralized constants to avoid hardcoded values across workflow services
 */
export const WORKFLOW_CONSTANTS = {
  VERSION: '1.0.0',
  DEFAULT_ENVIRONMENT: 'development',
  DEFAULT_TRIGGER_SOURCE: 'manual',

  // Data limits
  MAX_ARRAY_ITEMS: 10,
  MAX_ARRAY_ITEMS_PREVIEW: 10,
  MAX_KEYS_TO_PROCESS: 20,
  MAX_VALUE_LENGTH: 5,
  MAX_STRING_LENGTH: 50000,

  // Preview lengths
  PREVIEW_LENGTH_SHORT: 100,
  PREVIEW_LENGTH_MEDIUM: 200,
  PREVIEW_LENGTH_LONG: 300,
  PREVIEW_LENGTH_EXTRA_LONG: 500,

  // Batch sizes
  BATCH_SIZE_SMALL: 5,
  BATCH_SIZE_MEDIUM: 10,
  BATCH_SIZE_LARGE: 100,

  // Cache settings
  CACHE_THRESHOLD: 1000,
  MAX_MEMORY_NODES: 10,

  // Time conversions
  MS_TO_SECONDS: 1000,
  BYTES_TO_KB: 1024,

  // Validation
  MAX_RETRIES: 10,
  MIN_LENGTH: 100,
  MAX_LENGTH: 1000,

  // Formatting
  JSON_INDENTATION: 2,
  STRING_PREFIX_REMOVAL_DATA: 5,
  STRING_PREFIX_REMOVAL_ITEMS: 6,
  STRING_PREFIX_REMOVAL_DUPLICATES: 11,

  // Progress
  PROGRESS_COMPLETE: 100,
} as const;
