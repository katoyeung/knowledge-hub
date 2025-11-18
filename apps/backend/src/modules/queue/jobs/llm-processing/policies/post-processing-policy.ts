import { Injectable } from '@nestjs/common';
import { EntityProcessingPolicy } from '../interfaces/entity-processing-policy.interface';
import { ContentExtractionStrategy } from '../interfaces/content-extraction-strategy.interface';
import {
  ResultApplicationStrategy,
  FieldMappingConfig,
} from '../interfaces/result-application-strategy.interface';
import { PostContentExtractionStrategy } from '../strategies/post-content-extraction-strategy';
import { PostResultApplicationStrategy } from '../strategies/post-result-application-strategy';
import { PostStatus } from '../../../../posts/enums/post-status.enum';

/**
 * Processing policy for Post entities
 * Combines content extraction and result application strategies
 * Provides default field mappings for common Post use cases
 */
@Injectable()
export class PostProcessingPolicy implements EntityProcessingPolicy {
  constructor(
    private readonly contentExtractionStrategy: PostContentExtractionStrategy,
    private readonly resultApplicationStrategy: PostResultApplicationStrategy,
  ) {}

  getEntityType(): string {
    return 'post';
  }

  getContentExtractionStrategy(): ContentExtractionStrategy<any> {
    return this.contentExtractionStrategy;
  }

  getResultApplicationStrategy(): ResultApplicationStrategy {
    return this.resultApplicationStrategy;
  }

  /**
   * Get default field mappings for Post approval use case
   * Can be overridden by job data
   */
  getDefaultFieldMappings(): FieldMappingConfig | null {
    return {
      mappings: {
        status: {
          from: 'decision', // LLM returns "decision", not "status"
          transform: (v) =>
            v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
        },
        approvalReason: 'reason',
        confidenceScore: 'confidenceScore',
      },
      enumConversions: {
        status: {
          approved: PostStatus.APPROVED,
          rejected: PostStatus.REJECTED,
        },
      },
      statusField: 'status',
      statusValues: {
        pending: PostStatus.PENDING,
        error: PostStatus.PENDING, // Keep as pending on error
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
