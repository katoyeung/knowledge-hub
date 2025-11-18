import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { RegisterJob } from '../../decorators/register-job.decorator';
import { Post } from '../../../posts/entities/post.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { PromptService } from '../../../prompts/services/prompt.service';
import { AiProviderService } from '../../../ai-provider/services/ai-provider.service';
import { LLMClientFactory } from '../../../ai-provider/services/llm-client-factory.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { LLMExtractionService } from '@common/services/llm-extraction.service';
import { ProcessingPolicyFactory } from './factories/processing-policy-factory';
import {
  FieldMappingConfig,
  ProcessingMetadata,
} from './interfaces/result-application-strategy.interface';

export interface GenericLLMProcessingJobData {
  entityType: 'post' | 'segment' | string;
  entityId: string;
  promptId: string;
  aiProviderId: string;
  model: string;
  temperature?: number;
  userId: string;
  resultSchema?: string; // Optional: 'approval', 'extraction', 'classification', etc.
  templateVariables?: Record<string, string>;
  fieldMappings?: FieldMappingConfig;
  statusField?: string;
  statusValues?: {
    pending?: any;
    processing?: any;
    completed?: any;
    error?: any;
  };
}

/**
 * Generic LLM Processing Job using Template Method Pattern
 * Supports processing any entity type (Post, Segment, etc.) with configurable AI providers and prompts
 */
@RegisterJob('generic-llm-processing')
@Injectable()
export class GenericLLMProcessingJob extends BaseJob<GenericLLMProcessingJobData> {
  protected readonly logger = new Logger(GenericLLMProcessingJob.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly promptService: PromptService,
    private readonly aiProviderService: AiProviderService,
    private readonly llmClientFactory: LLMClientFactory,
    private readonly llmExtractionService: LLMExtractionService,
    private readonly processingPolicyFactory: ProcessingPolicyFactory,
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);

