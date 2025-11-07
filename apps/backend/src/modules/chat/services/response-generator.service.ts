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
  includeConversationHistory: boolean;
  conversationHistoryLimit: number;
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
      includeConversationHistory: config.includeConversationHistory,
      conversationHistoryLimit: config.conversationHistoryLimit,
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

  async generateStreamingResponse(
    query: string,
    segments: any[],
    config: ResponseGenerationConfig,
    conversationHistory: ChatMessage[] = [],
    onToken: (token: string) => void,
  ): Promise<ResponseGenerationResult> {
    this.logger.log(
      `🤖 Generating streaming response using AI provider ${config.provider.type}`,
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

    // Build conversation history
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

    // Create LLM client and generate streaming response
    const llmClient = this.llmClientFactory.createClient(config.provider);

    let fullContent = '';
    let tokensUsed = 0;

    // Check if the client supports streaming
    if (llmClient.chatCompletionStream) {
      try {
        for await (const token of llmClient.chatCompletionStream(
          messages,
          config.model,
          undefined,
          config.temperature,
        )) {
          fullContent += token;
          onToken(token);
        }
      } catch (error) {
        this.logger.error(
          'Streaming failed, falling back to regular completion',
          error,
        );
        // Fallback to regular completion
        const response = await llmClient.chatCompletion(
          messages,
          config.model,
          undefined,
          config.temperature,
        );
        fullContent = response.data.choices[0].message.content;
        tokensUsed = response.data.usage?.total_tokens || 0;
      }
    } else {
      // Fallback to regular completion if streaming not supported
      this.logger.warn('Streaming not supported, using regular completion');
      const response = await llmClient.chatCompletion(
        messages,
        config.model,
        undefined,
        config.temperature,
      );
      fullContent = response.data.choices[0].message.content;
      tokensUsed = response.data.usage?.total_tokens || 0;

      // Simulate streaming by sending chunks
      const words = fullContent.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i];
        onToken(chunk);
        // Small delay to simulate streaming
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    this.debugLogger.logResponseGeneration('response-generated', {
      responseLength: fullContent.length,
      tokensUsed,
    });

    // Clear messages array from memory after use
    messages.length = 0;

    return {
      content: fullContent,
      tokensUsed,
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
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load prompt ${config.promptId}: ${error.message}`,
        );
      }
    }

    // Add system message first (if not using custom user prompt template)
    if (
      !config.promptId ||
      !(await this.promptService.findPromptById(config.promptId))
        ?.userPromptTemplate
    ) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add conversation history only if enabled (limit based on config to avoid token limits)
    if (config.includeConversationHistory) {
      const historyLimit = config.conversationHistoryLimit || 10;
      const recentHistory = conversationHistory.slice(-historyLimit);
      this.logger.debug(
        `📚 Including conversation history: ${recentHistory.length} messages (limit: ${historyLimit})`,
      );
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    } else {
      this.logger.debug(
        '📚 Conversation history disabled - not including previous messages',
      );
    }

    // Handle custom user prompt template if specified
    if (config.promptId) {
      try {
        const prompt = await this.promptService.findPromptById(config.promptId);
        if (prompt?.userPromptTemplate) {
          const userPrompt = prompt.userPromptTemplate
            .replace(/\{\{context\}\}/g, context)
            .replace(/\{context\}/g, context)
            .replace(/\{\{question\}\}/g, query)
            .replace(/\{query\}/g, query);

          messages.push({
            role: 'user',
            content: userPrompt,
          });
          return messages; // Return early if using custom user prompt
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load prompt ${config.promptId}: ${error.message}`,
        );
      }
    }

    // Always add the current user query as the last message
    messages.push({
      role: 'user',
      content: query,
    });

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
