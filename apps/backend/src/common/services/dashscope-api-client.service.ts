import { Injectable } from '@nestjs/common';
import { BaseLLMClientV2 } from './base-llm-client-v2.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';

@Injectable()
export class DashScopeApiClient extends BaseLLMClientV2 {
  protected readonly providerConfig: LLMProviderConfig = {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    defaultModel: 'qwen3-max',
    supportsJsonSchema: false, // DashScope doesn't support native JSON schema
    supportsStructuredOutput: true, // DashScope supports structured output via system message
    structuredOutputFormat: 'custom', // Use custom format for system message injection
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

  // Override to use DashScope's specific base URL configuration
  protected initializeConfig(configService: ConfigService): void {
    this.config.baseUrl =
      configService.get<string>('DASHSCOPE_BASE_URL') ||
      this.providerConfig.baseUrl;
    this.config.apiKey =
      configService.get<string>(this.providerConfig.apiKeyEnv) || '';
    this.cacheTTL =
      configService.get<number>(
        `${this.providerConfig.apiKeyEnv}_CACHE_TTL`,
        0,
      ) * 1000;
  }

  // Override to specify provider type
  protected getProviderType(): string {
    return 'dashscope';
  }

  // Override custom structured output format for DashScope
  protected addCustomStructuredOutputFormat(
    payload: any,
    jsonSchema: Record<string, any>,
  ): void {
    // DashScope uses system message injection for structured output
    this.injectJsonSchema(payload.messages, jsonSchema);
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
