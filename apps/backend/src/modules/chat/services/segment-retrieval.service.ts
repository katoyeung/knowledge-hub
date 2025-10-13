import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DatasetService } from '../../dataset/dataset.service';
import { DocumentSegmentService } from '../../dataset/document-segment.service';
import { DocumentService } from '../../dataset/document.service';
import { HybridSearchService } from '../../dataset/services/hybrid-search.service';
import { EmbeddingV2Service } from '../../dataset/services/embedding-v2.service';
import {
  EmbeddingModel,
  RerankerType,
} from '../../dataset/dto/create-dataset-step.dto';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';
import { DebugLogger } from '../../../common/services/debug-logger.service';

@Injectable()
export class SegmentRetrievalService {
  private readonly logger = new Logger(SegmentRetrievalService.name);

  constructor(
    private readonly datasetService: DatasetService,
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly documentService: DocumentService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly debugLogger: DebugLogger,
  ) {}

  async retrieveRelevantSegments(
    datasetId: string,
    query: string,
    documentIds?: string[],
    segmentIds?: string[],
    maxChunks: number = 10,
  ): Promise<
    Array<{
      id: string;
      content: string;
      similarity?: number;
      segment?: any;
      documentId?: string;
    }>
  > {
    this.logger.log(`🔍 Retrieving relevant segments for query: "${query}"`);

    // If specific segments are provided, use them
    if (segmentIds && segmentIds.length > 0) {
      return this.retrieveSpecificSegments(segmentIds, query, maxChunks);
    }

    // If specific documents are provided, search within them
    if (documentIds && documentIds.length > 0) {
      return this.retrieveFromSpecificDocuments(documentIds, query, maxChunks);
    }

    // If documentIds is an empty array, return no results (no documents selected)
    if (documentIds && documentIds.length === 0) {
      this.logger.log('📝 No documents selected, returning empty results');
      return [];
    }

    // Search across all documents in the dataset (only when documentIds is undefined)
    return this.retrieveFromAllDocuments(datasetId, query, maxChunks);
  }

  private async retrieveSpecificSegments(
    segmentIds: string[],
    query: string,
    maxChunks: number,
  ): Promise<
    Array<{
      id: string;
      content: string;
      similarity?: number;
      documentId?: string;
    }>
  > {
    this.debugLogger.logSegmentRetrieval('specific-segments', {
      segmentIds,
      query,
      maxChunks,
    });

    const segments = await this.documentSegmentService.find({
      where: { id: In(segmentIds) },
      relations: ['document'],
    });

    // Calculate actual similarity scores for specific segments
    const segmentsWithSimilarity = await Promise.all(
      segments.map(async (segment) => {
        // Generate query embedding for similarity calculation
        const queryEmbedding = await this.generateQueryEmbedding(
          query,
          segment.datasetId,
        );
        if (!queryEmbedding) {
          return {
            id: segment.id,
            content: segment.content,
            documentId: segment.documentId,
            similarity: 0.5, // Default fallback similarity
          };
        }

        // Get segment embedding and calculate similarity
        const segmentEmbedding = await this.getSegmentEmbedding(segment.id);
        if (!segmentEmbedding) {
          return {
            id: segment.id,
            content: segment.content,
            documentId: segment.documentId,
            similarity: 0.5, // Default fallback similarity
          };
        }

        const similarity = this.calculateCosineSimilarity(
          queryEmbedding,
          segmentEmbedding,
        );

        return {
          id: segment.id,
          content: segment.content,
          documentId: segment.documentId,
          similarity: Math.max(0, Math.min(1, similarity)), // Clamp between 0 and 1
        };
      }),
    );

    return segmentsWithSimilarity.slice(0, maxChunks);
  }

  private async retrieveFromSpecificDocuments(
    documentIds: string[],
    query: string,
    maxChunks: number,
  ): Promise<
    Array<{
      id: string;
      content: string;
      similarity?: number;
      documentId?: string;
    }>
  > {
    this.debugLogger.logSegmentRetrieval('specific-documents', {
      documentIds,
      query,
      maxChunks,
    });

    const allSegments = [];
    for (const documentId of documentIds) {
      const searchResults = await this.hybridSearchService.hybridSearch(
        documentId,
        query,
        maxChunks,
        0.7, // semanticWeight
        0.3, // keywordWeight
        RerankerType.MATHEMATICAL, // rerankerType - use mathematical reranker instead
      );
      // Add documentId to each search result
      const resultsWithDocumentId =
        searchResults?.results?.map((result) => ({
          ...result,
          documentId: documentId,
          semanticScore: result.similarity, // Map similarity to semanticScore for consistency
        })) || [];
      allSegments.push(...resultsWithDocumentId);
    }
    return allSegments.slice(0, maxChunks);
  }

