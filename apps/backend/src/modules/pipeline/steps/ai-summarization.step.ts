import { Injectable } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { AiProviderService } from '../../ai-provider/services/ai-provider.service';
import { LLMClientFactory } from '../../ai-provider/services/llm-client-factory.service';

export interface AiSummarizationConfig extends StepConfig {
  aiProviderId: string;
  model: string;
  maxLength: number;
  minLength?: number;
  condition?: string; // JavaScript expression for when to summarize
  temperature?: number;
  promptTemplate?: string;
  preserveOriginal?: boolean; // Whether to keep original content alongside summary
  batchSize?: number;
  timeout?: number;
}

@Injectable()
export class AiSummarizationStep extends BaseStep {
  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly llmClientFactory: LLMClientFactory,
  ) {
    super('ai_summarization', 'AI-Powered Content Summarization');
  }

  /**
   * Main execution logic - AI summarization
   */
  protected async executeStep(
    _inputSegments: DocumentSegment[],
    _config: AiSummarizationConfig,
    _context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    // TODO: Migrate logic from execute() method
    // For now, return empty to satisfy abstract requirement
    this.logger.warn('executeStep() not yet migrated - using old execute()');
    return [];
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: AiSummarizationConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting AI summarization for ${inputSegments.length} segments`,
    );

    try {
      const outputSegments: DocumentSegment[] = [];
      let segmentsProcessed = 0;
      let segmentsSummarized = 0;
      let segmentsSkipped = 0;
      let totalTokensUsed = 0;

      // Filter segments that need summarization
      const segmentsToSummarize = inputSegments.filter((segment) =>
        this.shouldSummarize(segment, config),
      );

      this.logger.log(
        `Found ${segmentsToSummarize.length} segments eligible for summarization`,
      );

      // Process segments in batches
      const batchSize = config.batchSize || 5;
      const batches = this.createBatches(segmentsToSummarize, batchSize);

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map((segment) =>
            this.summarizeSegment(segment, config, context),
          ),
        );

        for (let i = 0; i < batch.length; i++) {
          const segment = batch[i];
          const result = batchResults[i];
          segmentsProcessed++;

          if (result.success) {
            segmentsSummarized++;
            totalTokensUsed += result.tokensUsed || 0;

            if (result.summarizedSegment) {
              if (config.preserveOriginal) {
                // Keep original segment and add summary as new segment
                outputSegments.push(segment);
                outputSegments.push(result.summarizedSegment);
              } else {
                // Replace original segment with summarized version
                outputSegments.push(result.summarizedSegment);
              }
            } else {
              // Keep original segment if no summary was generated
              outputSegments.push(segment);
            }
          } else {
            segmentsSkipped++;
            this.logger.warn(
              `Failed to summarize segment ${segment.id}: ${result.error}`,
            );
            // Keep original segment if summarization fails
            outputSegments.push(segment);
          }
        }

        // Add small delay between batches to prevent rate limiting
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Add segments that didn't need summarization
      const segmentsNotSummarized = inputSegments.filter(
        (segment) => !this.shouldSummarize(segment, config),
      );
      outputSegments.push(...segmentsNotSummarized);

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        outputSegments,
        startTime,
        endTime,
      );

      // Add specific metrics for summarization
      metrics.segmentsProcessed = segmentsProcessed;
      metrics.segmentsSummarized = segmentsSummarized;
      metrics.segmentsSkipped = segmentsSkipped;
      metrics.totalTokensUsed = totalTokensUsed;
      metrics.summarizationRate =
        inputSegments.length > 0
          ? segmentsSummarized / inputSegments.length
          : 0;

      this.logger.log(
        `AI summarization completed: ${segmentsSummarized} summarized, ${segmentsSkipped} skipped`,
      );

      return {
        success: true,
        outputSegments,
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      this.logger.error('AI summarization failed:', error);
      return {
        success: false,
        outputSegments: inputSegments, // Return original segments on error
        metrics: this.calculateMetrics(
          inputSegments,
          inputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    }
  }

  async validate(
    config: AiSummarizationConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.aiProviderId) {
      errors.push('AI provider ID is required');
    }

    if (!config.model) {
      errors.push('Model is required');
    }

    if (!config.maxLength || config.maxLength <= 0) {
      errors.push('Maximum length must be a positive number');
    }

    if (config.minLength !== undefined && config.minLength < 0) {
      errors.push('Minimum length must be non-negative');
    }

    if (
      config.minLength !== undefined &&
      config.maxLength !== undefined &&
      config.minLength > config.maxLength
    ) {
      errors.push('Minimum length cannot be greater than maximum length');
    }

    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (config.batchSize !== undefined && config.batchSize <= 0) {
      errors.push('Batch size must be a positive number');
    }

    if (config.timeout !== undefined && config.timeout <= 0) {
      errors.push('Timeout must be a positive number');
    }

    // Validate AI provider exists
    if (config.aiProviderId) {
      try {
        const provider = await this.aiProviderService.findOne({
          where: { id: config.aiProviderId },
        });
        if (!provider) {
          errors.push(`AI provider not found: ${config.aiProviderId}`);
        }
      } catch (error) {
        errors.push(`Error validating AI provider: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log('Rolling back AI summarization step');
      // For summarization, rollback is typically not needed as we don't modify the database
      // The original segments are preserved in rollbackData
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'ai_summarization',
      name: 'AI-Powered Content Summarization',
      description: 'Summarize long content using AI/LLM providers',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          aiProviderId: {
            type: 'string',
            description: 'ID of the AI provider to use',
          },
          model: {
            type: 'string',
            description: 'Model name to use for summarization',
          },
          maxLength: {
            type: 'number',
            minimum: 1,
            description: 'Maximum length of the summary',
          },
          minLength: {
            type: 'number',
            minimum: 0,
            description: 'Minimum length of the summary',
          },
          condition: {
            type: 'string',
            description:
              'JavaScript expression for when to summarize (e.g., "segment.wordCount > 1000")',
          },
          temperature: {
            type: 'number',
            minimum: 0,
            maximum: 2,
            description: 'Temperature for text generation',
          },
          promptTemplate: {
            type: 'string',
            description: 'Custom prompt template for summarization',
          },
          preserveOriginal: {
            type: 'boolean',
            default: false,
            description: 'Whether to keep original content alongside summary',
          },
          batchSize: {
            type: 'number',
            minimum: 1,
            default: 5,
            description: 'Number of segments to process in parallel',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            description:
              'Timeout in milliseconds for each summarization request',
          },
        },
        required: ['aiProviderId', 'model', 'maxLength'],
      },
    };
  }

  private shouldSummarize(
    segment: DocumentSegment,
    config: AiSummarizationConfig,
  ): boolean {
    // Check minimum length condition
    if (
      config.minLength !== undefined &&
      segment.content.length < config.minLength
    ) {
      return false;
    }

    // Check maximum length condition
    if (
      config.maxLength !== undefined &&
      segment.content.length <= config.maxLength
    ) {
      return false;
    }

    // Check custom condition
    if (config.condition) {
      try {
        // Create a safe evaluation context
        const context = {
          segment: {
            id: segment.id,
            content: segment.content,
            wordCount: segment.wordCount,
            tokens: segment.tokens,
            position: segment.position,
          },
        };

        // Simple evaluation - in production, use a proper expression evaluator
        const result = eval(`(${config.condition})`);
        return Boolean(result);
      } catch (error) {
        this.logger.warn(`Error evaluating condition: ${error.message}`);
        return false;
      }
    }

    return true;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async summarizeSegment(
    segment: DocumentSegment,
    config: AiSummarizationConfig,
    context: StepExecutionContext,
  ): Promise<{
    success: boolean;
    summarizedSegment?: DocumentSegment;
    tokensUsed?: number;
    error?: string;
  }> {
    try {
      // Get AI provider
      const provider = await this.aiProviderService.findOne({
        where: { id: config.aiProviderId },
      });
      if (!provider) {
        throw new Error(`AI provider not found: ${config.aiProviderId}`);
      }

      // Create LLM client
      const client = this.llmClientFactory.createClient(provider);

      // Create prompt
      const prompt = this.createSummarizationPrompt(segment.content, config);

      // Generate summary
      const response = await client.chatCompletion(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        config.model,
        undefined,
        config.temperature || 0.7,
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        throw new Error('No summary generated');
      }

      const summaryText = response.data.choices[0].message.content.trim();

      // Create summarized segment
      const summarizedSegment = new DocumentSegment();
      summarizedSegment.id = `${segment.id}_summary`;
      summarizedSegment.content = summaryText;
      summarizedSegment.wordCount = summaryText.split(/\s+/).length;
      summarizedSegment.tokens =
        response.data?.usage?.total_tokens || Math.ceil(summaryText.length / 4);
      summarizedSegment.position = segment.position;
      summarizedSegment.documentId = segment.documentId;
      summarizedSegment.datasetId = segment.datasetId;
      summarizedSegment.status = 'waiting';

      return {
        success: true,
        summarizedSegment,
        tokensUsed: response.data?.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to summarize segment ${segment.id}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private createSummarizationPrompt(
    content: string,
    config: AiSummarizationConfig,
  ): string {
    if (config.promptTemplate) {
      return config.promptTemplate.replace('{{content}}', content);
    }

    return `Please summarize the following text in no more than ${config.maxLength} characters while preserving the key information and main points:

${content}

Summary:`;
  }
}
