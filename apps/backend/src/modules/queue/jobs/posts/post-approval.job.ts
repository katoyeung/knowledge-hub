import { Injectable, Logger } from '@nestjs/common';
import { BaseJob } from '../base/base.job';
import { RegisterJob } from '../../decorators/register-job.decorator';
import { PostStatus } from '../../../posts/enums/post-status.enum';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { GenericLLMProcessingJob } from '../llm-processing/generic-llm-processing.job';
import { FieldMappingConfig } from '../llm-processing/interfaces/result-application-strategy.interface';

export interface PostApprovalJobData {
  postId: string;
  promptId: string;
  aiProviderId: string;
  model: string;
  temperature?: number;
  userId: string;
}

/**
 * Post Approval Job - Wrapper around GenericLLMProcessingJob
 * Maintains backward compatibility while using the new flexible system
 * Provides default field mappings for approval use case
 */
@RegisterJob('post-approval')
@Injectable()
export class PostApprovalJob extends BaseJob<PostApprovalJobData> {
  protected readonly logger = new Logger(PostApprovalJob.name);

  constructor(
    private readonly genericLLMProcessingJob: GenericLLMProcessingJob,
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);

    this.logger.log(
      `PostApprovalJob initialized with jobType: ${this.jobType}`,
    );
  }

  async process(data: PostApprovalJobData): Promise<void> {
    const { postId, promptId, aiProviderId, model, temperature, userId } = data;

    this.logger.log(
      `🚀 [POST_APPROVAL] ========== STARTING POST APPROVAL JOB ==========`,
    );
    this.logger.log(
      `🚀 [POST_APPROVAL] Starting approval process for post ${postId}`,
    );
    this.logger.log(
      `🚀 [POST_APPROVAL] Job data: ${JSON.stringify(data, null, 2)}`,
    );

    // Define field mappings for approval use case
    // Note: LLM returns "decision" field, not "status"
    const fieldMappings: FieldMappingConfig = {
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

    // Delegate to generic LLM processing job
    await this.genericLLMProcessingJob.process({
      entityType: 'post',
      entityId: postId,
      promptId,
      aiProviderId,
      model,
      temperature,
      userId,
      fieldMappings,
    });

    this.logger.log(
      `✅ [POST_APPROVAL] Post approval completed for post ${postId}`,
    );
  }
}