  private async retrieveFromAllDocuments(
    datasetId: string,
    query: string,
    maxChunks: number,
  ): Promise<
    Array<{
      id: string;
      content: string;
      similarity?: number;
      documentId?: string;
    }>
  > {
    this.debugLogger.logSegmentRetrieval('all-documents-start', {
      datasetId,
      query,
      maxChunks,
    });

    const dataset = await this.datasetService.findById(datasetId);
    this.logger.log(`🔍 Dataset found: ${dataset ? 'Yes' : 'No'}`);

    // If documents relation is not loaded, fetch them directly
    let documents = dataset?.documents;
    this.logger.log(
      `📄 Documents from dataset relation: ${documents?.length || 0}`,
    );

    if (!documents || documents.length === 0) {
      this.logger.log('📄 Fetching documents directly from database');
      documents = await this.documentService.findByDatasetId(datasetId);
      this.logger.log(`📄 Fetched ${documents.length} documents`);

      // Debug: Log document details
      documents.forEach((doc, index) => {
        this.logger.log(
          `📄 Document ${index + 1}: ${doc.name} (${doc.id}) - Status: ${doc.indexingStatus}`,
        );
      });
    }

    if (!documents || documents.length === 0) {
      this.logger.warn('❌ No documents found in dataset');
      this.debugLogger.logSegmentRetrieval('no-documents-found', {
        datasetId,
        documentsCount: documents ? documents.length : 'null',
      });
      return [];
    }

    this.debugLogger.logSegmentRetrieval('documents-found', {
      datasetId,
      documentsCount: documents.length,
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.indexingStatus,
      })),
    });

    // Search across all documents in the dataset
    this.logger.log(`🔍 Searching across ${documents.length} documents`);

    const allSegments = [];
    this.logger.log(`🔍 Processing ${documents.length} documents:`);

    for (const document of documents) {
      this.debugLogger.logSegmentRetrieval('processing-document', {
        documentId: document.id,
        documentName: document.name,
        documentStatus: document.indexingStatus,
      });

      this.logger.log(
        `🔍 Searching document: ${document.name} (${document.id}) - Status: ${document.indexingStatus}`,
      );

      // Skip documents that are not completed
      if (document.indexingStatus !== 'completed') {
        this.logger.warn(
          `⚠️ Skipping document ${document.name} - Status: ${document.indexingStatus}`,
        );
        continue;
      }

      let searchResults;
      try {
        // Use only semantic search (like Python script) - no hybrid fallback
        try {
          this.logger.log(
            `🧠 Using semantic-only search for ${document.name} (matching Python implementation)...`,
          );

          this.debugLogger.logSegmentRetrieval('before-search-call', {
            documentId: document.id,
            documentName: document.name,
            query: query,
            maxChunks: maxChunks,
          });

          searchResults = await this.hybridSearchService.semanticOnlySearch(
            document.id,
            query,
            maxChunks,
            0.0, // No threshold filtering - just take top K results
          );

          this.debugLogger.logSegmentRetrieval('after-search-call', {
            documentId: document.id,
            documentName: document.name,
            searchResultsCount: searchResults
              ? searchResults.results.length
              : 'null',
            searchResults: searchResults
              ? searchResults.results.map((r) => ({
                  id: r.id,
                  content: r.content.substring(0, 100) + '...',
                  similarity: r.similarity,
                }))
              : 'null',
          });

          // Try hybrid search as fallback if semantic search returns no results
          if (
            !searchResults ||
            !searchResults.results ||
            searchResults.results.length === 0
          ) {
            this.logger.warn(
              `⚠️ Semantic search returned no results for ${document.name} - trying hybrid search fallback`,
            );

            try {
              // Use dataset's weight settings if available, otherwise use defaults
              const semanticWeight = dataset?.embeddingWeight || 0.7;
              const keywordWeight = dataset?.bm25Weight || 0.3;

              this.logger.log(
                `🔍 Using dataset weights: semantic=${semanticWeight}, keyword=${keywordWeight}`,
              );

              const hybridResults = await this.hybridSearchService.hybridSearch(
                document.id,
                query,
                maxChunks,
                semanticWeight,
                keywordWeight,
                RerankerType.MATHEMATICAL,
              );

              if (hybridResults.results && hybridResults.results.length > 0) {
                this.logger.log(
                  `✅ Hybrid search fallback found ${hybridResults.results.length} results for ${document.name}`,
                );
                searchResults = hybridResults;
              } else {
                this.logger.warn(
                  `❌ Hybrid search fallback also returned no results for ${document.name}`,
                );
              }
            } catch (hybridError) {
              this.logger.error(
                `❌ Hybrid search fallback failed for ${document.name}: ${hybridError.message}`,
              );
            }
          }

          this.logger.log(
            `✅ Search successful for ${document.name} - found ${searchResults?.results?.length || 0} results`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Search failed for ${document.name}: ${error.message}`,
          );
          // Create empty results instead of failing completely
          searchResults = {
            results: [],
            query,
            count: 0,
            message: `Search failed: ${error.message}`,
          };
        }
        this.logger.log(
          `📊 Found ${searchResults?.results?.length || 0} segments in ${document.name}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Hybrid search failed for document ${document.name}: ${error.message}`,
        );
        continue;
      }
      if (searchResults?.results?.length > 0) {
        this.logger.log(
          `  First segment preview: ${searchResults.results[0].content.substring(0, 100)}...`,
        );
      }
      // Add documentId to each search result
      const resultsWithDocumentId =
        searchResults?.results?.map((result) => ({
          ...result,
          documentId: document.id,
          semanticScore: result.similarity, // Map similarity to semanticScore for consistency
        })) || [];
      allSegments.push(...resultsWithDocumentId);
    }

    this.logger.log(`📊 Found ${allSegments.length} segments`);

    // Debug: Log all segments found
    allSegments.forEach((segment, index) => {
      this.logger.log(
        `🔍 Segment ${index + 1}: similarity=${segment.similarity}, content=${segment.content.substring(0, 100)}...`,
      );
    });

    // Remove duplicate segments (same content) before sorting
    const uniqueSegments = [];
    const seenContent = new Set();

    for (const segment of allSegments) {
      const trimmedContent = segment.content.trim();
      if (!seenContent.has(trimmedContent)) {
        seenContent.add(trimmedContent);
        uniqueSegments.push(segment);
      }
    }

    this.logger.log(
      `🔍 After deduplication: ${uniqueSegments.length} unique segments`,
    );

    // Sort segments by similarity score (highest first) before final selection
    const sortedSegments = uniqueSegments.sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0),
    );

    // Take top K segments by similarity (no quality filtering)
    const finalSegments = sortedSegments.slice(0, maxChunks);

    this.logger.log(
      `🔍 Selected top ${finalSegments.length} segments by similarity (no quality filtering)`,
    );

    this.logger.log(`🎯 Returning ${finalSegments.length} final segments`);

    // Debug: Log final segments
    finalSegments.forEach((segment, index) => {
      this.logger.log(
        `🎯 Final segment ${index + 1}: similarity=${segment.similarity}, content=${segment.content.substring(0, 100)}...`,
      );
    });

    return finalSegments;
  }

  /**
   * Generate query embedding for similarity calculation
   * Uses the dataset's embedding configuration for consistency
   */
  private async generateQueryEmbedding(
    query: string,
    datasetId: string,
  ): Promise<number[] | null> {
    try {
      // Get dataset to retrieve embedding configuration
      const dataset = await this.datasetService.findById(datasetId);
      if (!dataset) {
        this.logger.warn(
          `Dataset ${datasetId} not found, using fallback embedding config`,
        );
        return this.generateQueryEmbeddingWithFallback(query);
      }

      // Use dataset's embedding configuration
      const embeddingModel = dataset.embeddingModel as EmbeddingModel;
      const embeddingProvider =
        (dataset.embeddingModelProvider as EmbeddingProvider) ||
        EmbeddingProvider.LOCAL;

      this.logger.log(
        `Using dataset embedding config: model=${embeddingModel}, provider=${embeddingProvider}`,
      );

      const result = await this.embeddingService.generateEmbedding(
        query,
        embeddingModel,
        embeddingProvider,
      );
      return result.embedding;
    } catch (error) {
      this.logger.warn(
        `Failed to generate query embedding with dataset config: ${error.message}`,
      );
      // Fallback to default configuration
      return this.generateQueryEmbeddingWithFallback(query);
    }
  }

  /**
   * Fallback method for query embedding generation
   */
  private async generateQueryEmbeddingWithFallback(
    query: string,
  ): Promise<number[] | null> {
    try {
      this.logger.log('Using fallback embedding configuration');
      const result = await this.embeddingService.generateEmbedding(
        query,
        EmbeddingModel.XENOVA_BGE_M3, // Use a model that's actually available in LocalEmbeddingClient
        EmbeddingProvider.LOCAL,
      );
      return result.embedding;
    } catch (error) {
      this.logger.error(
        `Failed to generate query embedding with fallback: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get segment embedding from database
   */
  private async getSegmentEmbedding(
    segmentId: string,
  ): Promise<number[] | null> {
    try {
      const segment = await this.documentSegmentService.findOne({
        where: { id: segmentId },
        relations: ['embedding'],
      });

      if (segment?.embedding?.embedding) {
        return segment.embedding.embedding;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get segment embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      this.logger.warn(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
