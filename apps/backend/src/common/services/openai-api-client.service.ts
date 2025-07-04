import { Injectable } from '@nestjs/common';
import { BaseLLMClient } from './base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OpenAIApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'gpt-4';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
  ): Promise<ApiResponse<LLMResponse>> {
    const payload = {
      model,
      messages,
      ...(jsonSchema && {
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema,
        },
      }),
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

      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(
        `OpenAI API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
