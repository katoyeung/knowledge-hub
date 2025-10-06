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

interface DashScopeEmbeddingRequest {
  model: string;
  input: string[];
  dimensions?: number;
}

interface DashScopeEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class DashScopeEmbeddingClient implements EmbeddingClient {
  private readonly logger = new Logger(DashScopeEmbeddingClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'DASHSCOPE_BASE_URL',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    this.apiKey = this.configService.get<string>('DASHSCOPE_API_KEY');
    this.timeout = this.configService.get<number>('DASHSCOPE_TIMEOUT', 30000);

    if (!this.apiKey) {
      this.logger.warn('DASHSCOPE_API_KEY not found in environment variables');
    }
  }

  async generateEmbedding(
    text: string,
    model: string,
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResult> {
    this.logger.log(
      `Generating DashScope embedding for text (${text.length} chars) with model: ${model}`,
    );

    if (!this.apiKey) {
      throw new Error('DashScope API key is required but not configured');
    }

    const payload: DashScopeEmbeddingRequest = {
      model,
      input: [text],
      dimensions: options?.dimensions,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<DashScopeEmbeddingResponse>(
          `${this.baseUrl}/embeddings`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: this.timeout,
          },
        ),
      );

      const embedding = response.data.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding data received from DashScope API');
      }

      const dimensions = embedding.length;

      return {
        embedding,
        model: response.data.model,
        dimensions,
        provider: EmbeddingProvider.DASHSCOPE,
      };
    } catch (error) {
      this.logger.error(
        `DashScope embedding request failed: ${error.message}`,
        error.stack,
      );

      if (error.response?.status === 401) {
        throw new Error('Invalid DashScope API key');
      }

      if (error.response?.status === 400) {
        throw new Error(
          `Bad request to DashScope API: ${error.response.data?.message || 'Unknown error'}`,
        );
      }

      if (error.response?.status === 429) {
        throw new Error('DashScope API rate limit exceeded');
      }

      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    // DashScope embedding models
    return [
      'text-embedding-v1',
      'text-embedding-v2',
      'text-embedding-v3',
      'text-embedding-v4',
    ];
  }

  async isServiceAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 5000,
        }),
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    return await this.isServiceAvailable();
  }
}
