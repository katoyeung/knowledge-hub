import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Dataset } from '../entities/dataset.entity';
import { EmbeddingV2Service } from './embedding-v2.service';
import { ModelMappingService } from '../../../common/services/model-mapping.service';
import {
  ApiClientFactory,
  LLMProvider,
} from '../../../common/services/api-client-factory.service';
import { LLMMessage } from '../../../common/interfaces/llm-client.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface LangChainConfig {
  chunkSize: number;
  chunkOverlap: number;
  numChunks: number;
  llmProvider: string;
  llmModel: string;
  embeddingModel: string;
}

export interface LangChainRAGResult {
  success: boolean;
  message: string;
  ragChainId?: string;
  vectorStorePath?: string;
  processedSegments?: number;
}

@Injectable()
export class LangChainRAGService {
  private readonly logger = new Logger(LangChainRAGService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly apiClientFactory: ApiClientFactory,
    private readonly modelMappingService: ModelMappingService,
  ) {}

  async processDocumentsWithLangChainRAG(
    datasetId: string,
    documentIds: string[],
    config: LangChainConfig,
    userId: string,
  ): Promise<LangChainRAGResult> {
    try {
      this.logger.log(
        `🚀 Starting LangChain RAG processing for dataset ${datasetId}`,
      );

      // Get dataset and documents
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
      });

      if (!dataset) {
        throw new Error('Dataset not found');
      }

      const documents = await this.documentRepository.find({
        where: { id: In(documentIds), datasetId },
      });

      if (documents.length === 0) {
        throw new Error('No documents found');
      }

      // Process each document
      const allSegments: DocumentSegment[] = [];
      const chunk2source: Map<string, string> = new Map();

