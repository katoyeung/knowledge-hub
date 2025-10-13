import { Injectable } from '@nestjs/common';
import { RefactoredBaseLLMClient } from './refactored-base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class OpenAIApiClientRefactored extends RefactoredBaseLLMClient {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4',
    supportsJsonSchema: true, // OpenAI supports native JSON schema
    streamingFormat: 'sse',
    streamTransform: {
      contentPath: 'choices[0].delta.content',
      doneSignal: '[DONE]',
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

  // That's it! All the common logic is inherited from the base class
}
