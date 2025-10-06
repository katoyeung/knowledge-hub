import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { IsModelAwareChunkSize } from '../../../common/validators/model-aware-chunk-size.validator';
import { IsModelAwareChunkOverlap } from '../../../common/validators/model-aware-chunk-overlap.validator';
import { Transform } from 'class-transformer';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';

export enum EmbeddingModel {
  // Local Models (1024-Dimension Models Only for consistency and compatibility)

  /** BGE-M3: Multilingual model, good for diverse languages */
  XENOVA_BGE_M3 = 'Xenova/bge-m3',

  /** MixedBread mxbai-embed-large-v1: High-quality English model (recommended) */
  MIXEDBREAD_MXBAI_EMBED_LARGE_V1 = 'mixedbread-ai/mxbai-embed-large-v1',

  /** UAE-Large-V1: Universal Angle Embedding, good for various tasks */
  WHEREISAI_UAE_LARGE_V1 = 'WhereIsAI/UAE-Large-V1',

  // Ollama Models

  /** Qwen3 Embedding 0.6B (Ollama) - Recommended for Ollama */
  QWEN3_EMBEDDING_0_6B = 'qwen3-embedding:0.6b',

  /** Qwen3 Embedding 4B (Ollama) */
  QWEN3_EMBEDDING_4B = 'qwen3-embedding:4b',

  /** Embedding Gemma 300M (Ollama) */
  EMBEDDING_GEMMA_300M = 'embeddinggemma:300m',

  /** Nomic Embed Text v1.5 (Ollama) */
  NOMIC_EMBED_TEXT_V1_5 = 'nomic-embed-text:v1.5',

  // DashScope Models

  /** Text Embedding V1 (DashScope) */
  TEXT_EMBEDDING_V1 = 'text-embedding-v1',

  /** Text Embedding V2 (DashScope) */
  TEXT_EMBEDDING_V2 = 'text-embedding-v2',

  /** Text Embedding V3 (DashScope) */
  TEXT_EMBEDDING_V3 = 'text-embedding-v3',

  /** Text Embedding V4 (DashScope) - Recommended for DashScope */
  TEXT_EMBEDDING_V4 = 'text-embedding-v4',

  /** Custom model (user input - must be 1024 dimensions) */
  CUSTOM = 'custom',
}

export enum TextSplitter {
  RECURSIVE_CHARACTER = 'recursive_character',
  CHARACTER = 'character',
  TOKEN = 'token',
  SENTENCE_SPLITTER = 'sentence_splitter',
  SMART_CHUNKING = 'smart_chunking',
  MARKDOWN = 'markdown',
  PYTHON_CODE = 'python_code',
}

/**
 * Model-specific default configurations for optimal performance
 */
export const EMBEDDING_MODEL_DEFAULTS = {
  [EmbeddingModel.XENOVA_BGE_M3]: {
    recommendedChunkSize: 2400, // Characters - BGE M3 works well with larger chunks
    recommendedChunkOverlap: 240, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 800, // Approximate token limit for optimal performance
    description:
      'BGE M3 works best with larger chunks (2400+ chars) for better semantic understanding',
  },
  [EmbeddingModel.MIXEDBREAD_MXBAI_EMBED_LARGE_V1]: {
    recommendedChunkSize: 1200, // Characters - Good balance for English text
    recommendedChunkOverlap: 120, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 400, // Approximate token limit
    description:
      'MixedBread model optimized for English text with moderate chunk sizes',
  },
  [EmbeddingModel.WHEREISAI_UAE_LARGE_V1]: {
    recommendedChunkSize: 1000, // Characters - Standard size
    recommendedChunkOverlap: 100, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 300, // Approximate token limit
    description:
      'UAE model works well with standard chunk sizes for various tasks',
  },
  // Ollama Models
  [EmbeddingModel.QWEN3_EMBEDDING_0_6B]: {
    recommendedChunkSize: 8000, // Characters - Large context window
    recommendedChunkOverlap: 800, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 2000, // Large context window
    description: 'Qwen3 0.6B optimized for large context with 32K token window',
  },
  [EmbeddingModel.QWEN3_EMBEDDING_4B]: {
    recommendedChunkSize: 10000, // Characters - Very large context
    recommendedChunkOverlap: 1000, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 2500, // Very large context window
    description: 'Qwen3 4B optimized for very large context with high quality',
  },
  [EmbeddingModel.EMBEDDING_GEMMA_300M]: {
    recommendedChunkSize: 1500, // Characters - Lightweight model
    recommendedChunkOverlap: 150, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 375, // Smaller context window
    description:
      'Embedding Gemma 300M optimized for efficiency with smaller chunks',
  },
  [EmbeddingModel.NOMIC_EMBED_TEXT_V1_5]: {
    recommendedChunkSize: 3000, // Characters - Balanced approach
    recommendedChunkOverlap: 300, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 750, // Balanced context window
    description: 'Nomic Embed Text v1.5 optimized for balanced performance',
  },
  // DashScope Models
  [EmbeddingModel.TEXT_EMBEDDING_V1]: {
    recommendedChunkSize: 2000, // Characters - Standard DashScope
    recommendedChunkOverlap: 200, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 500, // Standard context window
    description: 'DashScope Text Embedding V1 optimized for cloud processing',
  },
  [EmbeddingModel.TEXT_EMBEDDING_V2]: {
    recommendedChunkSize: 2500, // Characters - Improved version
    recommendedChunkOverlap: 250, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 625, // Improved context window
    description: 'DashScope Text Embedding V2 with improved performance',
  },
  [EmbeddingModel.TEXT_EMBEDDING_V3]: {
    recommendedChunkSize: 3000, // Characters - Enhanced version
    recommendedChunkOverlap: 300, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 750, // Enhanced context window
    description: 'DashScope Text Embedding V3 with enhanced capabilities',
  },
  [EmbeddingModel.TEXT_EMBEDDING_V4]: {
    recommendedChunkSize: 4000, // Characters - Latest version
    recommendedChunkOverlap: 400, // 10% of chunk size
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 1000, // Large context window
    description: 'DashScope Text Embedding V4 - latest and most capable model',
  },
  [EmbeddingModel.CUSTOM]: {
    recommendedChunkSize: 1000, // Default fallback
    recommendedChunkOverlap: 100,
    recommendedTextSplitter: TextSplitter.SMART_CHUNKING,
    maxTokens: 300,
    description: 'Custom model - adjust settings based on model specifications',
  },
} as const;

