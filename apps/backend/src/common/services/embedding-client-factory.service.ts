import { Injectable } from '@nestjs/common';
import { EmbeddingClient } from '../interfaces/embedding-client.interface';
import { EmbeddingProvider } from '../enums/embedding-provider.enum';
import { LocalEmbeddingClient } from './local-embedding-client.service';
import { OllamaEmbeddingClient } from './ollama-embedding-client.service';
import { DashScopeEmbeddingClient } from './dashscope-embedding-client.service';

@Injectable()
export class EmbeddingClientFactory {
  constructor(
    private readonly localEmbeddingClient: LocalEmbeddingClient,
    private readonly ollamaEmbeddingClient: OllamaEmbeddingClient,
    private readonly dashScopeEmbeddingClient: DashScopeEmbeddingClient,
  ) {}

  getClient(provider: EmbeddingProvider): EmbeddingClient {
    switch (provider) {
      case EmbeddingProvider.LOCAL:
        return this.localEmbeddingClient;
      case EmbeddingProvider.OLLAMA:
        return this.ollamaEmbeddingClient;
      case EmbeddingProvider.DASHSCOPE:
        return this.dashScopeEmbeddingClient;
      default:
        throw new Error(`Unknown embedding provider: ${String(provider)}`);
    }
  }
}
