import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { ApiResponse } from '../interfaces/api-client.interface';

// Lazy import for Xenova Transformers to avoid loading issues
let XenovaTransformers: any = null;

export interface LocalLLMResult {
  content: string;
  model: string;
  tokensUsed?: number;
  responseTime?: number;
}

@Injectable()
export class LocalLLMService {
  private readonly logger = new Logger(LocalLLMService.name);
  private transformersLoaded = false;
  private modelCache: Map<string, any> = new Map();
  private responseCache: Map<string, LocalLLMResult> = new Map();

  private async loadTransformers() {
    if (!this.transformersLoaded) {
      try {
        // Dynamic import to avoid build-time issues
        XenovaTransformers = await eval('import("@xenova/transformers")');
        this.transformersLoaded = true;
        this.logger.log('✅ Xenova Transformers loaded successfully');
      } catch (error) {
        this.logger.error(
          '❌ Failed to load Xenova Transformers:',
          error.message,
        );
        throw error;
      }
    }
  }

  async generateResponse(
    messages: LLMMessage[],
    model: string,
    temperature: number = 0.7,
    maxTokens: number = 1000,
  ): Promise<ApiResponse<LLMResponse>> {
    const startTime = Date.now();

    try {
      // Create cache key based on messages and model
      const cacheKey = this.createCacheKey(
        messages,
        model,
        temperature,
        maxTokens,
      );

      // Check if response is already cached
      const cachedResponse = this.responseCache.get(cacheKey);
      if (cachedResponse) {
        this.logger.log(`♻️ Using cached response for model: ${model}`);
        return this.formatApiResponse(cachedResponse, 200);
      }

      this.logger.log(`🔄 Generating response with local model: ${model}`);

      const result = await this.generateLocalResponse(
        messages,
        model,
        temperature,
        maxTokens,
      );

      const responseTime = Date.now() - startTime;
      result.responseTime = responseTime;

      // Cache the result
      this.responseCache.set(cacheKey, result);
      this.logger.log(`💾 Cached response for future use`);

      return this.formatApiResponse(result, 200);
    } catch (error) {
      this.logger.error(
        `❌ Failed to generate response: ${error.message}`,
        error.stack,
      );
      throw new Error(`Local LLM generation failed: ${error.message}`);
    }
  }

  private async generateLocalResponse(
    messages: LLMMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<LocalLLMResult> {
    this.logger.log(`🏠 Generating local response with model: ${model}`);

    await this.loadTransformers();

    // Check if model is already cached
    let pipeline = this.modelCache.get(model);
    if (!pipeline) {
      this.logger.log(`🤖 Loading model: ${model}`);

      // Load the text generation pipeline
      pipeline = await XenovaTransformers.pipeline('text-generation', model, {
        quantized: true, // Use quantized models for better performance
      });

      // Cache the model for future use
      this.modelCache.set(model, pipeline);
      this.logger.log(`✅ Model ${model} cached for future use`);
    } else {
      this.logger.log(`♻️ Using cached model: ${model}`);
    }

    this.logger.log(`📊 Processing messages with local model...`);

    // Convert messages to text format for the model
    const prompt = this.formatMessagesForModel(messages);

    // Generate response
    const output = await pipeline(prompt, {
      max_new_tokens: maxTokens,
      temperature: temperature,
      do_sample: temperature > 0,
      pad_token_id: pipeline.tokenizer.eos_token_id,
      eos_token_id: pipeline.tokenizer.eos_token_id,
    });

    // Extract the generated text
    const generatedText = output[0].generated_text;

    // Remove the original prompt from the response
    const response = generatedText.replace(prompt, '').trim();

    const result: LocalLLMResult = {
      content: response,
      model: model,
      tokensUsed: this.estimateTokens(prompt + response),
    };

    this.logger.log(
      `✅ Successfully generated local response: ${result.tokensUsed} tokens`,
    );
    return result;
  }

  private formatMessagesForModel(messages: LLMMessage[]): string {
    // Convert messages to a format suitable for the local model
    // This is a simple implementation - you might want to customize based on the model
    return (
      messages
        .map((msg) => {
          switch (msg.role) {
            case 'system':
              return `System: ${msg.content}`;
            case 'user':
              return `Human: ${msg.content}`;
            case 'assistant':
              return `Assistant: ${msg.content}`;
            default:
              return msg.content;
          }
        })
        .join('\n\n') + '\n\nAssistant:'
    );
  }

  private formatApiResponse(
    result: LocalLLMResult,
    status: number,
  ): ApiResponse<LLMResponse> {
    return {
      data: {
        choices: [
          {
            message: {
              content: result.content,
            },
          },
        ],
        usage: {
          prompt_tokens: 0, // We don't have exact token counts from local models
          completion_tokens: result.tokensUsed || 0,
          total_tokens: result.tokensUsed || 0,
        },
      },
      status,
      headers: {},
    };
  }

  private createCacheKey(
    messages: LLMMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
  ): string {
    const messagesText = messages
      .map((m) => `${m.role}:${m.content}`)
      .join('|');
    const textHash = this.simpleHash(messagesText);
    return `${model}:${textHash}:${temperature}:${maxTokens}`;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    if (text.length === 0) return hash.toString();
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get available local models
   */
  getAvailableModels(): string[] {
    return Array.from(this.modelCache.keys());
  }

  /**
   * Clear model cache
   */
  clearModelCache(): void {
    this.modelCache.clear();
    this.logger.log('🧹 Model cache cleared');
  }

  /**
   * Clear response cache
   */
  clearResponseCache(): void {
    this.responseCache.clear();
    this.logger.log('🧹 Response cache cleared');
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.clearModelCache();
    this.clearResponseCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    modelCacheSize: number;
    responseCacheSize: number;
    transformersLoaded: boolean;
  } {
    return {
      modelCacheSize: this.modelCache.size,
      responseCacheSize: this.responseCache.size,
      transformersLoaded: this.transformersLoaded,
    };
  }
}