    this.logger.log(
      `GenericLLMProcessingJob initialized with jobType: ${this.jobType}`,
    );
  }

  /**
   * Template Method: Defines the algorithm structure
   * 1. Load entity by type and ID
   * 2. Get processing policy for entity type
   * 3. Extract content using policy's content extraction strategy
   * 4. Extract template variables from entity
   * 5. Call LLM using LLMExtractionService
   * 6. Apply result using policy's result application strategy with field mappings
   */
  async process(data: GenericLLMProcessingJobData): Promise<void> {
    const {
      entityType,
      entityId,
      promptId,
      aiProviderId,
      model,
      temperature,
      userId,
      templateVariables: additionalTemplateVariables,
      fieldMappings: providedFieldMappings,
      statusField,
      statusValues,
    } = data;

    this.logger.log(
      `🚀 [GENERIC_LLM_PROCESSING] ========== STARTING GENERIC LLM PROCESSING ==========`,
    );
    this.logger.log(
      `🚀 [GENERIC_LLM_PROCESSING] Starting processing for ${entityType} ${entityId}`,
    );
    this.logger.log(
      `🚀 [GENERIC_LLM_PROCESSING] Job data: ${JSON.stringify(data, null, 2)}`,
    );

    try {
      // Step 1: Load entity by type and ID
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Step 1: Loading ${entityType} entity with ID: ${entityId}`,
      );
      const entity = await this.loadEntity(entityType, entityId);
      if (!entity) {
        this.logger.error(
          `[GENERIC_LLM_PROCESSING] ❌ ${entityType} with ID ${entityId} not found`,
        );
        throw new NotFoundException(
          `${entityType} with ID ${entityId} not found`,
        );
      }
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] ✅ Successfully loaded ${entityType} entity`,
      );

      // Step 2: Get processing policy for entity type
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Step 2: Getting processing policy for ${entityType}`,
      );
      const policy = this.processingPolicyFactory.getPolicy(entityType);
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] ✅ Got processing policy: ${policy.getEntityType()}`,
      );

      // Step 3: Get or merge field mappings
      const fieldMappings = this.mergeFieldMappings(
        policy.getDefaultFieldMappings(),
        providedFieldMappings,
        statusField,
        statusValues,
      );

      // Step 4: Extract content using policy's content extraction strategy
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Step 4: Extracting content from ${entityType}`,
      );
      const contentExtractionStrategy = policy.getContentExtractionStrategy();
      const content = contentExtractionStrategy.extractContent(entity);
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] ✅ Extracted content (length: ${content.length} chars)`,
      );
      this.logger.debug(
        `[GENERIC_LLM_PROCESSING] Content preview: ${content.substring(0, 200)}...`,
      );

      // Step 5: Extract template variables from entity and merge with additional ones
      const entityTemplateVariables =
        contentExtractionStrategy.extractTemplateVariables(entity);
      const allTemplateVariables = {
        ...entityTemplateVariables,
        ...additionalTemplateVariables,
      };

      // Step 6: Get prompt and AI provider
      const prompt = await this.promptService.findPromptById(promptId);
      if (!prompt) {
        throw new NotFoundException(`Prompt with ID ${promptId} not found`);
      }

      const aiProvider = await this.aiProviderService.findOne({
        where: { id: aiProviderId },
      });
      if (!aiProvider) {
        throw new NotFoundException(
          `AI Provider with ID ${aiProviderId} not found`,
        );
      }

      if (!aiProvider.isActive) {
        throw new Error(`AI Provider ${aiProvider.name} is not active`);
      }

      // Step 7: Create LLM client and call LLM
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Step 7: Creating LLM client and calling LLM`,
      );
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] AI Provider: ${aiProvider.name} (${aiProvider.id})`,
      );
      this.logger.log(`[GENERIC_LLM_PROCESSING] Model: ${model}`);
      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Temperature: ${temperature || 0.7}`,
      );

      const llmClient = this.llmClientFactory.createClient(aiProvider);
      this.logger.log(`[GENERIC_LLM_PROCESSING] ✅ LLM client created`);

      this.logger.log(
        `[GENERIC_LLM_PROCESSING] Calling LLM extraction service...`,
      );
      const extractionResult = await this.llmExtractionService.extractWithLLM(
        {
          prompt,
          aiProvider,
          model,
          temperature,
          content,
          templateVariables: allTemplateVariables,
        },
        llmClient,
        {
          allowTextFallback: true,
        },
      );

      if (!extractionResult.success || !extractionResult.data) {
        throw new Error(
          extractionResult.error || 'Failed to get result from LLM',
        );
      }

      const llmResult = extractionResult.data;

      // Step 8: Apply result using policy's result application strategy
      const metadata: ProcessingMetadata = {
        userId,
        timestamp: new Date(),
      };

      await policy.process(entityId, llmResult, fieldMappings, metadata);

      this.logger.log(
        `✅ [GENERIC_LLM_PROCESSING] Successfully processed ${entityType} ${entityId}`,
      );
    } catch (error) {
      this.logger.error(
        `[GENERIC_LLM_PROCESSING] Error processing ${entityType} ${entityId}:`,
        error,
      );

      // Handle error using policy's error handler
      try {
        const policy = this.processingPolicyFactory.getPolicy(entityType);
        const fieldMappings = this.mergeFieldMappings(
          policy.getDefaultFieldMappings(),
          providedFieldMappings,
          statusField,
          statusValues,
        );
        const resultApplicationStrategy = policy.getResultApplicationStrategy();
        await resultApplicationStrategy.handleError(
          entityId,
          error instanceof Error ? error : new Error(String(error)),
          fieldMappings,
        );
      } catch (errorHandlerError) {
        this.logger.warn(
          `Failed to handle error for ${entityType} ${entityId}: ${errorHandlerError instanceof Error ? errorHandlerError.message : String(errorHandlerError)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Load entity by type and ID
   */
  private async loadEntity(entityType: string, entityId: string): Promise<any> {
    switch (entityType) {
      case 'post':
        return this.postRepository.findOne({
          where: { id: entityId },
        });
      case 'segment':
        return this.segmentRepository.findOne({
          where: { id: entityId },
        });
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /**
   * Merge field mappings: default from policy + provided in job data
   */
  private mergeFieldMappings(
    defaultMappings: FieldMappingConfig | null,
    providedMappings: FieldMappingConfig | undefined,
    statusField?: string,
    statusValues?: {
      pending?: any;
      processing?: any;
      completed?: any;
      error?: any;
    },
  ): FieldMappingConfig {
    const merged: FieldMappingConfig = {
      mappings: {},
      ...defaultMappings,
      ...providedMappings,
    };

    // Merge mappings (provided overrides default)
    if (defaultMappings?.mappings) {
      merged.mappings = { ...defaultMappings.mappings };
    }
    if (providedMappings?.mappings) {
      merged.mappings = { ...merged.mappings, ...providedMappings.mappings };
    }

    // Merge enum conversions
    if (defaultMappings?.enumConversions || providedMappings?.enumConversions) {
      merged.enumConversions = {
        ...defaultMappings?.enumConversions,
        ...providedMappings?.enumConversions,
      };
    }

    // Merge defaults
    if (defaultMappings?.defaults || providedMappings?.defaults) {
      merged.defaults = {
        ...defaultMappings?.defaults,
        ...providedMappings?.defaults,
      };
    }

    // Override status field and values if provided
    if (statusField) {
      merged.statusField = statusField;
    }
    if (statusValues) {
      merged.statusValues = {
        ...defaultMappings?.statusValues,
        ...providedMappings?.statusValues,
        ...statusValues,
      };
    }

    return merged;
  }
}
