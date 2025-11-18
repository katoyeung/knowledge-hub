import { Injectable } from '@nestjs/common';
import { BaseLLMClientV2 } from './base-llm-client-v2.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class PerplexityApiClient extends BaseLLMClientV2 {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'https://api.perplexity.ai',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    defaultModel: 'sonar',
    supportsJsonSchema: true, // Perplexity supports JSON schema via response_format
    supportsStructuredOutput: true,
    structuredOutputFormat: 'openai', // Perplexity uses response_format like OpenAI
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

  // Override to specify provider type
  protected getProviderType(): string {
    return 'perplexity';
  }
}
