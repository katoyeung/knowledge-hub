import { Injectable } from '@nestjs/common';
import { ApiClient } from '../interfaces/api-client.interface';
import { OpenRouterApiClient } from './openrouter-api-client.service';
import { LLMClient } from '../interfaces/llm-client.interface';
import { PerplexityApiClient } from './perplexity-api-client.service';
import { OllamaApiClient } from './ollama-api-client.service';
import { LocalModelApiClient } from './local-model-api-client.service';
import { LocalLLMClient } from './local-llm-client.service';
import { DashScopeApiClient } from './dashscope-api-client.service';

export enum ApiClientType {
  EODHD = 'eodhd',
  OPENROUTER = 'openrouter',
  PERPLEXITY = 'perplexity',
}

export enum LLMProvider {
  OPENROUTER = 'openrouter',
  PERPLEXITY = 'perplexity',
  OLLAMA = 'ollama',
  LOCAL_API = 'local-api', // External local API server
  LOCAL_DIRECT = 'local-direct', // Direct function calls in same project
  DASHSCOPE = 'dashscope', // Alibaba Cloud DashScope API
}

@Injectable()
export class ApiClientFactory {
  constructor(
    private readonly openRouterClient: OpenRouterApiClient,
    private readonly perplexityClient: PerplexityApiClient,
    private readonly ollamaClient: OllamaApiClient,
    private readonly localModelClient: LocalModelApiClient,
    private readonly localLLMClient: LocalLLMClient,
    private readonly dashScopeClient: DashScopeApiClient,
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
      case LLMProvider.OPENROUTER:
        return this.openRouterClient;
      case LLMProvider.PERPLEXITY:
        return this.perplexityClient;
      case LLMProvider.OLLAMA:
        return this.ollamaClient;
      case LLMProvider.LOCAL_API:
        return this.localModelClient;
      case LLMProvider.LOCAL_DIRECT:
        return this.localLLMClient;
      case LLMProvider.DASHSCOPE:
        return this.dashScopeClient;
      default:
        throw new Error(`Unknown LLM provider: ${String(provider)}`);
    }
  }
}
