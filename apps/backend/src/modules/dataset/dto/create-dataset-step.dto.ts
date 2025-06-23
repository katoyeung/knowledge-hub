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

export enum EmbeddingModel {
  // 1024-Dimension Models Only (for consistency and compatibility)

  /** BGE-M3: Multilingual model, good for diverse languages */
  XENOVA_BGE_M3 = 'Xenova/bge-m3',

  /** MixedBread mxbai-embed-large-v1: High-quality English model (recommended) */
  MIXEDBREAD_MXBAI_EMBED_LARGE_V1 = 'mixedbread-ai/mxbai-embed-large-v1',

  /** UAE-Large-V1: Universal Angle Embedding, good for various tasks */
  WHEREISAI_UAE_LARGE_V1 = 'WhereIsAI/UAE-Large-V1',

  /** Custom model (user input - must be 1024 dimensions) */
  CUSTOM = 'custom',
}

export enum TextSplitter {
  RECURSIVE_CHARACTER = 'recursive_character',
  CHARACTER = 'character',
  TOKEN = 'token',
  MARKDOWN = 'markdown',
  PYTHON_CODE = 'python_code',
}

export enum RerankerType {
  MATHEMATICAL = 'mathematical',
  ML_CROSS_ENCODER = 'ml-cross-encoder',
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
  @Min(100, { message: 'Chunk size must be at least 100' })
  @Max(8000, { message: 'Chunk size must not exceed 8000' })
  chunkSize: number;

  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @Min(0, { message: 'Chunk overlap must be at least 0' })
  @Max(500, { message: 'Chunk overlap must not exceed 500' })
  chunkOverlap: number;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Embedding model provider must not exceed 255 characters',
  })
  embeddingModelProvider?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  separators?: string[];
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

  @IsEnum(TextSplitter, { message: 'Invalid text splitter' })
  textSplitter: TextSplitter;

  @IsNumber({}, { message: 'Chunk size must be a number' })
  @Min(100, { message: 'Chunk size must be at least 100' })
  @Max(8000, { message: 'Chunk size must not exceed 8000' })
  chunkSize: number;

  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @Min(0, { message: 'Chunk overlap must be at least 0' })
  @Max(500, { message: 'Chunk overlap must not exceed 500' })
  chunkOverlap: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  separators?: string[];

  // 🆕 Parent-Child Chunking Option
  @IsOptional()
  @IsBoolean()
  enableParentChildChunking?: boolean;
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
}
