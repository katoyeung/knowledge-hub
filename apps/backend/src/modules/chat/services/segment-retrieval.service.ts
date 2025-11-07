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
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

@Injectable()
export class SegmentRetrievalService {
  private readonly logger = new Logger(SegmentRetrievalService.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bm25Weight?: number, // Unused but kept for API compatibility
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    embeddingWeight?: number, // Unused but kept for API compatibility
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

    // If specific documents are provided, use optimized dataset-wide search
    // This is more efficient than searching per-document
    if (documentIds && documentIds.length > 0) {
      return this.retrieveFromSpecificDocumentsOptimized(
        datasetId,
        documentIds,
        query,
        maxChunks,
      );
    }

    // If documentIds is undefined or empty array, search across all documents in the dataset
    // Empty array means "all documents selected" (optimization: frontend doesn't send all IDs)
    // Use optimized dataset-wide search for better results
    this.logger.log(
      `🔍 Searching across all documents in dataset (documentIds: ${documentIds ? 'empty/undefined' : 'undefined'})`,
    );
    const segments = await this.retrieveFromAllDocumentsOptimized(
      datasetId,
      query,
      maxChunks,
    );
    this.logger.log(
      `🎯 Retrieved ${segments.length} segments from dataset-wide search`,
    );
    return segments;
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

    // Load segments without embeddings - we'll use vector search for similarity
    const segments = await this.documentSegmentService.find({
      where: { id: In(segmentIds) },
      relations: ['document'],
      // Don't load embeddings - use vector search instead
    });

    if (segments.length === 0) {
      return [];
    }

    // Get dataset ID from first segment
    const datasetId = segments[0].datasetId;

    // Generate query embedding once for all segments
    const queryEmbedding = await this.generateQueryEmbedding(query, datasetId);

    if (!queryEmbedding) {
      // Fallback: return segments with default similarity
      return segments.slice(0, maxChunks).map((segment) => ({
        id: segment.id,
        content: segment.content,
        documentId: segment.documentId,
        similarity: 0.5,
      }));
    }

    // Use PostgreSQL vector search to get similarities for all segments at once
    // This is much more efficient than loading embeddings one by one
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

    // Get dataset embedding model
    const dataset = await this.datasetService.findById(datasetId);
    const modelName = dataset?.embeddingModel || 'qwen3-embedding:0.6b';

    // Use vector search to get similarities
    // Build IN clause safely
    const segmentIdsPlaceholders = segmentIds
      .map((_, i) => `$${i + 2}`)
      .join(',');
    const similarityQuery = `
      SELECT 
        ds.id,
        ds.content,
        ds.document_id as "documentId",
        (1 - (e.embedding <=> $1)) as similarity
      FROM document_segments ds
      JOIN embeddings e ON ds.embedding_id = e.id
      WHERE ds.id IN (${segmentIdsPlaceholders})
        AND e.model_name = $${segmentIds.length + 2}
        AND e.embedding IS NOT NULL
        AND ds.enabled = true
      ORDER BY e.embedding <=> $1 ASC
      LIMIT $${segmentIds.length + 3}
    `;

    try {
      const results = await this.segmentRepository.query(similarityQuery, [
        queryEmbeddingStr,
        ...segmentIds,
        modelName,
        maxChunks,
      ]);

      return results.map((row: any) => ({
        id: row.id,
        content: row.content,
        documentId: row.documentId,
        similarity: Math.max(0, Math.min(1, row.similarity || 0.5)),
      }));
    } catch (error) {
      this.logger.warn(
        `Vector search failed for specific segments, using fallback: ${error.message}`,
      );
      // Fallback: return segments with default similarity
      return segments.slice(0, maxChunks).map((segment) => ({
        id: segment.id,
        content: segment.content,
        documentId: segment.documentId,
        similarity: 0.5,
      }));
    }
  }

