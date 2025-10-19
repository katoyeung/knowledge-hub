import { Injectable } from '@nestjs/common';
import { BaseLLMClientV2 } from './base-llm-client-v2.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class OpenAIApiClient extends BaseLLMClientV2 {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4',
    supportsJsonSchema: true, // OpenAI supports native JSON schema
    supportsStructuredOutput: true, // OpenAI supports structured output
    structuredOutputFormat: 'openai', // Use OpenAI's native format
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
    return 'openai';
  }
}
