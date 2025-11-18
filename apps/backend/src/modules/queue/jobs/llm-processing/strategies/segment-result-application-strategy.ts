import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResultApplicationStrategy,
  FieldMappingConfig,
} from '../interfaces/result-application-strategy.interface';
import { FieldMappingService } from '../services/field-mapping.service';
import { DocumentSegment } from '../../../../dataset/entities/document-segment.entity';

/**
 * Result application strategy for DocumentSegment entities
 * Applies LLM results to DocumentSegment using field mapping configuration
 */
@Injectable()
export class SegmentResultApplicationStrategy
  implements ResultApplicationStrategy
{
  private readonly logger = new Logger(SegmentResultApplicationStrategy.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly fieldMappingService: FieldMappingService,
  ) {}

  getEntityType(): string {
    return 'segment';
  }

  async applyResult(
    entityId: string,
    result: any,
    fieldMappings: FieldMappingConfig,
    metadata?: any,
  ): Promise<void> {
    this.logger.log(`Applying LLM result to segment ${entityId}`);

    // Check if segment exists
    const segment = await this.segmentRepository.findOne({
      where: { id: entityId },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with ID ${entityId} not found`);
    }

    // Apply field mappings to create update object
    const updateData = this.fieldMappingService.applyMappings(
      result,
      fieldMappings,
    );

    // Handle nested meta fields - merge with existing meta if needed
    if (updateData.meta && segment.hierarchyMetadata) {
      // If segment has hierarchyMetadata, merge with meta updates
      const existingMeta = segment.hierarchyMetadata as Record<string, any>;
      updateData.hierarchyMetadata = {
        ...existingMeta,
        ...updateData.meta,
      };
      delete updateData.meta;
    } else if (updateData.meta) {
      // If no existing metadata, use meta as hierarchyMetadata
      updateData.hierarchyMetadata = updateData.meta;
      delete updateData.meta;
    }

    // Update the segment
    await this.segmentRepository.update(entityId, updateData);

    this.logger.log(
      `✅ Successfully applied result to segment ${entityId}. Updated fields: ${Object.keys(updateData).join(', ')}`,
    );
  }

  async handleError(
    entityId: string,
    error: Error,
    fieldMappings: FieldMappingConfig,
  ): Promise<void> {
    this.logger.error(
      `Handling error for segment ${entityId}: ${error.message}`,
    );

    const statusField = fieldMappings.statusField || 'status';
    const errorStatus = fieldMappings.statusValues?.error || 'error';

    const updateData: Record<string, any> = {
      [statusField]: errorStatus,
      error: error.message,
    };

    // Try to update segment (may fail if segment doesn't exist, but that's okay)
    try {
      await this.segmentRepository.update(entityId, updateData);
    } catch (updateError) {
      this.logger.warn(
        `Failed to update segment ${entityId} with error status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );
    }
  }

  getSupportedResultSchemas(): string[] {
    // Return empty array to indicate all schemas are supported
    // Specific schemas can be validated by the job if needed
    return [];
  }
}