  /**
   * Optimized retrieval for specific documents: Search segments across all specified documents
   * This is more efficient than searching per-document because it gets top K segments
   * across ALL specified documents in one query
   */
  private async retrieveFromSpecificDocumentsOptimized(
    datasetId: string,
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
    this.logger.log(
      `🚀 Using optimized search for ${documentIds.length} specific documents`,
    );

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(
        query,
        datasetId,
      );
      if (!queryEmbedding) {
        this.logger.warn('⚠️ Failed to generate query embedding');
        return [];
      }

      // Get dataset to find embedding model
      const dataset = await this.datasetService.findById(datasetId);
      if (!dataset) {
        this.logger.warn(`⚠️ Dataset ${datasetId} not found`);
        return [];
      }

      const embeddingModel = dataset.embeddingModel || 'Xenova/bge-m3';

      // Search segments across all specified documents in one query
      // This gets top K segments from ALL specified documents
      const searchLimit = Math.min(maxChunks * 2, 50);
      const searchResults =
        await this.hybridSearchService.performDatasetVectorSearch(
          datasetId,
          queryEmbedding,
          embeddingModel,
          searchLimit,
          documentIds, // Filter to specific documents
        );

      this.logger.log(
        `✅ Optimized search found ${searchResults.length} segments from ${documentIds.length} documents`,
      );

      // Map to return format
      const results = searchResults.slice(0, maxChunks).map((result) => ({
        id: result.id,
        content: result.content,
        similarity: result.semanticScore,
        documentId: (result as { documentId?: string }).documentId,
      }));

      this.logger.log(
        `🎯 Returning ${results.length} top segments from optimized search`,
      );

      return results;
    } catch (error) {
      this.logger.error(
        `❌ Optimized search failed: ${error.message}`,
        error.stack,
      );
      // Fallback to per-document search
      return this.retrieveFromSpecificDocuments(documentIds, query, maxChunks);
    }
  }

  /**
   * Legacy per-document search (kept as fallback)
   * Searches each document separately and combines results
   */
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

    // Use priority queue to keep only top K segments across all documents
    const topSegments: Array<{
      id: string;
      content: string;
      similarity?: number;
      documentId?: string;
    }> = [];
    const seenContent = new Set<string>();

    for (const documentId of documentIds) {
      this.logger.log(
        `🔍 Searching document ${documentId} for query: "${query}"`,
      );
      // Limit per document to prevent accumulation across multiple documents
      const perDocumentLimit = Math.min(maxChunks, 5); // Max 5 per document

      try {
        const searchResults = await this.hybridSearchService.hybridSearch(
          documentId,
          query,
          perDocumentLimit, // Limit per document
          0.7, // semanticWeight
          0.3, // keywordWeight
          RerankerType.MATHEMATICAL, // rerankerType - use mathematical reranker instead
        );

        // Log search results for debugging
        this.logger.log(
          `📊 Search results for document ${documentId}: ${searchResults?.results?.length || 0} results`,
        );
        this.logger.log(
          `📊 Search response structure: ${JSON.stringify({
            hasResults: !!searchResults,
            resultsLength: searchResults?.results?.length,
            count: searchResults?.count,
            query: searchResults?.query,
          })}`,
        );

        if (
          !searchResults ||
          !searchResults.results ||
          searchResults.results.length === 0
        ) {
          this.logger.warn(
            `⚠️ No search results returned for document ${documentId}. Search may have failed or document has no segments.`,
          );
          this.logger.warn(
            `⚠️ Full search response: ${JSON.stringify(searchResults)}`,
          );
          continue; // Skip to next document
        }

        // Add documentId to each search result and add to priority queue
        const resultsWithDocumentId = searchResults.results.map((result) => ({
          id: result.id,
          content: result.content,
          similarity: result.similarity || 0,
          documentId: documentId,
        }));

        this.logger.log(
          `📊 Mapped ${resultsWithDocumentId.length} segments from search results`,
        );

        // Add to priority queue, keeping only top K
        for (const segment of resultsWithDocumentId) {
          const trimmedContent = segment.content.trim();
          const similarity = segment.similarity || 0;

          // Skip duplicates
          if (seenContent.has(trimmedContent)) {
            continue;
          }

          if (topSegments.length < maxChunks) {
            topSegments.push(segment);
            seenContent.add(trimmedContent);
          } else {
            // Find worst segment and replace if this is better
            const worstIndex = topSegments.findIndex(
              (s) => (s.similarity || 0) < similarity,
            );
            if (worstIndex !== -1) {
              const removed = topSegments[worstIndex];
              seenContent.delete(removed.content.trim());
              topSegments[worstIndex] = segment;
              seenContent.add(trimmedContent);
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `❌ Error searching document ${documentId}: ${error.message}`,
          error.stack,
        );
        // Continue with next document instead of failing completely
      }
    }

    // Sort by similarity (highest first)
    topSegments.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    this.logger.log(
      `🎯 Returning ${topSegments.length} segments from ${documentIds.length} specific documents`,
    );

    return topSegments;
  }

  /**
   * Optimized retrieval: Search segments directly across entire dataset
   * This is more efficient than searching per-document because:
   * 1. Gets top K segments across ALL documents in one query
   * 2. Doesn't miss best segments if they're all in one document
   * 3. Uses single PostgreSQL vector search instead of N queries
   */
  private async retrieveFromAllDocumentsOptimized(
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
    this.logger.log(
      `🚀 Using optimized dataset-wide vector search for query: "${query}"`,
    );

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(
        query,
        datasetId,
      );
      if (!queryEmbedding) {
        this.logger.warn('⚠️ Failed to generate query embedding');
        return [];
      }

      // Get dataset to find embedding model
      const dataset = await this.datasetService.findById(datasetId);
      if (!dataset) {
        this.logger.warn(`⚠️ Dataset ${datasetId} not found`);
        return [];
      }

      const embeddingModel = dataset.embeddingModel || 'Xenova/bge-m3';

      // Search segments directly across entire dataset
      // This gets top K segments from ALL documents in one query
      const searchLimit = Math.min(maxChunks * 2, 50); // Get more candidates for reranking
      const searchResults =
        await this.hybridSearchService.performDatasetVectorSearch(
          datasetId,
          queryEmbedding,
          embeddingModel,
          searchLimit,
        );

      this.logger.log(
        `✅ Dataset-wide search found ${searchResults.length} segments`,
      );

      // Map to return format
      const results = searchResults.slice(0, maxChunks).map((result) => ({
        id: result.id,
        content: result.content,
        similarity: result.semanticScore,
        documentId: (result as { documentId?: string }).documentId,
      }));

      this.logger.log(
        `🎯 Returning ${results.length} top segments from dataset-wide search`,
      );

      return results;
    } catch (error) {
      this.logger.error(
        `❌ Optimized dataset search failed: ${error.message}`,
        error.stack,
      );
      // Fallback to per-document search
      return this.retrieveFromAllDocuments(
        datasetId,
        query,
        maxChunks,
        undefined,
        undefined,
      );
    }
  }

  private async retrieveFromAllDocuments(
    datasetId: string,
    query: string,
    maxChunks: number,
    bm25Weight?: number,
    embeddingWeight?: number,
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
      // Return empty array immediately - don't proceed with search
      return [];
    }

    // Filter to only process completed documents (but don't return empty if some are completed)
    // Some documents might be in 'chunked' status which is also acceptable if they have segments
    const completedDocuments = documents.filter(
      (doc) =>
        doc.indexingStatus === 'completed' || doc.indexingStatus === 'chunked',
    );

    if (completedDocuments.length === 0) {
      this.logger.warn(
        `❌ No completed or chunked documents found in dataset (${documents.length} total documents)`,
      );
      return [];
    }

    // Use completed/chunked documents for search
    const documentsToSearch = completedDocuments;

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
    this.logger.log(
      `🔍 Searching across ${documentsToSearch.length} documents (${documents.length} total, ${completedDocuments.length} completed/chunked)`,
    );

    // Use a priority queue approach: keep only top K segments by similarity
    // This prevents accumulating thousands of segments in memory
    const topSegments: Array<{
      id: string;
      content: string;
      similarity?: number;
      documentId?: string;
    }> = [];
    const minSimilarity = { value: -1 }; // Track minimum similarity in top K
    const seenContent = new Set<string>(); // Track seen content across all documents

    this.logger.log(
      `🔍 Processing ${documentsToSearch.length} documents (${documents.length} total)`,
    );

    for (const document of documentsToSearch) {
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

          // Limit to small number per document to prevent memory issues
          // We'll use priority queue to get top K across all documents
          const perDocumentLimit = Math.min(maxChunks, 3); // Max 3 per document
          searchResults = await this.hybridSearchService.semanticOnlySearch(
            document.id,
            query,
            perDocumentLimit, // Limit per document to prevent accumulation
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
              // Use provided weights if available, otherwise use dataset's chat settings, finally use defaults
              const datasetChatSettings =
                (dataset?.settings as any)?.chat_settings || {};
              const semanticWeight =
                embeddingWeight ?? datasetChatSettings.embeddingWeight ?? 0.7;
              const keywordWeight =
                bm25Weight ?? datasetChatSettings.bm25Weight ?? 0.3;

              this.logger.log(
                `🔍 Using search weights: semantic=${semanticWeight}, keyword=${keywordWeight} (provided: bm25=${bm25Weight}, embedding=${embeddingWeight})`,
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
      // Add documentId to each search result and add to priority queue
      const resultsWithDocumentId =
        searchResults?.results?.map((result) => ({
          id: result.id,
          content: result.content,
          similarity: result.similarity || 0,
          documentId: document.id,
        })) || [];

      // Add segments to priority queue, keeping only top K
      // seenContent is shared across all documents to prevent duplicates

      for (const segment of resultsWithDocumentId) {
        const trimmedContent = segment.content.trim();
        const similarity = segment.similarity || 0;

        // Skip duplicates
        if (seenContent.has(trimmedContent)) {
          continue;
        }

        // If we have space or this segment is better than the worst one
        if (topSegments.length < maxChunks) {
          topSegments.push(segment);
          seenContent.add(trimmedContent);
          // Update minimum similarity
          if (similarity < minSimilarity.value || minSimilarity.value === -1) {
            minSimilarity.value = similarity;
          }
        } else if (similarity > minSimilarity.value) {
          // Replace the worst segment
          const worstIndex = topSegments.findIndex(
            (s) => (s.similarity || 0) === minSimilarity.value,
          );
          if (worstIndex !== -1) {
            const removed = topSegments[worstIndex];
            seenContent.delete(removed.content.trim());
            topSegments[worstIndex] = segment;
            seenContent.add(trimmedContent);
            // Update minimum similarity
            minSimilarity.value = Math.min(
              ...topSegments.map((s) => s.similarity || 0),
            );
          }
        }
      }
    }

    // Sort final segments by similarity (highest first)
    topSegments.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    this.logger.log(
      `🎯 Returning ${topSegments.length} final segments (from ${documents.length} documents)`,
    );

    return topSegments;
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