/**
 * Get model-specific default configuration
 */
export function getModelDefaults(model: EmbeddingModel) {
  return (
    EMBEDDING_MODEL_DEFAULTS[model] ||
    EMBEDDING_MODEL_DEFAULTS[EmbeddingModel.CUSTOM]
  );
}

/**
 * Get effective chunk size based on model and user configuration
 */
export function getEffectiveChunkSize(
  userChunkSize: number,
  model: EmbeddingModel,
  useModelDefaults: boolean = true,
): number {
  if (!useModelDefaults) {
    return userChunkSize;
  }

  const modelDefaults = getModelDefaults(model);
  return Math.max(userChunkSize, modelDefaults.recommendedChunkSize);
}

/**
 * Get effective chunk overlap based on model and user configuration
 */
export function getEffectiveChunkOverlap(
  userChunkOverlap: number,
  model: EmbeddingModel,
  effectiveChunkSize: number,
  useModelDefaults: boolean = true,
): number {
  if (!useModelDefaults) {
    return userChunkOverlap;
  }

  const recommendedOverlap = Math.floor(effectiveChunkSize * 0.1);
  return Math.min(userChunkOverlap, recommendedOverlap);
}

export enum RerankerType {
  MATHEMATICAL = 'mathematical',
  ML_CROSS_ENCODER = 'ml-cross-encoder',
  NONE = 'none',
}

