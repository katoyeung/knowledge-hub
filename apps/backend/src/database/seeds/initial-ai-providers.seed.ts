import { DataSource } from 'typeorm';
import { AiProvider } from '../../modules/ai-provider/entities/ai-provider.entity';
import { User } from '../../modules/user/user.entity';

export class InitialAiProvidersSeed {
  async run(dataSource: DataSource): Promise<void> {
    const aiProviderRepository = dataSource.getRepository(AiProvider);
    const userRepository = dataSource.getRepository(User);

    // Get admin user
    const adminUser = await userRepository.findOne({
      where: { email: 'admin@example.com' },
    });

    if (!adminUser) {
      throw new Error('Admin user not found. Please run admin seed first.');
    }

    // Define AI providers with their models
    const aiProviders = [
      {
        name: 'OpenRouter',
        type: 'openrouter' as const,
        apiKey: process.env.OPENROUTER_API_KEY || '',
        baseUrl: 'https://openrouter.ai/api/v1',
        isActive: true,
        models: [
          {
            id: 'deepseek/deepseek-chat-v3.1:free',
            name: 'DeepSeek Chat v3.1 (Free)',
            description: "DeepSeek's advanced chat model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'tngtech/deepseek-r1t2-chimera:free',
            name: 'DeepSeek R1T2 Chimera (Free)',
            description: "DeepSeek's reasoning model Chimera (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'z-ai/glm-4.5-air:free',
            name: 'GLM-4.5 Air (Free)',
            description: "Zhipu AI's GLM-4.5 Air model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'qwen/qwen3-235b-a22b:free',
            name: 'Qwen3 235B A22B (Free)',
            description: "Alibaba's Qwen3 235B model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'microsoft/mai-ds-r1:free',
            name: 'Microsoft MAI DS R1 (Free)',
            description: "Microsoft's MAI DeepSeek R1 model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'deepseek/deepseek-r1:free',
            name: 'DeepSeek R1 (Free)',
            description: "DeepSeek's reasoning model R1 (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'openai/gpt-oss-20b:free',
            name: 'GPT OSS 20B (Free)',
            description: "OpenAI's open source 20B model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'meta-llama/llama-4-maverick:free',
            name: 'Llama 4 Maverick (Free)',
            description: "Meta's Llama 4 Maverick model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'google/gemma-3-27b-it:free',
            name: 'Gemma 3 27B Instruct (Free)',
            description: "Google's Gemma 3 27B model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'qwen/qwen3-30b-a3b:free',
            name: 'Qwen3 30B A3B (Free)',
            description: "Alibaba's Qwen3 30B model (free tier)",
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
        ],
      },
      {
        name: 'Ollama (Local)',
        type: 'custom' as const,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        isActive: true,
        models: [
          {
            id: 'gemma2:9b',
            name: 'Gemma 2 9B',
            description: 'Google Gemma 2 9B (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'gemma3:4b',
            name: 'Gemma 3 4B',
            description: 'Google Gemma 3 4B (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'gemma3:270m',
            name: 'Gemma 3 270M',
            description: 'Google Gemma 3 270M (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'qwen3:0.6b',
            name: 'Qwen 3 0.6B',
            description: 'Alibaba Qwen 3 0.6B (Local)',
            maxTokens: 32768,
            contextWindow: 32768,
          },
          {
            id: 'nomic-embed-text:v1.5',
            name: 'Nomic Embed Text v1.5',
            description: 'Nomic Embed Text v1.5 for embeddings (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'embeddinggemma:300m',
            name: 'Embedding Gemma 300M',
            description: 'Google Embedding Gemma 300M for embeddings (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'qwen3-embedding:4b',
            name: 'Qwen 3 Embedding 4B',
            description: 'Alibaba Qwen 3 Embedding 4B for embeddings (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
          {
            id: 'qwen3-embedding:0.6b',
            name: 'Qwen 3 Embedding 0.6B',
            description: 'Alibaba Qwen 3 Embedding 0.6B for embeddings (Local)',
            maxTokens: 8192,
            contextWindow: 8192,
          },
        ],
      },
      {
        name: 'DashScope (Alibaba Cloud)',
        type: 'dashscope' as const,
        apiKey: process.env.DASHSCOPE_API_KEY || '',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        isActive: true,
        models: [
          {
            id: 'qwen3-max',
            name: 'Qwen3 Max',
            description: 'Alibaba Qwen3 Max via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.02, output: 0.06 },
          },
          {
            id: 'qwen3-max-preview',
            name: 'Qwen3 Max Preview',
            description: 'Alibaba Qwen3 Max Preview via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.02, output: 0.06 },
          },
          {
            id: 'qwen3-max-2025-09-23',
            name: 'Qwen3 Max (2025-09-23)',
            description: 'Alibaba Qwen3 Max via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.02, output: 0.06 },
          },
          {
            id: 'qwen-max',
            name: 'Qwen Max',
            description: 'Alibaba Qwen Max via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.02, output: 0.06 },
          },
          {
            id: 'qwen-max-latest',
            name: 'Qwen Max Latest',
            description: 'Alibaba Qwen Max Latest via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.02, output: 0.06 },
          },
          {
            id: 'qwen-turbo-latest',
            name: 'Qwen Turbo Latest',
            description: 'Alibaba Qwen Turbo Latest via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.003, output: 0.006 },
          },
          {
            id: 'qwen-turbo-2025-07-15',
            name: 'Qwen Turbo (2025-07-15)',
            description: 'Alibaba Qwen Turbo via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.003, output: 0.006 },
          },
          {
            id: 'qwen-plus',
            name: 'Qwen Plus',
            description: 'Alibaba Qwen Plus via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.008, output: 0.02 },
          },
          {
            id: 'qwen-plus-latest',
            name: 'Qwen Plus Latest',
            description: 'Alibaba Qwen Plus Latest via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.008, output: 0.02 },
          },
          {
            id: 'qwen-flash',
            name: 'Qwen Flash',
            description:
              'Alibaba Qwen Flash via DashScope API - Ultra-fast model',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.001, output: 0.002 },
          },
          {
            id: 'qwen-flash-2025-07-28',
            name: 'Qwen Flash (2025-07-28)',
            description: 'Alibaba Qwen Flash via DashScope API',
            maxTokens: 8192,
            contextWindow: 128000,
            pricing: { input: 0.001, output: 0.002 },
          },
        ],
      },
      {
        name: 'Perplexity',
        type: 'perplexity' as const,
        apiKey: process.env.PERPLEXITY_API_KEY || '',
        baseUrl: 'https://api.perplexity.ai',
        isActive: true,
        models: [
          {
            id: 'sonar',
            name: 'Sonar',
            description: "Perplexity's main model",
            maxTokens: 4096,
            contextWindow: 4096,
            pricing: { input: 5.0, output: 5.0 },
          },
        ],
      },
      {
        name: 'OpenAI',
        type: 'openai' as const,
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: 'https://api.openai.com/v1',
        isActive: true,
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            description: 'OpenAI GPT-4o model',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 5.0, output: 15.0 },
          },
          {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'OpenAI GPT-4o Mini model',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0.15, output: 0.6 },
          },
          {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'OpenAI GPT-3.5 Turbo model',
            maxTokens: 16385,
            contextWindow: 16385,
            pricing: { input: 0.5, output: 1.5 },
          },
        ],
      },
      {
        name: 'Anthropic',
        type: 'anthropic' as const,
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        baseUrl: 'https://api.anthropic.com',
        isActive: true,
        models: [
          {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            description: "Anthropic's most capable model",
            maxTokens: 200000,
            contextWindow: 200000,
            pricing: { input: 3.0, output: 15.0 },
          },
          {
            id: 'claude-3-5-haiku-20241022',
            name: 'Claude 3.5 Haiku',
            description: "Anthropic's fastest model",
            maxTokens: 200000,
            contextWindow: 200000,
            pricing: { input: 1.0, output: 5.0 },
          },
          {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            description: "Anthropic's most powerful model",
            maxTokens: 200000,
            contextWindow: 200000,
            pricing: { input: 15.0, output: 75.0 },
          },
        ],
      },
      {
        name: 'Crumplete AI',
        type: 'openai' as const,
        apiKey: process.env.CRUMPLETE_AI_API_KEY || '',
        baseUrl: 'https://llmendpoint.crumplete.dev/api/',
        isActive: true,
        models: [
          {
            id: 'llama4:scout',
            name: 'Llama 4 Scout',
            description: 'Crumplete AI Llama 4 Scout model',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'gpt-oss:120b',
            name: 'GPT OSS 120B',
            description: 'Crumplete AI GPT Open Source 120B model',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'nomic-embed-text',
            name: 'Nomic Embed Text',
            description: 'Crumplete AI Nomic Embed Text model for embeddings',
            maxTokens: 8192,
            contextWindow: 8192,
            pricing: { input: 0, output: 0 },
          },
          {
            id: 'qwen3-coder-30b-fixed:latest',
            name: 'Qwen3 Coder 30B Fixed (Latest)',
            description:
              'Crumplete AI Qwen3 Coder 30B Fixed model for coding tasks',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: { input: 0, output: 0 },
          },
        ],
      },
    ];

    // Create or update AI providers
    for (const providerData of aiProviders) {
      const existingProvider = await aiProviderRepository.findOne({
        where: { name: providerData.name },
      });

      if (!existingProvider) {
        const aiProvider = aiProviderRepository.create({
          ...providerData,
          userId: adminUser.id,
        });

        await aiProviderRepository.save(aiProvider);
        console.log(`✅ Created AI provider: ${providerData.name}`);
      } else {
        // Update existing provider with new models
        await aiProviderRepository.update(existingProvider.id, {
          models: providerData.models,
          baseUrl: providerData.baseUrl,
          apiKey: providerData.apiKey,
          isActive: providerData.isActive,
        });
        console.log(`✅ Updated AI provider: ${providerData.name}`);
      }
    }
  }
}
