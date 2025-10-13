import { Injectable } from '@nestjs/common';
import { BaseLLMClient } from './base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { firstValueFrom } from 'rxjs';

interface LocalModelRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LocalModelResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class LocalModelApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'google/gemma-2-9b-it:free';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: configService.get<string>(
        'LOCAL_MODEL_BASE_URL',
        'http://localhost:8000',
      ),
      apiKeyEnv: 'LOCAL_MODEL_API_KEY',
      cacheTTL: configService.get<number>('LOCAL_MODEL_CACHE_TTL', 0) * 1000,
    });
  }

  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): Promise<ApiResponse<LLMResponse>> {
    const cacheKey = this.getLLMCacheKey(messages, model, jsonSchema);

    const cachedResponse = await this.getCachedResponse<LLMResponse>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const payload: LocalModelRequest = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: false,
    };

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if available
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<LocalModelResponse>(
          `${this.config.baseUrl}/v1/chat/completions`,
          payload,
          {
            headers,
            timeout: this.config.timeout,
          },
        ),
      );

      const apiResponse: ApiResponse<LLMResponse> = {
        data: {
          choices: response.data.choices.map((choice) => ({
            message: {
              content: choice.message.content,
            },
          })),
          usage: response.data.usage,
        },
        status: response.status,
        headers: response.headers as Record<string, string>,
      };

      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `Local Model API request failed: ${error.message}`,
        error.stack,
      );

      // Provide helpful error messages for common issues
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `Local model service is not available at ${this.config.baseUrl}. Please ensure your local model server is running.`,
        );
      }

      if (error.response?.status === 404) {
        throw new Error(
          `Model '${model}' not found. Please ensure the model is available on your local server.`,
        );
      }

      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/v1/models`, {
          headers,
        }),
      );

      return response.data.data?.map((model: any) => model.id) || [];
    } catch (error) {
      this.logger.warn(
        `Failed to get available local models: ${error.message}`,
      );
      return [];
    }
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/v1/models`, {
          headers,
        }),
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async *chatCompletionStream(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): AsyncGenerator<string, void, unknown> {
    const payload: LocalModelRequest = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: true,
    };

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if available
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.baseUrl}/v1/chat/completions`,
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
        `Local Model streaming API request failed: ${error.message}`,
        error.stack,
      );

      // Provide helpful error messages for common issues
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `Local model service is not available at ${this.config.baseUrl}. Please ensure your local model server is running.`,
        );
      }

      if (error.response?.status === 404) {
        throw new Error(
          `Model '${model}' not found. Please ensure the model is available on your local server.`,
        );
      }

      throw error;
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
