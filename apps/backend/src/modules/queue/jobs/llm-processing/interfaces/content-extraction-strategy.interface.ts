/**
 * Strategy interface for extracting content from entities
 * Used to extract text content and template variables from different entity types
 */
export interface ContentExtractionStrategy<T = any> {
  /**
   * Get the entity type this strategy handles
   */
  getEntityType(): string;

  /**
   * Extract content string from entity for LLM processing
   */
  extractContent(entity: T): string;

  /**
   * Get entity ID
   */
  getEntityId(entity: T): string;

  /**
   * Extract template variables from entity for dynamic prompt substitution
   * Returns key-value pairs that can be used in prompt templates
   */
  extractTemplateVariables(entity: T): Record<string, string>;
}
