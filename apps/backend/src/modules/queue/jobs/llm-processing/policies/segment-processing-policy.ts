import { Injectable } from '@nestjs/common';
import { EntityProcessingPolicy } from '../interfaces/entity-processing-policy.interface';
import { ContentExtractionStrategy } from '../interfaces/content-extraction-strategy.interface';
import {
  ResultApplicationStrategy,
  FieldMappingConfig,
} from '../interfaces/result-application-strategy.interface';
import { SegmentContentExtractionStrategy } from '../strategies/segment-content-extraction-strategy';
import { SegmentResultApplicationStrategy } from '../strategies/segment-result-application-strategy';

/**
 * Processing policy for DocumentSegment entities
 * Combines content extraction and result application strategies
 * Provides default field mappings for common Segment use cases
 */
@Injectable()
export class SegmentProcessingPolicy implements EntityProcessingPolicy {
  constructor(
    private readonly contentExtractionStrategy: SegmentContentExtractionStrategy,
    private readonly resultApplicationStrategy: SegmentResultApplicationStrategy,
  ) {}

  getEntityType(): string {
    return 'segment';
  }

  getContentExtractionStrategy(): ContentExtractionStrategy<any> {
    return this.contentExtractionStrategy;
  }

  getResultApplicationStrategy(): ResultApplicationStrategy {
    return this.resultApplicationStrategy;
  }

  /**
   * Get default field mappings for Segment processing use case
   * Can be overridden by job data
   */
  getDefaultFieldMappings(): FieldMappingConfig | null {
    return {
      mappings: {
        status: 'status',
        'hierarchyMetadata.extractedData': 'extractedData',
        'hierarchyMetadata.classification': 'classification',
        'hierarchyMetadata.confidence': 'confidence',
      },
      statusField: 'status',
      statusValues: {
        pending: 'waiting',
        completed: 'completed',
        error: 'error',
      },
    };
  }

  async process(
    entityId: string,
    llmResult: any,
    fieldMappings: FieldMappingConfig,
    metadata?: any,
  ): Promise<void> {
    await this.resultApplicationStrategy.applyResult(
      entityId,
      llmResult,
      fieldMappings,
      metadata,
    );
  }
}
