import { Injectable } from '@nestjs/common';
import { BaseLLMClient } from './base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { LocalLLMService } from './local-llm.service';

@Injectable()
export class LocalLLMClient extends BaseLLMClient {
  protected readonly defaultModel = 'microsoft/DialoGPT-medium';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
    private readonly localLLMService: LocalLLMService,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: 'http://localhost:8000', // Not used for local models
      apiKeyEnv: 'LOCAL_LLM_API_KEY', // Not used for local models
      cacheTTL: configService.get<number>('LOCAL_LLM_CACHE_TTL', 0) * 1000,
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
  ): Promise<ApiResponse<LLMResponse>> {
    const cacheKey = this.getLLMCacheKey(messages, model, jsonSchema);

    const cachedResponse = await this.getCachedResponse<LLMResponse>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Add JSON schema support if provided
    if (jsonSchema) {
      const systemMessage = messages.find((m) => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += `\n\nIMPORTANT: You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`;
      } else {
        messages.unshift({
          role: 'system',
          content: `You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`,
        });
      }
    }

    try {
      // Use the local LLM service to generate response
      const response = await this.localLLMService.generateResponse(
        messages,
        model,
        0.7, // temperature
        1000, // max tokens
      );

      await this.setCachedResponse(cacheKey, response);

      return response;
    } catch (error) {
      this.logger.error(
        `Local LLM generation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return this.localLLMService.getAvailableModels();
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      // Check if transformers are loaded
      return this.localLLMService.getCacheStats().transformersLoaded;
    } catch (error) {
      return false;
    }
  }

  async healthCheck(): Promise<{ status: string; models: string[] }> {
    try {
      const isAvailable = await this.isServiceAvailable();
      const models = isAvailable ? await this.getAvailableModels() : [];

      return {
        status: isAvailable ? 'healthy' : 'unhealthy',
        models,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        models: [],
      };
    }
  }
}
