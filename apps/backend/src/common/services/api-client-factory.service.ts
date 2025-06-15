import { Injectable } from '@nestjs/common';
import { ApiClient } from '../interfaces/api-client.interface';
import { OpenRouterApiClient } from './openrouter-api-client.service';
import { OpenAIApiClient } from './openai-api-client.service';
import { LLMClient } from '../interfaces/llm-client.interface';
import { PerplexityApiClient } from './perplexity-api-client.service';

export enum ApiClientType {
  EODHD = 'eodhd',
  OPENROUTER = 'openrouter',
  PERPLEXITY = 'perplexity',
}

export enum LLMProvider {
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
  PERPLEXITY = 'perplexity',
}

@Injectable()
export class ApiClientFactory {
  constructor(
    private readonly openRouterClient: OpenRouterApiClient,
    private readonly openAIClient: OpenAIApiClient,
    private readonly perplexityClient: PerplexityApiClient,
  ) {}

  getClient(type: ApiClientType): ApiClient {
    switch (type) {
      case ApiClientType.OPENROUTER:
        return this.openRouterClient;
      case ApiClientType.PERPLEXITY:
        return this.perplexityClient;
      default:
        throw new Error(`Unknown API client type: ${type}`);
    }
  }

  getLLMClient(provider: LLMProvider): LLMClient {
    switch (provider) {
      case LLMProvider.OPENAI:
        return this.openAIClient;
      case LLMProvider.OPENROUTER:
        return this.openRouterClient;
      case LLMProvider.PERPLEXITY:
        return this.perplexityClient;
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}