      for (const document of documents) {
        this.logger.log(`📄 Processing document: ${document.name}`);

        // Read file content
        const filePath = path.join(
          process.cwd(),
          'uploads',
          'documents',
          document.fileId,
        );

        const content = await fs.readFile(filePath, 'utf-8');

        // Split text into chunks using LangChain-style chunking
        const chunks = await this.splitTextIntoChunks(content, config);

        // Create document segments for each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const segment = this.segmentRepository.create({
            documentId: document.id,
            datasetId: dataset.id,
            position: i + 1,
            content: chunk.text,
            wordCount: chunk.text.split(/\s+/).length,
            tokens: this.estimateTokens(chunk.text),
            keywords: {
              ...chunk.metadata,
              langChainChunk: true,
              chunkIndex: i,
              totalChunks: chunks.length,
            },
            userId,
          });

          const savedSegment = await this.segmentRepository.save(segment);
          allSegments.push(savedSegment);

          // Store chunk to source mapping
          chunk2source.set(chunk.text, `${document.name} - chunk ${i + 1}`);
        }

        // Update document status
        await this.documentRepository.update(document.id, {
          indexingStatus: 'completed',
          completedAt: new Date(),
        });
      }

      // Generate embeddings for all segments
      this.logger.log(
        `🔄 Generating embeddings for ${allSegments.length} segments`,
      );

      for (const segment of allSegments) {
        try {
          const embeddingResult = await this.embeddingService.generateEmbedding(
            segment.content,
            this.mapEmbeddingModel(config.embeddingModel),
          );

          // Store embedding in segment keywords
          segment.keywords = {
            ...segment.keywords,
            embedding: embeddingResult.embedding,
            embeddingModel: embeddingResult.model,
            embeddingDimensions: embeddingResult.dimensions,
          };

          await this.segmentRepository.save(segment);
        } catch (error) {
          this.logger.error(
            `Failed to generate embedding for segment ${segment.id}:`,
            error,
          );
        }
      }

      // Create vector store metadata
      const vectorStorePath = path.join(
        process.cwd(),
        'uploads',
        'vector-stores',
        `${datasetId}-langchain-rag.json`,
      );

      const vectorStoreData = {
        datasetId,
        config,
        segments: allSegments.map((segment) => ({
          id: segment.id,
          content: segment.content,
          metadata: segment.keywords,
        })),
        chunk2source: Object.fromEntries(chunk2source),
        createdAt: new Date().toISOString(),
      };

      // Ensure directory exists
      await fs.mkdir(path.dirname(vectorStorePath), { recursive: true });
      await fs.writeFile(
        vectorStorePath,
        JSON.stringify(vectorStoreData, null, 2),
      );

      this.logger.log(`✅ LangChain RAG processing completed successfully`);

      return {
        success: true,
        message: `Successfully processed ${documents.length} documents with LangChain RAG`,
        ragChainId: `${datasetId}-langchain-rag`,
        vectorStorePath,
        processedSegments: allSegments.length,
      };
    } catch (error) {
      this.logger.error(`❌ LangChain RAG processing failed:`, error);
      return {
        success: false,
        message: `LangChain RAG processing failed: ${error.message}`,
      };
    }
  }

  async queryWithLangChainRAG(
    datasetId: string,
    query: string,
    config: LangChainConfig,
  ): Promise<{
    answer: string;
    sourceChunks: Array<{
      content: string;
      source: string;
      similarity: number;
    }>;
  }> {
    try {
      this.logger.log(`🔍 Querying LangChain RAG for dataset ${datasetId}`);

      // Load vector store data
      const vectorStorePath = path.join(
        process.cwd(),
        'uploads',
        'vector-stores',
        `${datasetId}-langchain-rag.json`,
      );

      const vectorStoreData = JSON.parse(
        await fs.readFile(vectorStorePath, 'utf-8'),
      );

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(
        query,
        this.mapEmbeddingModel(config.embeddingModel),
      );

      // Find similar chunks
      const similarities = this.embeddingService.findSimilarEmbeddings(
        queryEmbedding.embedding,
        vectorStoreData.segments.map((segment: any) => ({
          id: segment.id,
          content: segment.content,
          embedding: segment.metadata.embedding,
        })),
        config.numChunks,
        0.0,
      );

      // Get source information
      const sourceChunks = similarities.map((sim: any) => ({
        content: sim.content,
        source: vectorStoreData.chunk2source[sim.content] || 'Unknown source',
        similarity: sim.similarity,
      }));

      // Prepare context for LLM
      const context = sourceChunks
        .map(
          (chunk: any, index: number) =>
            `Context ${index + 1}:\n${chunk.content}`,
        )
        .join('\n\n');

      // Generate answer using LLM
      const llmClient = this.apiClientFactory.getLLMClient(
        this.mapLLMProvider(config.llmProvider),
      );

      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `You are a helpful assistant that answers questions based on the provided context. 
          Use the context information to provide accurate and helpful answers. 
          If the context doesn't contain enough information to answer the question, say so.
          
          Context:
          ${context}`,
        },
        {
          role: 'user',
          content: query,
        },
      ];

      const response = await llmClient.chatCompletion(
        messages,
        config.llmModel,
      );

      const answer = response.data.choices[0].message.content;

      return {
        answer,
        sourceChunks,
      };
    } catch (error) {
      this.logger.error(`❌ LangChain RAG query failed:`, error);
      throw new Error(`LangChain RAG query failed: ${error.message}`);
    }
  }

  private async splitTextIntoChunks(
    text: string,
    config: LangChainConfig,
  ): Promise<Array<{ text: string; metadata: any }>> {
    // Simple character-based chunking (similar to LangChain's CharacterTextSplitter)
    const chunks: Array<{ text: string; metadata: any }> = [];
    const separators = ['\n\n', '\n', ' ', ''];

    let currentChunk = '';
    let chunkIndex = 0;

    for (let i = 0; i < text.length; i++) {
      currentChunk += text[i];

      // Check if we should split
      if (currentChunk.length >= config.chunkSize) {
        // Try to split at a good boundary
        let splitIndex = currentChunk.length;
        for (const separator of separators) {
          const lastIndex = currentChunk.lastIndexOf(separator);
          if (lastIndex > config.chunkSize - config.chunkOverlap) {
            splitIndex = lastIndex;
            break;
          }
        }

        const chunkText = currentChunk.substring(0, splitIndex).trim();
        if (chunkText.length > 0) {
          chunks.push({
            text: chunkText,
            metadata: {
              chunkIndex,
              chunkSize: chunkText.length,
              separator:
                separators.find((s) => chunkText.includes(s)) || 'character',
            },
          });
          chunkIndex++;
        }

        // Keep overlap
        currentChunk = currentChunk.substring(splitIndex - config.chunkOverlap);
      }
    }

    // Add remaining text as final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          chunkIndex,
          chunkSize: currentChunk.trim().length,
          separator: 'end',
        },
      });
    }

    // Remove duplicate chunks (same content)
    const uniqueChunks = [];
    const seenContent = new Set();

    for (const chunk of chunks) {
      const trimmedText = chunk.text.trim();
      if (trimmedText.length > 0 && !seenContent.has(trimmedText)) {
        seenContent.add(trimmedText);
        uniqueChunks.push(chunk);
      }
    }

    return uniqueChunks;
  }

  /**
   * Map embedding model using centralized model mapping service
   * This ensures consistency across all services
   */
  private mapEmbeddingModel(modelName: string): any {
    // Try to find the embedding model enum from the model name
    const embeddingModel =
      this.modelMappingService.getEmbeddingModelFromStoredName(modelName);

    if (embeddingModel) {
      // Return the local provider name for consistency
      return this.modelMappingService.getModelName(
        embeddingModel,
        'local' as any,
      );
    }

    // Fallback to common mappings
    const commonMappings: Record<string, string> = {
      'BAAI/bge-m3': 'Xenova/bge-m3',
      'mixedbread-ai/mxbai-embed-large-v1':
        'mixedbread-ai/mxbai-embed-large-v1',
      'WhereIsAI/UAE-Large-V1': 'WhereIsAI/UAE-Large-V1',
    };

    return commonMappings[modelName] || 'Xenova/bge-m3';
  }

  private mapLLMProvider(provider: string): LLMProvider {
    const providerMap: Record<string, LLMProvider> = {
      'local-direct': LLMProvider.LOCAL_DIRECT,
      openrouter: LLMProvider.OPENROUTER,
      ollama: LLMProvider.OLLAMA,
      dashscope: LLMProvider.DASHSCOPE,
    };

    return providerMap[provider] || LLMProvider.LOCAL_DIRECT;
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (rough approximation)
    return Math.ceil(text.length / 4);
  }
}
