import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AiProvider } from '../entities/ai-provider.entity';
import { LLMClient } from '../../../common/interfaces/llm-client.interface';
import { getProviderConfig } from '../provider-type.registry';
import { OpenAIApiClient } from '../../../common/services/openai-api-client.service';
import { OpenRouterApiClient } from '../../../common/services/openrouter-api-client.service';
import { DashScopeApiClient } from '../../../common/services/dashscope-api-client.service';
import { PerplexityApiClient } from '../../../common/services/perplexity-api-client.service';
import { OllamaApiClient } from '../../../common/services/ollama-api-client.service';

interface ClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  cacheTTL?: number;
}

@Injectable()
export class LLMClientFactory {
  private readonly logger = new Logger(LLMClientFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Create an LLM client instance for the given AI provider
   */
  createClient(aiProvider: AiProvider): LLMClient {
    this.logger.log(`🔧 Creating LLM client for provider: ${aiProvider.type}`);
    this.logger.log(`🔧 Provider baseUrl: ${aiProvider.baseUrl}`);
    this.logger.log(
      `🔧 Provider apiKey: ${aiProvider.apiKey ? 'present' : 'missing'}`,
    );

    const providerConfig = getProviderConfig(aiProvider.type);
    if (!providerConfig) {
      throw new Error(`Unsupported provider type: ${aiProvider.type}`);
    }

    this.logger.log(
      `🔧 Provider config supportsCustomBaseUrl: ${providerConfig.supportsCustomBaseUrl}`,
    );

    // Build client configuration
    const clientConfig: ClientConfig = {
      apiKey: aiProvider.apiKey,
      baseUrl: aiProvider.baseUrl,
      timeout: 300000, // Increased to 5 minutes for complex graph extraction tasks
      cacheTTL: 0, // Disable caching by default
    };

    // Use provider's baseUrl if available and supported
    if (aiProvider.baseUrl && providerConfig.supportsCustomBaseUrl) {
      clientConfig.baseUrl = aiProvider.baseUrl;
      this.logger.log(`🔧 Using custom baseUrl: ${clientConfig.baseUrl}`);
    } else {
      this.logger.warn(
        `🔧 NOT using custom baseUrl. aiProvider.baseUrl: ${aiProvider.baseUrl}, supportsCustomBaseUrl: ${providerConfig.supportsCustomBaseUrl}`,
      );
    }

    this.logger.log(
      `🔧 Final client config: ${JSON.stringify(clientConfig, null, 2)}`,
    );

    // Create client instance
    return this.getClientForType(aiProvider.type, clientConfig);
  }

  /**
   * Create a client instance based on provider type
   */
  private getClientForType(type: string, config: ClientConfig): LLMClient {
    switch (type) {
      case 'openai':
        return this.createOpenAIClient(config);

      case 'anthropic':
      case 'openrouter':
        return this.createOpenRouterClient(config);

      case 'dashscope':
        return this.createDashScopeClient(config);

      case 'perplexity':
        return this.createPerplexityClient(config);

      case 'ollama':
        return this.createOllamaClient(config);

      case 'custom':
        return this.createOllamaClient(config);

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Create OpenAI client
   */
  private createOpenAIClient(config: ClientConfig): LLMClient {
    // Create a custom config service for this client
    const customConfigService = {
      get: (key: string, defaultValue?: any) => {
        switch (key) {
          case 'OPENAI_API_KEY':
            return config.apiKey || this.configService.get('OPENAI_API_KEY');
          case 'OPENAI_CACHE_TTL':
            return this.configService.get('OPENAI_CACHE_TTL', 0);
          default:
            return this.configService.get(key, defaultValue);
        }
      },
    } as ConfigService;

    return new OpenAIApiClient(
      customConfigService,
      this.httpService,
      this.cacheManager,
    );
  }

  /**
   * Create OpenRouter client (used for Anthropic, OpenRouter)
   */
  private createOpenRouterClient(config: ClientConfig): LLMClient {
    // Create a custom config service for this client
    const customConfigService = {
      get: (key: string, defaultValue?: any) => {
        switch (key) {
          case 'OPENROUTER_API_KEY':
            return (
              config.apiKey || this.configService.get('OPENROUTER_API_KEY')
            );
          case 'OPENROUTER_CACHE_TTL':
            return this.configService.get('OPENROUTER_CACHE_TTL', 0);
          default:
            return this.configService.get(key, defaultValue);
        }
      },
    } as ConfigService;

    return new OpenRouterApiClient(
      customConfigService,
      this.httpService,
      this.cacheManager,
      config.baseUrl, // Pass the custom base URL
    );
  }

  /**
   * Create DashScope client
   */
  private createDashScopeClient(config: ClientConfig): LLMClient {
    const customConfigService = {
      get: (key: string, defaultValue?: any) => {
        switch (key) {
          case 'DASHSCOPE_API_KEY':
            return config.apiKey || this.configService.get('DASHSCOPE_API_KEY');
          case 'DASHSCOPE_BASE_URL':
            return (
              config.baseUrl ||
              this.configService.get(
                'DASHSCOPE_BASE_URL',
                'https://dashscope.aliyuncs.com/compatible-mode/v1',
              )
            );
          case 'DASHSCOPE_TIMEOUT':
            return (
              config.timeout ||
              this.configService.get('DASHSCOPE_TIMEOUT', 30000)
            );
          case 'DASHSCOPE_CACHE_TTL':
            return this.configService.get('DASHSCOPE_CACHE_TTL', 0);
          default:
            return this.configService.get(key, defaultValue);
        }
      },
    } as ConfigService;

    return new DashScopeApiClient(
      customConfigService,
      this.httpService,
      this.cacheManager,
    );
  }

  /**
   * Create Perplexity client
   */
  private createPerplexityClient(config: ClientConfig): LLMClient {
    const customConfigService = {
      get: (key: string, defaultValue?: any) => {
        switch (key) {
          case 'PERPLEXITY_API_KEY':
            return (
              config.apiKey || this.configService.get('PERPLEXITY_API_KEY')
            );
          case 'PERPLEXITY_CACHE_TTL':
            return this.configService.get('PERPLEXITY_CACHE_TTL', 0);
          default:
            return this.configService.get(key, defaultValue);
        }
      },
    } as ConfigService;

    return new PerplexityApiClient(
      customConfigService,
      this.httpService,
      this.cacheManager,
    );
  }

  /**
   * Create Ollama client (for custom providers)
   */
  private createOllamaClient(config: ClientConfig): LLMClient {
    const customConfigService = {
      get: (key: string, defaultValue?: any) => {
        switch (key) {
          case 'OLLAMA_BASE_URL':
            return (
              config.baseUrl ||
              this.configService.get(
                'OLLAMA_BASE_URL',
                'http://localhost:11434',
              )
            );
          case 'OLLAMA_API_KEY':
            return config.apiKey || this.configService.get('OLLAMA_API_KEY');
          case 'OLLAMA_CACHE_TTL':
            return this.configService.get('OLLAMA_CACHE_TTL', 0);
          default:
            return this.configService.get(key, defaultValue);
        }
      },
    } as ConfigService;

    return new OllamaApiClient(
      customConfigService,
      this.httpService,
      this.cacheManager,
    );
  }

  /**
   * Validate that a model is available for the given provider
   */
  validateModelAvailability(aiProvider: AiProvider, modelId: string): boolean {
    try {
      // Check if model exists in provider's model list
      if (aiProvider.models && aiProvider.models.length > 0) {
        const modelExists = aiProvider.models.some(
          (model) => model.id === modelId,
        );
        if (modelExists) {
          return true;
        }
      }

      // For providers without model lists, assume model is available
      // (e.g., Ollama models are pulled on-demand)
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to validate model ${modelId} for provider ${aiProvider.type}: ${error.message}`,
      );
      return false;
    }
  }
}
