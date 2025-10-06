import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseLLMClient } from './base-llm-client.service';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { firstValueFrom } from 'rxjs';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: {
    type: string;
    json_schema?: Record<string, any>;
  };
}

@Injectable()
export class OpenRouterApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'perplexity/sonar';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      cacheTTL: configService.get<number>('OPENROUTER_CACHE_TTL', 0) * 1000,
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

    const payload: OpenRouterRequest = {
      model,
      messages,
    };

    if (jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: jsonSchema,
      };
    }

    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<LLMResponse>(
          `${this.config.baseUrl}/chat/completions`,
          payload,
          {
            headers,
            timeout: this.config.timeout,
          },
        ),
      );

      const apiResponse: ApiResponse<LLMResponse> = {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };

      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `OpenRouter API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      // Test with a simple request to check if the service is available
      const response = await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Short timeout for health check
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`OpenRouter service unavailable: ${error.message}`);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }),
      );

      if (response.data && response.data.data) {
        return response.data.data.map((model: any) => model.id).slice(0, 10); // Return first 10 models
      }
      return [];
    } catch (error) {
      this.logger.error(`Failed to get OpenRouter models: ${error.message}`);
      return [];
    }
  }

  async healthCheck(): Promise<{ status: string; models: string[] }> {
    const isAvailable = await this.isServiceAvailable();
    const models = isAvailable ? await this.getAvailableModels() : [];

    return {
      status: isAvailable ? 'healthy' : 'unhealthy',
      models,
    };
  }
}
