import { Injectable } from '@nestjs/common';
import { RefactoredBaseLLMClient } from './refactored-base-llm-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class PerplexityApiClientRefactored extends RefactoredBaseLLMClient {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'https://api.perplexity.ai',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    defaultModel: 'sonar',
    supportsJsonSchema: false, // Perplexity doesn't support native JSON schema
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
  // Only provider-specific overrides go here if needed
}
