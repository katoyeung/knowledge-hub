import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingModel } from '../dto/create-dataset-step.dto';

// Lazy import for Xenova Transformers to avoid loading issues
let XenovaTransformers: any = null;

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private transformersLoaded = false;

  private async loadTransformers() {
    if (!this.transformersLoaded) {
      try {
        // Dynamic import to avoid build-time issues
        XenovaTransformers = await eval('import("@xenova/transformers")');
        this.transformersLoaded = true;
        this.logger.log('✅ Xenova Transformers loaded successfully');
      } catch (error) {
        this.logger.error(
          '❌ Failed to load Xenova Transformers:',
          error.message,
        );
        throw error;
      }
    }
  }

  async generateEmbedding(
    text: string,
    model: EmbeddingModel,
    customModelName?: string,
  ): Promise<EmbeddingResult> {
    try {
      this.logger.log(
        `🔄 Generating embedding for text (${text.length} chars) with model: ${model}${customModelName ? ` (custom: ${customModelName})` : ''}`,
      );

      return await this.generateLocalEmbedding(text, model, customModelName);
    } catch (error) {
      this.logger.error(
        `❌ Failed to generate embedding: ${error.message}`,
        error.stack,
      );
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  private async generateLocalEmbedding(
    text: string,
    model: EmbeddingModel,
    customModelName?: string,
  ): Promise<EmbeddingResult> {
    this.logger.log(`🏠 Generating local embedding with model: ${model}`);

    await this.loadTransformers();

    // Get the actual model name to use
    const modelName = this.getXenovaModelName(model, customModelName);

    this.logger.log(`🤖 Loading model: ${modelName}`);

    // Load the feature extraction pipeline
    const extractor = await XenovaTransformers.pipeline(
      'feature-extraction',
      modelName,
      {
        quantized: true, // Use quantized models for better performance
      },
    );

    this.logger.log(`📊 Processing text with local model...`);

    // Generate embedding
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to regular array and ensure it's number[]
    const embedding: number[] = Array.from(output.data as Float32Array);

    const result = {
      embedding,
      dimensions: embedding.length,
      model: customModelName || (model as string),
    };

    this.logger.log(
      `✅ Successfully generated local embedding: ${result.dimensions} dimensions`,
    );
    return result;
  }

  private getXenovaModelName(
    model: EmbeddingModel,
    customModelName?: string,
  ): string {
    if (model === EmbeddingModel.CUSTOM && customModelName) {
      return customModelName;
    }

    switch (model) {
      case EmbeddingModel.XENOVA_BGE_M3:
        return 'Xenova/bge-m3';
      case EmbeddingModel.MIXEDBREAD_MXBAI_EMBED_LARGE_V1:
        return 'mixedbread-ai/mxbai-embed-large-v1';
      case EmbeddingModel.WHEREISAI_UAE_LARGE_V1:
        return 'WhereIsAI/UAE-Large-V1';
      default:
        throw new Error(`Unsupported embedding model: ${model}`);
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
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
}
