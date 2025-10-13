import { Injectable, Logger } from '@nestjs/common';
import { LLMMessage } from '../../../common/interfaces/llm-client.interface';
import { PromptService } from '../../prompts/services/prompt.service';
import { LLMClientFactory } from '../../ai-provider/services/llm-client-factory.service';
import { DebugLogger } from '../../../common/services/debug-logger.service';
import { ChatMessage } from '../entities/chat-message.entity';

export interface ResponseGenerationConfig {
  provider: any;
  model: string;
  temperature: number;
  promptId?: string;
}

export interface ResponseGenerationResult {
  content: string;
  tokensUsed?: number;
  model: string;
}

@Injectable()
export class ResponseGeneratorService {
  private readonly logger = new Logger(ResponseGeneratorService.name);

  constructor(
    private readonly promptService: PromptService,
    private readonly llmClientFactory: LLMClientFactory,
    private readonly debugLogger: DebugLogger,
  ) {}

  async generateResponse(
    query: string,
    segments: any[],
    config: ResponseGenerationConfig,
    conversationHistory: ChatMessage[] = [],
  ): Promise<ResponseGenerationResult> {
    this.logger.log(
      `🤖 Generating response using AI provider ${config.provider.type}`,
    );

    this.debugLogger.logResponseGeneration('start', {
      provider: config.provider.type,
      model: config.model,
      segmentsCount: segments.length,
      conversationHistoryLength: conversationHistory.length,
    });

    // Validate model exists in provider's model list
    const modelExists = this.llmClientFactory.validateModelAvailability(
      config.provider,
      config.model,
    );
    if (!modelExists) {
      throw new Error(
        `Model ${config.model} is not available for provider ${config.provider.name}. Available models: ${config.provider.models?.map((m: any) => m.id).join(', ') || 'none'}`,
      );
    }

    // Build context from segments
    const context = this.buildContextFromSegments(segments);

    this.debugLogger.logResponseGeneration('context-built', {
      contextLength: context.length,
      contextPreview: context.substring(0, 200),
    });

    // Build conversation history - Add history BEFORE the current question
    const messages: LLMMessage[] = await this.buildConversationHistory(
      conversationHistory,
      query,
      context,
      config,
    );

    this.debugLogger.logResponseGeneration('messages-built', {
      messagesCount: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        contentLength: m.content.length,
      })),
    });

    // Create LLM client and generate response
    const llmClient = this.llmClientFactory.createClient(config.provider);

    // Generate response using the provided LLM client
    const response = await llmClient.chatCompletion(
      messages,
      config.model,
      undefined,
      config.temperature,
    );

    this.debugLogger.logResponseGeneration('response-generated', {
      responseLength: response.data.choices[0].message.content.length,
      tokensUsed: response.data.usage?.total_tokens,
    });

    return {
      content: response.data.choices[0].message.content,
      tokensUsed: response.data.usage?.total_tokens,
      model: config.model,
    };
  }

  private buildContextFromSegments(segments: any[]): string {
    return segments
      .map((segment, index) => `[${index + 1}] ${segment.content}`)
      .join('\n\n');
  }

  private async buildConversationHistory(
    conversationHistory: ChatMessage[],
    query: string,
    context: string,
    config: ResponseGenerationConfig,
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // Add conversation history (last 10 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Load prompt template if specified
    let systemPrompt = this.getDefaultSystemPrompt(context, query);

    if (config.promptId) {
      try {
        const prompt = await this.promptService.findPromptById(config.promptId);
        if (prompt) {
          // Use custom prompt template
          systemPrompt = prompt.systemPrompt;

          // Replace placeholders in the prompt (support both single and double curly braces)
          systemPrompt = systemPrompt.replace(/\{\{context\}\}/g, context);
          systemPrompt = systemPrompt.replace(/\{context\}/g, context);
          systemPrompt = systemPrompt.replace(/\{\{question\}\}/g, query);
          systemPrompt = systemPrompt.replace(/\{query\}/g, query);

          // If there's a user prompt template, use it for the user message
          if (prompt.userPromptTemplate) {
            const userPrompt = prompt.userPromptTemplate
              .replace(/\{\{context\}\}/g, context)
              .replace(/\{context\}/g, context)
              .replace(/\{\{question\}\}/g, query)
              .replace(/\{query\}/g, query);

            messages.push({
              role: 'system',
              content: systemPrompt,
            });

            messages.push({
              role: 'user',
              content: userPrompt,
            });
          } else {
            messages.push({
              role: 'system',
              content: systemPrompt,
            });
          }
        } else {
          // Fallback to default if prompt not found
          messages.push({
            role: 'system',
            content: systemPrompt,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load prompt ${config.promptId}: ${error.message}`,
        );
        // Fallback to default
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }
    } else {
      // Use default prompt
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    return messages;
  }

  private getDefaultSystemPrompt(context: string, query: string): string {
    return `You are a helpful assistant that answers questions based on the provided context.

INSTRUCTIONS:
- First, try to answer using information from the provided context
- If the answer is not available in the context, you may use your general knowledge
- Always indicate whether your answer comes from the context or general knowledge
- Prioritize accuracy - it's better to give a correct answer than to say "not available"
- Be specific and concise in your answers
- When using general knowledge, ensure it's relevant to the question topic

Context:
${context}

Question: ${query}
Answer:`;
  }
}
