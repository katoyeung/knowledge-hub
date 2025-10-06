import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  EmbeddingClient,
  EmbeddingResult,
  EmbeddingOptions,
} from '../interfaces/embedding-client.interface';
import { EmbeddingProvider } from '../enums/embedding-provider.enum';

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
  model: string;
}

@Injectable()
export class OllamaEmbeddingClient implements EmbeddingClient {
  private readonly logger = new Logger(OllamaEmbeddingClient.name);
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;
  private readonly modelTimeouts: Record<string, number>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    // Try to get timeout from localModels config first, then fallback to direct env var
    const localModelsConfig = this.configService.get('localModels');
    this.defaultTimeout =
      localModelsConfig?.ollama?.timeout ||
      this.configService.get<number>('OLLAMA_TIMEOUT', 120000);
    this.modelTimeouts = localModelsConfig?.ollama?.modelTimeouts || {};
    this.logger.log(
      `OllamaEmbeddingClient initialized with default timeout: ${this.defaultTimeout}ms`,
    );
  }

  /**
   * Determines the appropriate timeout for a given model based on its parameter size
   * @param model The model name to get timeout for
   * @returns The timeout in milliseconds
   */
  private getTimeoutForModel(model: string): number {
    // Extract model size from model name (e.g., "qwen3-embedding:4b" -> "4b")
    const modelSizeMatch = model.match(/(\d+(?:\.\d+)?)b/i);
    if (modelSizeMatch) {
      const size = modelSizeMatch[1];
      const sizeKey = `${size}b`;

      if (this.modelTimeouts[sizeKey]) {
        this.logger.log(
          `Using model-specific timeout for ${model}: ${this.modelTimeouts[sizeKey]}ms`,
        );
        return this.modelTimeouts[sizeKey];
      }
    }

    // Fallback to default timeout
    this.logger.log(
      `Using default timeout for ${model}: ${this.defaultTimeout}ms`,
    );
    return this.defaultTimeout;
  }

  async generateEmbedding(
    text: string,
    model: string,
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResult> {
    this.logger.log(
      `Generating Ollama embedding for text (${text.length} chars) with model: ${model}`,
    );

    const payload: OllamaEmbeddingRequest = {
      model,
      prompt: text,
    };

    // Get model-specific timeout
    const timeout = this.getTimeoutForModel(model);

    try {
      this.logger.log(`Making HTTP request with timeout: ${timeout}ms`);
      const response = await firstValueFrom(
        this.httpService.post<OllamaEmbeddingResponse>(
          `${this.baseUrl}/api/embeddings`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: timeout, // Model-specific timeout for embedding generation
          },
        ),
      );

      const embedding = response.data.embedding;
      const dimensions = embedding.length;

      return {
        embedding,
        model: response.data.model,
        dimensions,
        provider: EmbeddingProvider.OLLAMA,
      };
    } catch (error) {
      this.logger.error(
        `Ollama embedding request failed: ${error.message}`,
        error.stack,
      );

      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `Ollama service is not available at ${this.baseUrl}. Please ensure Ollama is running.`,
        );
      }

      if (error.response?.status === 404) {
        throw new Error(
          `Model '${model}' not found. Please pull the model first: ollama pull ${model}`,
        );
      }

      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`),
      );
      const availableModels =
        response.data.models?.map((model: any) => model.name) || [];

      // Filter to only include embedding models
      const embeddingModels = availableModels.filter(
        (model: string) =>
          model.includes('embedding') ||
          model.includes('embed') ||
          model === 'qwen3-embedding:0.6b' ||
          model === 'qwen3-embedding:4b' ||
          model === 'embeddinggemma:300m' ||
          model === 'nomic-embed-text:v1.5',
      );

      return embeddingModels;
    } catch (error) {
      this.logger.warn(
        `Failed to get available Ollama models: ${error.message}`,
      );
      // Return default embedding models if API call fails
      return [
        'qwen3-embedding:0.6b',
        'qwen3-embedding:4b',
        'embeddinggemma:300m',
        'nomic-embed-text:v1.5',
      ];
    }
  }

  async isServiceAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(this.httpService.get(`${this.baseUrl}/api/tags`));
      return true;
    } catch (error) {
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    return await this.isServiceAvailable();
  }
}
