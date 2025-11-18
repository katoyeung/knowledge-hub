import { ContentExtractionStrategy } from './content-extraction-strategy.interface';
import {
  ResultApplicationStrategy,
  FieldMappingConfig,
} from './result-application-strategy.interface';

/**
 * Policy interface that combines all strategies for entity processing
 * Encapsulates entity-specific behavior: extraction, result application, field mappings, status updates
 */
export interface EntityProcessingPolicy {
  /**
   * Get the entity type this policy handles
   */
  getEntityType(): string;

  /**
   * Get the content extraction strategy
   */
  getContentExtractionStrategy(): ContentExtractionStrategy<any>;

  /**
   * Get the result application strategy
   */
  getResultApplicationStrategy(): ResultApplicationStrategy;

  /**
   * Get default field mapping configuration for common use cases
   * Can be overridden by job data
   */
  getDefaultFieldMappings(): FieldMappingConfig | null;

  /**
   * Process entity with LLM result
   * This is a convenience method that combines extraction and application
   */
  process(
    entityId: string,
    llmResult: any,
    fieldMappings: FieldMappingConfig,
    metadata?: any,
  ): Promise<void>;
}
