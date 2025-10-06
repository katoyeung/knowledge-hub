import { Injectable } from '@nestjs/common';

export enum LLMProvider {
  LOCAL_API = 'local-api',
  OLLAMA = 'ollama',
  OPENROUTER = 'openrouter',
  PERPLEXITY = 'perplexity',
  LOCAL_DIRECT = 'local-direct',
  DASHSCOPE = 'dashscope',
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  description?: string;
  maxTokens?: number;
  contextWindow?: number;
  pricing?: {
    input: number; // per 1M tokens
    output: number; // per 1M tokens
  };
}

@Injectable()
export class ModelConfigService {
  private readonly models: Map<LLMProvider, ModelInfo[]> = new Map();

  constructor() {
    this.initializeModels();
  }

  private initializeModels() {
    // OpenRouter Models
    this.models.set(LLMProvider.OPENROUTER, [
      {
        id: 'google/gemma-2-9b-it:free',
        name: 'Gemma 2 9B Instruct (Free)',
        provider: LLMProvider.OPENROUTER,
        description: "Google's efficient 9B parameter model (free tier)",
        maxTokens: 8192,
        contextWindow: 8192,
        pricing: { input: 0, output: 0 },
      },
      {
        id: 'google/gemma-2-9b-it',
        name: 'Gemma 2 9B Instruct',
        provider: LLMProvider.OPENROUTER,
        description: "Google's efficient 9B parameter model",
        maxTokens: 8192,
        contextWindow: 8192,
        pricing: { input: 0.27, output: 0.27 },
      },
      {
        id: 'x-ai/grok-4-fast:free',
        name: 'Grok-4 Fast (Free)',
        provider: LLMProvider.OPENROUTER,
        description: "X.AI's fast Grok-4 model (free tier)",
        maxTokens: 128000,
        contextWindow: 128000,
        pricing: { input: 0, output: 0 },
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: LLMProvider.OPENROUTER,
        description: "Anthropic's most capable model",
        maxTokens: 200000,
        contextWindow: 200000,
        pricing: { input: 3.0, output: 15.0 },
      },
      {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B Instruct',
        provider: LLMProvider.OPENROUTER,
        description: "Meta's efficient 8B parameter model",
        maxTokens: 128000,
        contextWindow: 128000,
        pricing: { input: 0.27, output: 0.27 },
      },
      {
        id: 'microsoft/phi-3-medium-128k-instruct',
        name: 'Phi-3 Medium 128K',
        provider: LLMProvider.OPENROUTER,
        description: "Microsoft's efficient medium model",
        maxTokens: 128000,
        contextWindow: 128000,
        pricing: { input: 0.27, output: 0.27 },
      },
      {
        id: 'qwen/qwen3-30b-a3b:free',
        name: 'Qwen3 30B A3B (Free)',
        provider: LLMProvider.OPENROUTER,
        description: "Alibaba's Qwen3 30B model (free tier)",
        maxTokens: 128000,
        contextWindow: 128000,
        pricing: { input: 0, output: 0 },
      },
    ]);

    // Ollama Models (Local)
    this.models.set(LLMProvider.OLLAMA, [
      {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        provider: LLMProvider.OLLAMA,
        description: 'Meta Llama 3.1 8B (Local)',
        maxTokens: 8192,
        contextWindow: 8192,
      },
      {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        provider: LLMProvider.OLLAMA,
        description: 'Meta Llama 3.1 70B (Local)',
        maxTokens: 8192,
        contextWindow: 8192,
      },
      {
        id: 'gemma2:9b',
        name: 'Gemma 2 9B',
        provider: LLMProvider.OLLAMA,
        description: 'Google Gemma 2 9B (Local)',
        maxTokens: 8192,
        contextWindow: 8192,
      },
      {
        id: 'qwen2.5:7b',
        name: 'Qwen 2.5 7B',
        provider: LLMProvider.OLLAMA,
        description: 'Alibaba Qwen 2.5 7B (Local)',
        maxTokens: 32768,
        contextWindow: 32768,
      },
      {
        id: 'phi3:medium',
        name: 'Phi-3 Medium',
        provider: LLMProvider.OLLAMA,
        description: 'Microsoft Phi-3 Medium (Local)',
        maxTokens: 128000,
        contextWindow: 128000,
      },
    ]);

    // Local API Models (External local server)
    this.models.set(LLMProvider.LOCAL_API, [
      {
        id: 'google/gemma-2-9b-it',
        name: 'Gemma 2 9B (Local API)',
        provider: LLMProvider.LOCAL_API,
        description: 'Google Gemma 2 9B via local API server',
        maxTokens: 8192,
        contextWindow: 8192,
      },
      {
        id: 'microsoft/phi-3-medium-128k-instruct',
        name: 'Phi-3 Medium 128K (Local API)',
        provider: LLMProvider.LOCAL_API,
        description: 'Microsoft Phi-3 Medium via local API server',
        maxTokens: 128000,
        contextWindow: 128000,
      },
    ]);

    // Local Direct Models (In-process execution)
    this.models.set(LLMProvider.LOCAL_DIRECT, [
      {
        id: 'microsoft/DialoGPT-medium',
        name: 'DialoGPT Medium (Local)',
        provider: LLMProvider.LOCAL_DIRECT,
        description: 'Microsoft DialoGPT Medium running in-process with Xenova',
        maxTokens: 1000,
        contextWindow: 1000,
      },
      {
        id: 'microsoft/DialoGPT-large',
        name: 'DialoGPT Large (Local)',
        provider: LLMProvider.LOCAL_DIRECT,
        description: 'Microsoft DialoGPT Large running in-process with Xenova',
        maxTokens: 1000,
        contextWindow: 1000,
      },
      {
        id: 'facebook/blenderbot-400M-distill',
        name: 'BlenderBot 400M (Local)',
        provider: LLMProvider.LOCAL_DIRECT,
        description: 'Facebook BlenderBot 400M running in-process with Xenova',
        maxTokens: 1000,
        contextWindow: 1000,
      },
      {
        id: 'microsoft/GODEL-v1_1-base-seq2seq',
        name: 'GODEL v1.1 Base (Local)',
        provider: LLMProvider.LOCAL_DIRECT,
        description: 'Microsoft GODEL v1.1 Base running in-process with Xenova',
        maxTokens: 1000,
        contextWindow: 1000,
      },
    ]);

    // DashScope Models (Alibaba Cloud)
    this.models.set(LLMProvider.DASHSCOPE, [
      {
        id: 'qwen3-max-2025-09-23',
        name: 'Qwen3 Max',
        provider: LLMProvider.DASHSCOPE,
        description: 'Alibaba Qwen3 Max via DashScope API',
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: { input: 0.02, output: 0.06 },
      },
      {
        id: 'qwen-plus-2025-09-11',
        name: 'Qwen Plus',
        provider: LLMProvider.DASHSCOPE,
        description: 'Alibaba Qwen Plus via DashScope API',
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: { input: 0.008, output: 0.02 },
      },
      {
        id: 'qwen-turbo-latest',
        name: 'Qwen Turbo',
        provider: LLMProvider.DASHSCOPE,
        description: 'Alibaba Qwen Turbo via DashScope API',
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: { input: 0.003, output: 0.006 },
      },
      {
        id: 'qwen-max-latest',
        name: 'Qwen Max',
        provider: LLMProvider.DASHSCOPE,
        description: 'Alibaba Qwen Max via DashScope API',
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: { input: 0.02, output: 0.06 },
      },
      {
        id: 'qwen-plus-latest',
        name: 'Qwen Plus Latest',
        provider: LLMProvider.DASHSCOPE,
        description: 'Alibaba Qwen Plus Latest via DashScope API',
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: { input: 0.008, output: 0.02 },
      },
    ]);

    // Perplexity Models
    this.models.set(LLMProvider.PERPLEXITY, [
      {
        id: 'sonar',
        name: 'Sonar',
        provider: LLMProvider.PERPLEXITY,
        description: "Perplexity's main model",
        maxTokens: 4096,
        contextWindow: 4096,
        pricing: { input: 5.0, output: 5.0 },
      },
      {
        id: 'sonar-small',
        name: 'Sonar Small',
        provider: LLMProvider.PERPLEXITY,
        description: 'Faster Perplexity model',
        maxTokens: 4096,
        contextWindow: 4096,
        pricing: { input: 1.0, output: 1.0 },
      },
    ]);
  }

  getAvailableProviders(): LLMProvider[] {
    const providers = Array.from(this.models.keys());
    console.log('Available providers from ModelConfigService:', providers);
    return providers;
  }

  getModelsByProvider(provider: LLMProvider): ModelInfo[] {
    return this.models.get(provider) || [];
  }

  getAllModels(): ModelInfo[] {
    const allModels: ModelInfo[] = [];
    for (const models of this.models.values()) {
      allModels.push(...models);
    }
    return allModels;
  }

  getModelById(modelId: string): ModelInfo | undefined {
    for (const models of this.models.values()) {
      const model = models.find((m) => m.id === modelId);
      if (model) return model;
    }
    return undefined;
  }

  getProviderForModel(modelId: string): LLMProvider | undefined {
    for (const [provider, models] of this.models.entries()) {
      if (models.some((m) => m.id === modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  validateModelForProvider(provider: LLMProvider, modelId: string): boolean {
    const models = this.models.get(provider);
    return models ? models.some((m) => m.id === modelId) : false;
  }

  getDefaultModelForProvider(provider: LLMProvider): string | undefined {
    const models = this.models.get(provider);
    return models && models.length > 0 ? models[0].id : undefined;
  }
}
