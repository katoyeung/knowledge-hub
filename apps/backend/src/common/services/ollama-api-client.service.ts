import { Injectable } from '@nestjs/common';
import { BaseLLMClientV2 } from './base-llm-client-v2.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class OllamaApiClient extends BaseLLMClientV2 {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'OLLAMA_BASE_URL', // Environment variable name, not the actual URL
    apiKeyEnv: 'OLLAMA_API_KEY', // Not used but required by interface
    defaultModel: undefined, // No default model - must be provided
    supportsJsonSchema: false, // Ollama doesn't support native JSON schema
    supportsStructuredOutput: true, // Ollama supports structured output via format field
    structuredOutputFormat: 'ollama', // Use Ollama's format field
    streamingFormat: 'json', // Ollama uses different streaming format
    requestPath: '/api/chat', // Different endpoint
    responseTransform: {
      choicesPath: 'message',
      usagePath: 'prompt_eval_count',
      contentPath: 'content',
    },
    streamTransform: {
      contentPath: 'message.content',
    },
  };

  // Override to use correct endpoint based on baseUrl
  protected getRequestPath(): string {
    const baseUrl = this.config.baseUrl;

    // If baseUrl contains 'crumplete.dev', use OpenAI-compatible endpoint
    if (baseUrl && baseUrl.includes('crumplete.dev')) {
      return '/chat/completions';
    }

    // Default Ollama endpoint
    return '/api/chat';
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.config.baseUrl}/api/tags`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );
      return response.status === 200;
    } catch (error) {
      console.error('Ollama health check failed:', error.message);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.config.baseUrl}/api/tags`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );

      if (response.data && response.data.models) {
        return response.data.models.map((model: any) => model.name);
      }
      return [];
    } catch (error) {
      console.error('Failed to get Ollama models:', error.message);
      return [];
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

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager);
    this.initializeConfig(configService);

    // Auto-detect API format based on baseUrl
    const baseUrl = this.config.baseUrl;
    if (baseUrl) {
      // If baseUrl contains common OpenAI-compatible API patterns, use OpenAI format
      if (
        baseUrl.includes('openai.com') ||
        baseUrl.includes('api.openai.com') ||
        baseUrl.includes('crumplete.dev') ||
        baseUrl.includes('chat/completions') ||
        baseUrl.includes('/v1/')
      ) {
        this.providerConfig.requestPath = '/chat/completions';
        this.logger.log(
          `🔧 Detected OpenAI-compatible API, using endpoint: ${baseUrl}${this.providerConfig.requestPath}`,
        );
      } else {
        this.logger.log(
          `🔧 Using Ollama API endpoint: ${baseUrl}${this.providerConfig.requestPath}`,
        );
      }
    }
  }

  // Override to specify provider type
  protected getProviderType(): string {
    return 'ollama';
  }

  // Override response transformation for different response formats
  protected transformResponse(response: any): any {
    const baseUrl = this.config.baseUrl;

    // Auto-detect response format based on baseUrl or response structure
    const isOpenAIFormat =
      (baseUrl &&
        (baseUrl.includes('openai.com') ||
          baseUrl.includes('api.openai.com') ||
          baseUrl.includes('crumplete.dev') ||
          baseUrl.includes('chat/completions') ||
          baseUrl.includes('/v1/'))) ||
      response.data.choices; // Also check if response has OpenAI structure

    if (isOpenAIFormat) {
      // OpenAI-compatible API format
      this.logger.debug(`🔧 Using OpenAI-compatible response format`);
      return {
        data: {
          choices: response.data.choices || [],
          usage: response.data.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        },
        status: 200,
        headers: response.headers as Record<string, string>,
      };
    }

    // Default Ollama format
    this.logger.debug(`🔧 Using Ollama response format`);
    return {
      data: {
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
      },
      status: 200,
      headers: response.headers as Record<string, string>,
    };
  }
}
