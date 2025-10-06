import { Controller, Get } from '@nestjs/common';
import { OllamaApiClient } from '../../../common/services/ollama-api-client.service';
import { LocalModelApiClient } from '../../../common/services/local-model-api-client.service';
import { LocalLLMClient } from '../../../common/services/local-llm-client.service';
import { OpenRouterApiClient } from '../../../common/services/openrouter-api-client.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly ollamaClient: OllamaApiClient,
    private readonly localModelClient: LocalModelApiClient,
    private readonly localLLMClient: LocalLLMClient,
    private readonly openRouterClient: OpenRouterApiClient,
  ) {}

  @Get('ollama')
  async checkOllamaHealth() {
    try {
      const isAvailable = await this.ollamaClient.isServiceAvailable();
      const models = isAvailable
        ? await this.ollamaClient.getAvailableModels()
        : [];

      return {
        status: isAvailable ? 'healthy' : 'unhealthy',
        service: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        availableModels: models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('local-models')
  async checkLocalModelsHealth() {
    try {
      const health = await this.localModelClient.healthCheck();

      return {
        status: health.status,
        service: 'local-models',
        baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:8000',
        availableModels: health.models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'local-models',
        baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:8000',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('local-direct')
  async checkLocalDirectHealth() {
    try {
      const health = await this.localLLMClient.healthCheck();

      return {
        status: health.status,
        service: 'local-direct',
        description: 'Local LLM service using in-process Xenova Transformers',
        availableModels: health.models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'local-direct',
        description: 'Local LLM service using in-process Xenova Transformers',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('openrouter')
  async checkOpenRouterHealth() {
    try {
      const isAvailable = await this.openRouterClient.isServiceAvailable();
      const models = isAvailable
        ? await this.openRouterClient.getAvailableModels()
        : [];

      return {
        status: isAvailable ? 'healthy' : 'unhealthy',
        service: 'openrouter',
        description: 'OpenRouter API for accessing various LLM models',
        availableModels: models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'openrouter',
        description: 'OpenRouter API for accessing various LLM models',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('all')
  async checkAllHealth() {
    const [ollamaHealth, localApiHealth, localDirectHealth, openRouterHealth] =
      await Promise.allSettled([
        this.checkOllamaHealth(),
        this.checkLocalModelsHealth(),
        this.checkLocalDirectHealth(),
        this.checkOpenRouterHealth(),
      ]);

    return {
      timestamp: new Date().toISOString(),
      services: {
        ollama:
          ollamaHealth.status === 'fulfilled'
            ? ollamaHealth.value
            : { status: 'error', error: ollamaHealth.reason?.message },
        localApi:
          localApiHealth.status === 'fulfilled'
            ? localApiHealth.value
            : { status: 'error', error: localApiHealth.reason?.message },
        localDirect:
          localDirectHealth.status === 'fulfilled'
            ? localDirectHealth.value
            : { status: 'error', error: localDirectHealth.reason?.message },
        openrouter:
          openRouterHealth.status === 'fulfilled'
            ? openRouterHealth.value
            : { status: 'error', error: openRouterHealth.reason?.message },
      },
    };
  }
}
