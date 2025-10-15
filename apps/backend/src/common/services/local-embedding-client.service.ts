import { Injectable, Logger } from '@nestjs/common';
import {
  EmbeddingClient,
  EmbeddingResult,
  EmbeddingOptions,
} from '../interfaces/embedding-client.interface';
import { EmbeddingProvider } from '../enums/embedding-provider.enum';

@Injectable()
export class LocalEmbeddingClient implements EmbeddingClient {
  private readonly logger = new Logger(LocalEmbeddingClient.name);
  private modelCache: Map<string, any> = new Map();

  async generateEmbedding(
    text: string,
    model: string,
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResult> {
    this.logger.log(
      `Generating local embedding for text (${text.length} chars) with model: ${model}`,
    );

    try {
      // Check if model is already cached
      let extractor = this.modelCache.get(model);
      if (!extractor) {
        this.logger.log(`🤖 Loading model: ${model}`);

        // Dynamic import of Xenova Transformers with eval to handle ES modules
        const transformers = await eval('import("@xenova/transformers")');
        const { pipeline } = transformers;

        // Load the feature extraction pipeline
        extractor = await pipeline('feature-extraction', model, {
          quantized: true, // Use quantized models for better performance
        });

        // Cache the model for future use
        this.modelCache.set(model, extractor);
        this.logger.log(`✅ Model ${model} cached for future use`);
      } else {
        this.logger.log(`♻️ Using cached model: ${model}`);
      }

      this.logger.log(`📊 Processing text with local model...`);

      // Validate text length to prevent stack overflow - BGE-M3 can handle ~400 tokens = ~1600 chars
      const maxTextLength = 1600; // Conservative limit for BGE-M3 model
      if (text.length > maxTextLength) {
        this.logger.warn(
          `⚠️ Text too long (${text.length} chars), truncating to ${maxTextLength} chars to prevent stack overflow for BGE-M3 model`,
        );
        text = text.substring(0, maxTextLength);
      }

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
        model: model,
        provider: EmbeddingProvider.LOCAL,
      };

      this.logger.log(
        `✅ Successfully generated local embedding: ${result.dimensions} dimensions`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to generate local embedding: ${error.message}`,
      );
      throw new Error(`Local embedding generation failed: ${error.message}`);
    }
  }

  getAvailableModels(): Promise<string[]> {
    return Promise.resolve([
      'Xenova/bge-m3',
      'mixedbread-ai/mxbai-embed-large-v1',
      'WhereIsAI/UAE-Large-V1',
    ]);
  }

  isServiceAvailable(): Promise<boolean> {
    // Local models should always be available
    return Promise.resolve(true);
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
