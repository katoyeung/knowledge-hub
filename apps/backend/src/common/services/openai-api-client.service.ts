import { Injectable, Optional } from '@nestjs/common';
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
    @Optional() customBaseUrl?: string,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: customBaseUrl || 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): Promise<ApiResponse<LLMResponse>> {
    const payload = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: false,
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

  async *chatCompletionStream(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): AsyncGenerator<string, void, unknown> {
    const payload = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: true,
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
        this.httpService.post(
          `${this.config.baseUrl}/chat/completions`,
          payload,
          {
            headers,
            timeout: this.config.timeout,
            responseType: 'stream',
          },
        ),
      );

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `OpenAI streaming API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
