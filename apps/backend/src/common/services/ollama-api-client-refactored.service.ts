import { Injectable } from '@nestjs/common';
import { RefactoredBaseLLMClient } from './refactored-base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class OllamaApiClientRefactored extends RefactoredBaseLLMClient {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'http://localhost:11434',
    apiKeyEnv: 'OLLAMA_API_KEY', // Not used but required by interface
    defaultModel: 'llama3.1:8b',
    supportsJsonSchema: false, // Ollama doesn't support native JSON schema
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

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager);
    this.initializeConfig(configService);
  }

  // Override response transformation for Ollama's different response format
  protected transformResponse(response: any): any {
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
