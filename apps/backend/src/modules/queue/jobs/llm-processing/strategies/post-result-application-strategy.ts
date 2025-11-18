import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResultApplicationStrategy,
  FieldMappingConfig,
} from '../interfaces/result-application-strategy.interface';
import { FieldMappingService } from '../services/field-mapping.service';
import { Post } from '../../../../posts/entities/post.entity';
import { NotificationService } from '../../../../notification/notification.service';

/**
 * Result application strategy for Post entities
 * Applies LLM results to Post using field mapping configuration
 */
@Injectable()
export class PostResultApplicationStrategy
  implements ResultApplicationStrategy
{
  private readonly logger = new Logger(PostResultApplicationStrategy.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    private readonly fieldMappingService: FieldMappingService,
    private readonly notificationService: NotificationService,
  ) {}

  getEntityType(): string {
    return 'post';
  }

  async applyResult(
    entityId: string,
    result: any,
    fieldMappings: FieldMappingConfig,
    metadata?: any,
  ): Promise<void> {
    this.logger.log(`Applying LLM result to post ${entityId}`);

    // Check if post exists
    const post = await this.postRepository.findOne({
      where: { id: entityId },
    });

    if (!post) {
      throw new NotFoundException(`Post with ID ${entityId} not found`);
    }

    // Log the raw LLM result for debugging
    this.logger.log(
      `Raw LLM result for post ${entityId}: ${JSON.stringify(result, null, 2)}`,
    );

    // Apply field mappings to create update object
    const updateData = this.fieldMappingService.applyMappings(
      result,
      fieldMappings,
    );

    this.logger.log(
      `Update data after mapping for post ${entityId}: ${JSON.stringify(updateData, null, 2)}`,
    );

    // Log the SQL update that will be executed
    this.logger.log(
      `🔄 Executing UPDATE query: UPDATE posts SET ${Object.keys(updateData)
        .map((key) => `${key} = $${Object.keys(updateData).indexOf(key) + 1}`)
        .join(', ')} WHERE id = $${Object.keys(updateData).length + 1}`,
    );
    this.logger.log(`   Values: ${JSON.stringify(Object.values(updateData))}`);

    // Update the post
    const updateResult = await this.postRepository.update(entityId, updateData);

    this.logger.log(
      `✅ Successfully applied result to post ${entityId}. Updated fields: ${Object.keys(updateData).join(', ')}`,
    );
    this.logger.log(
      `   Update result: ${JSON.stringify(updateResult)} (affected rows: ${updateResult.affected || 0})`,
    );

    // Verify the update by querying the post again
    const updatedPost = await this.postRepository.findOne({
      where: { id: entityId },
    });
    if (updatedPost) {
      this.logger.log(
        `✅ Verified post ${entityId} status updated to: ${updatedPost.status}`,
      );

      // Send notification to frontend that post approval completed
      this.notificationService.sendPostApprovalCompleted(entityId, {
        status: updatedPost.status,
        approvalReason: updatedPost.approvalReason,
        confidenceScore: updatedPost.confidenceScore,
        updatedAt: updatedPost.updatedAt,
      });
    }
  }

  async handleError(
    entityId: string,
    error: Error,
    fieldMappings: FieldMappingConfig,
  ): Promise<void> {
    this.logger.error(`Handling error for post ${entityId}: ${error.message}`);

    const statusField = fieldMappings.statusField || 'status';
    const errorStatus = fieldMappings.statusValues?.error;

    const updateData: Record<string, any> = {};

    // Set error status if configured
    if (errorStatus !== undefined) {
      updateData[statusField] = errorStatus;
    }

    // Try to update post (may fail if post doesn't exist, but that's okay)
    try {
      await this.postRepository.update(entityId, updateData);

      // Send notification to frontend that post approval failed
      this.notificationService.sendPostApprovalFailed(
        entityId,
        error.message || 'Unknown error',
      );
    } catch (updateError) {
      this.logger.warn(
        `Failed to update post ${entityId} with error status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );

      // Send notification even if update failed
      this.notificationService.sendPostApprovalFailed(
        entityId,
        error.message || 'Unknown error',
      );
    }
  }

  getSupportedResultSchemas(): string[] {
    // Return empty array to indicate all schemas are supported
    // Specific schemas can be validated by the job if needed
    return [];
  }
}
