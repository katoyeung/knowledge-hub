import { Injectable } from '@nestjs/common';
import { BaseLLMClient } from './base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';

@Injectable()
export class DashScopeApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'qwen3-max';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: configService.get<string>(
        'DASHSCOPE_BASE_URL',
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      ),
      apiKeyEnv: 'DASHSCOPE_API_KEY',
      timeout: configService.get<number>('DASHSCOPE_TIMEOUT', 30000),
      cacheTTL: configService.get<number>('DASHSCOPE_CACHE_TTL', 0) * 1000,
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): Promise<ApiResponse<LLMResponse>> {
    const cacheKey = this.getLLMCacheKey(
      messages,
      model,
      jsonSchema,
      temperature,
    );

    // Check cache first
    if (this.cacheTTL > 0) {
      const cached = await this.cacheManager.get<LLMResponse>(cacheKey);
      if (cached) {
        return {
          data: cached,
          status: 200,
          headers: {},
        };
      }
    }

    const requestBody = {
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: temperature || 0.7,
      max_tokens: 8192,
      stream: false,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    try {
      const response = await this.httpService.axiosRef.post(
        `${this.config.baseUrl}/chat/completions`,
        requestBody,
        {
          headers,
          timeout: this.config.timeout,
        },
      );

      const responseData = response.data;

      if (!responseData.choices || !responseData.choices[0]) {
        throw new Error('Invalid response format from DashScope API');
      }

      const llmResponse: LLMResponse = {
        choices: responseData.choices,
        usage: responseData.usage,
      };

      // Cache the response
      if (this.cacheTTL > 0) {
        await this.cacheManager.set(cacheKey, llmResponse, this.cacheTTL);
      }

      return {
        data: llmResponse,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      console.error(
        'DashScope API error:',
        error.response?.data || error.message,
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
    const requestBody = {
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: temperature || 0.7,
      max_tokens: 8192,
      stream: true,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    try {
      const response = await this.httpService.axiosRef.post(
        `${this.config.baseUrl}/chat/completions`,
        requestBody,
        {
          headers,
          timeout: this.config.timeout,
          responseType: 'stream',
        },
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
      console.error(
        'DashScope streaming error:',
        error.response?.data || error.message,
      );

      // If it's an HTTP error, provide more context
      if (error.response) {
        const errorMessage = `API Error (${error.response.status}): ${error.response.data?.message || error.message}`;
        throw new Error(errorMessage);
      }

      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.config.baseUrl}/models`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          timeout: 5000,
        },
      );
      return response.status === 200;
    } catch (error) {
      console.error('DashScope health check failed:', error.message);
      return false;
    }
  }
}
