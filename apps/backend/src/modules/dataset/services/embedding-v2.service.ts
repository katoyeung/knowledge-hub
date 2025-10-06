import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingModel } from '../dto/create-dataset-step.dto';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';
import { EmbeddingClientFactory } from '../../../common/services/embedding-client-factory.service';
import { ModelMappingService } from '../../../common/services/model-mapping.service';
import {
  EmbeddingResult,
  EmbeddingOptions,
} from '../../../common/interfaces/embedding-client.interface';

@Injectable()
export class EmbeddingV2Service {
  private readonly logger = new Logger(EmbeddingV2Service.name);
  // Cache disabled - set to null to prevent caching
  private embeddingCache: Map<string, EmbeddingResult> | null = null;

  constructor(
    private readonly embeddingClientFactory: EmbeddingClientFactory,
    private readonly modelMappingService: ModelMappingService,
  ) {}

  async generateEmbedding(
    text: string,
    model: EmbeddingModel,
    provider: EmbeddingProvider = EmbeddingProvider.LOCAL,
    customModelName?: string,
  ): Promise<EmbeddingResult> {
    try {
      // Create cache key based on text, model, and provider
      const cacheKey = this.createCacheKey(
        text,
        model,
        provider,
        customModelName,
      );

      // Cache is disabled - skip cache check
      // const cachedEmbedding = this.embeddingCache.get(cacheKey);
      // if (cachedEmbedding) {
      //   this.logger.log(
      //     `♻️ Using cached embedding for text (${text.length} chars) with model: ${model} (provider: ${provider})`,
      //   );
      //   return cachedEmbedding;
      // }

      this.logger.log(
        `🔄 Generating embedding for text (${text.length} chars) with model: ${model} (provider: ${provider})${customModelName ? ` (custom: ${customModelName})` : ''}`,
      );

      // Get the appropriate client for the provider
      const client = this.embeddingClientFactory.getClient(provider);

      // Prepare options
      const options: EmbeddingOptions = {
        customModelName,
      };

      // Get the model name to use from centralized mapping service
      const modelName =
        customModelName ||
        this.modelMappingService.getModelName(model, provider);

      // Generate embedding using the provider-specific client
      const result = await client.generateEmbedding(text, modelName, options);

      // Cache is disabled - skip caching
      // this.embeddingCache.set(cacheKey, result);
      // this.logger.log(`💾 Cached embedding for future use`);

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to generate embedding: ${error.message}`,
        error.stack,
      );
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Get model name using centralized mapping service
   * This ensures consistency across all providers and prevents dimension mismatches
   */
  private getModelName(
    model: EmbeddingModel,
    customModelName?: string,
    provider: EmbeddingProvider = EmbeddingProvider.LOCAL,
  ): string {
    // For custom models, use the custom model name
    if (model === EmbeddingModel.CUSTOM && customModelName) {
      return customModelName;
    }

    // Use centralized model mapping service for consistency
    return this.modelMappingService.getModelName(model, provider);
  }

  private createCacheKey(
    text: string,
    model: EmbeddingModel,
    provider: EmbeddingProvider,
    customModelName?: string,
  ): string {
    const modelName = customModelName || model;
    return `${provider}:${modelName}:${this.hashText(text)}`;
  }

  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  async getAvailableModels(provider: EmbeddingProvider): Promise<string[]> {
    const client = this.embeddingClientFactory.getClient(provider);
    return await client.getAvailableModels();
  }

  async isProviderAvailable(provider: EmbeddingProvider): Promise<boolean> {
    const client = this.embeddingClientFactory.getClient(provider);
    return await client.isServiceAvailable();
  }

  async healthCheck(provider: EmbeddingProvider): Promise<boolean> {
    const client = this.embeddingClientFactory.getClient(provider);
    return await client.healthCheck();
  }

  /**
   * Find the most similar embeddings to a query embedding
   */
  findSimilarEmbeddings(
    queryEmbedding: number[],
    candidateEmbeddings: { id: string; embedding: number[]; content: string }[],
    topK: number = 10,
    threshold: number = 0.0,
  ): { id: string; content: string; similarity: number }[] {
    const similarities = candidateEmbeddings
      .map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
        similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding),
      }))
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return similarities;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
}
