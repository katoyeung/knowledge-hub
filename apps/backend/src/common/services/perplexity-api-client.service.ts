import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { BaseLLMClient } from './base-llm-client.service';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { ApiResponse } from '../interfaces/api-client.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PerplexityApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'sonar';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: 'https://api.perplexity.ai',
      apiKeyEnv: 'PERPLEXITY_API_KEY',
      cacheTTL: configService.get<number>('PERPLEXITY_CACHE_TTL', 0) * 1000, // Set to 0 for never expire
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
  ): Promise<ApiResponse<LLMResponse>> {
    const cacheKey = this.getLLMCacheKey(messages, model, jsonSchema);

    // Try to get from cache first
    const cachedResponse = await this.getCachedResponse<LLMResponse>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const payload = {
      model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: jsonSchema,
        },
      },
    };

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

      // Cache the response
      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `Perplexity API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
