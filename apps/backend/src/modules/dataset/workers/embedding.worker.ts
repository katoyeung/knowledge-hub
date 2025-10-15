import { parentPort, workerData } from 'worker_threads';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';

interface EmbeddingTask {
  id: string;
  text: string;
  model: string;
  provider: string;
  customModelName?: string;
}

interface EmbeddingResult {
  id: string;
  embedding: number[];
  dimensions: number;
  model: string;
  error?: string;
}

class EmbeddingWorker {
  private modelCache: Map<string, any> = new Map();
  private workerId: number;

  constructor() {
    this.workerId = workerData.workerId;
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    if (!parentPort) {
      throw new Error('Worker must be run in a worker thread');
    }

    parentPort.on('message', async (task: EmbeddingTask) => {
      try {
        const result = await this.processEmbedding(task);
        parentPort!.postMessage(result);
      } catch (error) {
        const errorResult: EmbeddingResult = {
          id: task.id,
          embedding: [],
          dimensions: 0,
          model: task.model,
          error: error instanceof Error ? error.message : String(error),
        };
        parentPort!.postMessage(errorResult);
      }
    });
  }

  private async processEmbedding(
    task: EmbeddingTask,
  ): Promise<EmbeddingResult> {
    const { id, text, model, provider, customModelName } = task;

    try {
      // Check if model is already cached
      let extractor = this.modelCache.get(model);
      if (!extractor) {
        console.log(`[WORKER_${this.workerId}] Loading model: ${model}`);

        // Dynamic import of Xenova Transformers with eval to handle ES modules
        const transformers = await eval('import("@xenova/transformers")');
        const { pipeline } = transformers;

        // Load the feature extraction pipeline
        extractor = await pipeline('feature-extraction', model, {
          quantized: true, // Use quantized models for better performance
        });

        // Cache the model for future use
        this.modelCache.set(model, extractor);
        console.log(`[WORKER_${this.workerId}] Model ${model} cached`);
      }

      // Validate text length to prevent stack overflow
      const maxTextLength = 1600; // Conservative limit for BGE-M3 model
      let processedText = text;
      if (text.length > maxTextLength) {
        console.warn(
          `[WORKER_${this.workerId}] Text too long (${text.length} chars), truncating to ${maxTextLength} chars`,
        );
        processedText = text.substring(0, maxTextLength);
      }

      // Generate embedding
      const output = await extractor(processedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to regular array and ensure it's number[]
      const embedding: number[] = Array.from(output.data as Float32Array);

      const result: EmbeddingResult = {
        id,
        embedding,
        dimensions: embedding.length,
        model,
      };

      console.log(
        `[WORKER_${this.workerId}] Generated embedding: ${result.dimensions} dimensions`,
      );
      return result;
    } catch (error) {
      console.error(
        `[WORKER_${this.workerId}] Failed to generate embedding:`,
        error,
      );
      throw error;
    }
  }
}

// Initialize the worker
new EmbeddingWorker();
