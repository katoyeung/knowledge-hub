/**
 * Strategy interface for applying LLM results to entities
 * Handles mapping LLM result fields to entity fields using field mapping configuration
 */
export interface ResultApplicationStrategy {
  /**
   * Get the entity type this strategy handles
   */
  getEntityType(): string;

  /**
   * Apply LLM result to entity using field mappings
   * @param entityId - The ID of the entity to update
   * @param result - The LLM result object
   * @param fieldMappings - Field mapping configuration
   * @param metadata - Optional processing metadata
   */
  applyResult(
    entityId: string,
    result: any,
    fieldMappings: FieldMappingConfig,
    metadata?: ProcessingMetadata,
  ): Promise<void>;

  /**
   * Handle error during processing
   * Updates entity to error state using field mappings
   */
  handleError(
    entityId: string,
    error: Error,
    fieldMappings: FieldMappingConfig,
  ): Promise<void>;

  /**
   * Get supported result schema types (e.g., 'approval', 'extraction', 'classification')
   * Returns empty array if all schemas are supported
   */
  getSupportedResultSchemas(): string[];
}

/**
 * Field mapping configuration
 * Maps LLM result fields to entity fields
 */
export interface FieldMappingConfig {
  /**
   * Field mappings: { "entityField": "resultField" } or { "entityField": FieldMappingRule }
   * Supports nested paths like "meta.field" or "result.data.field"
   */
  mappings: Record<string, string | FieldMappingRule>;

  /**
   * Optional enum conversions for status fields
   * Example: { "status": { "approved": PostStatus.APPROVED, "rejected": PostStatus.REJECTED } }
   */
  enumConversions?: Record<string, Record<string, any>>;

  /**
   * Optional default values for fields not in result
   */
  defaults?: Record<string, any>;

  /**
   * Optional status field name (defaults to 'status')
   */
  statusField?: string;

  /**
   * Optional status values for different states
   */
  statusValues?: {
    pending?: any;
    processing?: any;
    completed?: any;
    error?: any;
  };
}

/**
 * Field mapping rule with transformation
 */
export interface FieldMappingRule {
  /**
   * Source field path in LLM result (e.g., "status", "data.reason", "meta.confidence")
   */
  from: string;

  /**
   * Optional transformation function
   */
  transform?: (value: any) => any;

  /**
   * Fallback value if source field is missing
   */
  defaultValue?: any;
}

/**
 * Processing metadata
 */
export interface ProcessingMetadata {
  userId?: string;
  timestamp?: Date;
  [key: string]: any;
}
