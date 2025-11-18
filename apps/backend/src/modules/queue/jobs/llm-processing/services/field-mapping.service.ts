import { Injectable, Logger } from '@nestjs/common';
import {
  FieldMappingConfig,
  FieldMappingRule,
} from '../interfaces/result-application-strategy.interface';

/**
 * Service to apply field mappings from LLM results to entity updates
 * Inspired by PostsService.transformSourceData field mapping logic
 */
@Injectable()
export class FieldMappingService {
  private readonly logger = new Logger(FieldMappingService.name);

  /**
   * Apply field mappings to create entity update object
   * @param result - LLM result object
   * @param config - Field mapping configuration
   * @returns Object with entity fields to update
   */
  applyMappings(result: any, config: FieldMappingConfig): Record<string, any> {
    this.logger.log(
      `Applying field mappings. LLM result structure: ${JSON.stringify(result, null, 2)}`,
    );
    this.logger.log(
      `Field mapping config: ${JSON.stringify(config.mappings, null, 2)}`,
    );

    const update: Record<string, any> = {};

    // Apply defaults first
    if (config.defaults) {
      Object.assign(update, config.defaults);
      this.logger.debug(`Applied defaults: ${JSON.stringify(config.defaults)}`);
    }

    // Apply field mappings
    for (const [entityField, mapping] of Object.entries(config.mappings)) {
      try {
        const value = this.extractAndTransformValue(
          result,
          mapping,
          entityField,
        );

        if (value !== undefined && value !== null) {
          // Handle nested field paths (e.g., "meta.field")
          this.setNestedField(update, entityField, value);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to map field ${entityField}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Apply enum conversions if configured
    if (config.enumConversions) {
      for (const [field, conversions] of Object.entries(
        config.enumConversions,
      )) {
        const currentValue = this.getNestedField(update, field);
        if (currentValue !== undefined && conversions[currentValue]) {
          const convertedValue = conversions[currentValue];
          this.logger.debug(
            `Converting enum field ${field}: ${currentValue} → ${convertedValue}`,
          );
          this.setNestedField(update, field, convertedValue);
        }
      }
    }

    this.logger.log(
      `Final update object after field mappings: ${JSON.stringify(update, null, 2)}`,
    );

    return update;
  }

  /**
   * Extract value from result using mapping rule and apply transformation
   */
  private extractAndTransformValue(
    result: any,
    mapping: string | FieldMappingRule,
    entityField: string,
  ): any {
    let sourcePath: string;
    let transform: ((value: any) => any) | undefined;
    let defaultValue: any;

    if (typeof mapping === 'string') {
      sourcePath = mapping;
    } else {
      sourcePath = mapping.from;
      transform = mapping.transform;
      defaultValue = mapping.defaultValue;
    }

    // Extract value from result using nested path
    let value = this.getNestedField(result, sourcePath);

    // Log extraction for debugging
    this.logger.debug(
      `Extracting field ${entityField}: sourcePath="${sourcePath}", value=${JSON.stringify(value)}`,
    );

    // Use default if value is missing
    if ((value === undefined || value === null) && defaultValue !== undefined) {
      this.logger.debug(
        `Using default value for field ${entityField}: ${JSON.stringify(defaultValue)}`,
      );
      value = defaultValue;
    }

    // Apply transformation if provided
    if (value !== undefined && value !== null && transform) {
      try {
        value = transform(value);
      } catch (error) {
        this.logger.warn(
          `Transformation failed for field ${entityField}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Get nested field value using dot notation (e.g., "meta.field")
   */
  private getNestedField(obj: any, path: string): any {
    if (!path || !obj) {
      return undefined;
    }

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set nested field value using dot notation (e.g., "meta.field")
   */
  private setNestedField(obj: any, path: string, value: any): void {
    if (!path) {
      return;
    }

    const parts = path.split('.');
    const lastPart = parts.pop()!;

    // Navigate/create nested structure
    let current = obj;
    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    // Set the final value
    current[lastPart] = value;
  }
}
