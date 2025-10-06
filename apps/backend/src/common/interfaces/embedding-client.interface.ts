export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  provider: string;
}

export interface EmbeddingClient {
  generateEmbedding(
    text: string,
    model: string,
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResult>;

  getAvailableModels(): Promise<string[]>;

  isServiceAvailable(): Promise<boolean>;

  healthCheck(): Promise<boolean>;
}

export interface EmbeddingOptions {
  dimensions?: number;
  customModelName?: string;
  [key: string]: any;
}