export class CreateDatasetStepOneDto {
  @IsString()
  @MinLength(1, { message: 'Dataset name cannot be empty' })
  @MaxLength(255, { message: 'Dataset name must not exceed 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;
}

export class CreateDatasetStepTwoDto {
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId: string;

  @IsEnum(EmbeddingModel, { message: 'Invalid embedding model' })
  embeddingModel: EmbeddingModel;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  customModelName?: string;

  @IsEnum(TextSplitter, { message: 'Invalid text splitter' })
  textSplitter: TextSplitter;

  @IsNumber({}, { message: 'Chunk size must be a number' })
  @IsModelAwareChunkSize()
  chunkSize: number;

  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @IsModelAwareChunkOverlap()
  chunkOverlap: number;

  @IsOptional()
  @IsEnum(EmbeddingProvider, { message: 'Invalid embedding provider' })
  embeddingModelProvider?: EmbeddingProvider;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  separators?: string[];

  // 🆕 Search Weight Configuration
  @IsOptional()
  @IsNumber({}, { message: 'BM25 weight must be a number' })
  @Min(0, { message: 'BM25 weight must be at least 0' })
  @Max(1, { message: 'BM25 weight must not exceed 1' })
  bm25Weight?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Embedding weight must be a number' })
  @Min(0, { message: 'Embedding weight must be at least 0' })
  @Max(1, { message: 'Embedding weight must not exceed 1' })
  embeddingWeight?: number;

  // 🆕 Model-specific optimization settings
  @IsOptional()
  @IsBoolean()
  useModelDefaults?: boolean;
}

export class ProcessDocumentsDto {
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId: string;

  @IsArray()
  @IsUUID(4, { each: true, message: 'Document IDs must be valid UUIDs' })
  documentIds: string[];

  @IsEnum(EmbeddingModel, { message: 'Invalid embedding model' })
  embeddingModel: EmbeddingModel;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  customModelName?: string;

  @IsOptional()
  @IsEnum(EmbeddingProvider, { message: 'Invalid embedding provider' })
  embeddingProvider?: EmbeddingProvider;

  @IsEnum(TextSplitter, { message: 'Invalid text splitter' })
  textSplitter: TextSplitter;

  @IsNumber({}, { message: 'Chunk size must be a number' })
  @IsModelAwareChunkSize()
  chunkSize: number;

  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @IsModelAwareChunkOverlap()
  chunkOverlap: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  separators?: string[];

  // 🆕 Parent-Child Chunking Option
  @IsOptional()
  @IsBoolean()
  enableParentChildChunking?: boolean;

  // 🆕 Search Weight Configuration
  @IsOptional()
  @IsNumber({}, { message: 'BM25 weight must be a number' })
  @Min(0, { message: 'BM25 weight must be at least 0' })
  @Max(1, { message: 'BM25 weight must not exceed 1' })
  bm25Weight?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Embedding weight must be a number' })
  @Min(0, { message: 'Embedding weight must be at least 0' })
  @Max(1, { message: 'Embedding weight must not exceed 1' })
  embeddingWeight?: number;

  // 🆕 Model-specific optimization settings
  @IsOptional()
  @IsBoolean()
  useModelDefaults?: boolean;

  // 🆕 Number of chunks to retrieve
  @IsOptional()
  @IsNumber({}, { message: 'Number of chunks must be a number' })
  @Min(1, { message: 'Number of chunks must be at least 1' })
  @Max(20, { message: 'Number of chunks must not exceed 20' })
  numChunks?: number;

  // 🆕 LangChain RAG Configuration
  @IsOptional()
  @IsBoolean()
  enableLangChainRAG?: boolean;

  @IsOptional()
  @IsString()
  langChainConfig?: string; // JSON string containing LangChain configuration

  // 🆕 Configuration Mode
  @IsOptional()
  @IsEnum(['langchain', 'advanced'], {
    message: 'Configuration mode must be either langchain or advanced',
  })
  configMode?: 'langchain' | 'advanced';
}

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Dataset name must not exceed 255 characters' })
  datasetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Dataset description must not exceed 1000 characters',
  })
  datasetDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Data source type must not exceed 255 characters',
  })
  dataSourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Created from must not exceed 255 characters' })
  createdFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Document type must not exceed 255 characters' })
  docType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Document form must not exceed 255 characters' })
  docForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Document language must not exceed 255 characters',
  })
  docLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Batch must not exceed 255 characters' })
  batch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Dataset ID must not exceed 255 characters' })
  datasetId?: string;

  // 🆕 LangChain RAG Configuration
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  enableLangChainRAG?: boolean;

  @IsOptional()
  @IsString()
  langChainConfig?: string; // JSON string containing LangChain configuration
}

export class SearchDocumentsDto {
  @IsUUID(4, { message: 'Document ID must be a valid UUID' })
  documentId: string;

  @IsString()
  @MinLength(1, { message: 'Query cannot be empty' })
  @MaxLength(1000, { message: 'Query must not exceed 1000 characters' })
  query: string;

  @IsOptional()
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must not exceed 100' })
  limit?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Similarity threshold must be a number' })
  @Min(0, { message: 'Similarity threshold must be at least 0' })
  @Max(1, { message: 'Similarity threshold must not exceed 1' })
  similarityThreshold?: number;

  @IsOptional()
  @IsEnum(RerankerType, { message: 'Invalid reranker type' })
  rerankerType?: RerankerType;

  // 🆕 Search Weight Configuration
  @IsOptional()
  @IsNumber({}, { message: 'BM25 weight must be a number' })
  @Min(0, { message: 'BM25 weight must be at least 0' })
  @Max(1, { message: 'BM25 weight must not exceed 1' })
  bm25Weight?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Embedding weight must be a number' })
  @Min(0, { message: 'Embedding weight must be at least 0' })
  @Max(1, { message: 'Embedding weight must not exceed 1' })
  embeddingWeight?: number;

  // 🆕 Model-specific optimization settings
  @IsOptional()
  @IsBoolean()
  useModelDefaults?: boolean;
}
