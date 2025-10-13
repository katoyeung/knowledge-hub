import { Injectable } from '@nestjs/common';
import { BaseLLMClient } from './base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { firstValueFrom } from 'rxjs';

interface OllamaRequest {
  model: string;
  messages: LLMMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    stop?: string[];
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

@Injectable()
export class OllamaApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'llama3.1:8b';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: configService.get<string>(
        'OLLAMA_BASE_URL',
        'http://localhost:11434',
      ),
      apiKeyEnv: 'OLLAMA_API_KEY', // Not used for Ollama but required by base class
      cacheTTL: configService.get<number>('OLLAMA_CACHE_TTL', 0) * 1000,
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

    // Check if model is available
    await this.ensureModelAvailable(model);

    const payload: OllamaRequest = {
      model,
      messages,
      stream: false,
      options: {
        temperature: temperature || 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
      },
    };

    // Add JSON schema support if provided
    if (jsonSchema) {
      payload.options = {
        ...payload.options,
        // Ollama doesn't have native JSON schema support, but we can add it to the system message
      };

      // Add JSON schema instruction to the system message
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

    const headers = {
      'Content-Type': 'application/json',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<OllamaResponse>(
          `${this.config.baseUrl}/api/chat`,
          payload,
          {
            headers,
            timeout: this.config.timeout,
          },
        ),
      );

      // Convert Ollama response to standard LLMResponse format
      const llmResponse: LLMResponse = {
        choices: [
          {
            message: {
              content: response.data.message.content,
            },
          },
        ],
        usage: {
          prompt_tokens: response.data.prompt_eval_count || 0,
          completion_tokens: response.data.eval_count || 0,
          total_tokens:
            (response.data.prompt_eval_count || 0) +
            (response.data.eval_count || 0),
        },
      };

      const apiResponse: ApiResponse<LLMResponse> = {
        data: llmResponse,
        status: 200,
        headers: response.headers as Record<string, string>,
      };

      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `Ollama API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async ensureModelAvailable(model: string): Promise<void> {
    try {
      // Check if model is available by trying to pull it
      await firstValueFrom(
        this.httpService.post(
          `${this.config.baseUrl}/api/pull`,
          { name: model },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000, // Longer timeout for model pulling
          },
        ),
      );
    } catch (error) {
      // If pull fails, try to check if model exists
      try {
        await firstValueFrom(
          this.httpService.get(`${this.config.baseUrl}/api/tags`),
        );
      } catch (checkError) {
        throw new Error(
          `Ollama service is not available. Please ensure Ollama is running on ${this.config.baseUrl}`,
        );
      }

      // If model doesn't exist, provide helpful error
      if (error.response?.status === 404) {
        throw new Error(
          `Model '${model}' not found. Please pull the model first: ollama pull ${model}`,
        );
      }

      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/api/tags`),
      );
      return response.data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      this.logger.warn(
        `Failed to get available Ollama models: ${error.message}`,
      );
      return [];
    }
  }

  async *chatCompletionStream(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): AsyncGenerator<string, void, unknown> {
    // Check if model is available
    await this.ensureModelAvailable(model);

    const payload: OllamaRequest = {
      model,
      messages,
      stream: true,
      options: {
        temperature: temperature || 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
      },
    };

    // Add JSON schema support if provided
    if (jsonSchema) {
      // Add JSON schema instruction to the system message
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

    const headers = {
      'Content-Type': 'application/json',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.config.baseUrl}/api/chat`, payload, {
          headers,
          timeout: this.config.timeout,
          responseType: 'stream',
        }),
      );

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                yield parsed.message.content;
              }
              if (parsed.done) {
                return;
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
        `Ollama streaming API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/api/tags`),
      );
      return true;
    } catch (error) {
      return false;
    }
  }
}
