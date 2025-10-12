import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Dataset } from '../entities/dataset.entity';
import { EmbeddingV2Service } from './embedding-v2.service';
import { DocumentSegmentService } from '../document-segment.service';
import { ModelMappingService } from '../../../common/services/model-mapping.service';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';
import { RerankerType } from '../dto/create-dataset-step.dto';

export interface SearchResult {
  id: string;
  content: string;
  position: number;
  wordCount: number;
  tokens: number;
  keywords?: Record<string, unknown>;
  enabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface RankedResult extends SearchResult {
  bm25Score: number;
  semanticScore: number;
  rerankerScore: number;
  finalScore: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
}

export interface HybridSearchResponse {
  results: Array<{
    id: string;
    content: string;
    similarity: number;
    segment: SearchResult;
    matchType: string;
    scores: {
      bm25: number;
      semantic: number;
      reranker: number;
      final: number;
    };
  }>;
  query: string;
  count: number;
  model?: string;
  rerankerType?: RerankerType;
  message?: string;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);
  private rerankerCache: Map<string, any> = new Map();

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly modelMappingService: ModelMappingService,
  ) {}

  /**
   * Semantic-only search (like Python script with FAISS)
   */
  async semanticOnlySearch(
    documentId: string,
    query: string,
    limit: number = 10,
    similarityThreshold: number = 0.6,
  ): Promise<HybridSearchResponse> {
    this.logger.log(
      `🧠 Starting semantic-only search for document ${documentId} with query: "${query}"`,
    );

    try {
      // Get all segments for the document
      const allSegments = await this.segmentRepository.find({
        where: { documentId, enabled: true },
        relations: ['embedding'],
        order: { position: 'ASC' },
      });

      this.logger.log(
        `🔍 Found ${allSegments.length} segments for document ${documentId}`,
      );

      if (allSegments.length === 0) {
        this.logger.warn(`❌ No segments found for document ${documentId}`);
        return {
          results: [],
          query,
          count: 0,
          message: 'No segments found for this document',
        };
      }

      // Check how many segments have embeddings
      const segmentsWithEmbeddings = allSegments.filter(
        (seg) => seg.embedding?.embedding,
      );
      this.logger.log(
        `🔍 Found ${segmentsWithEmbeddings.length} segments with embeddings out of ${allSegments.length} total segments`,
      );

      // Perform only semantic similarity search
      this.logger.log(
        `🔍 Starting performSemanticSearch for document ${documentId}`,
      );
      const semanticResults = await this.performSemanticSearch(
        documentId,
        query,
        allSegments,
      );
      this.logger.log(
        `🧠 Semantic search found ${semanticResults.length} semantic matches`,
      );

      if (semanticResults.length === 0) {
        this.logger.warn(`❌ No semantic results found for query: "${query}"`);
        this.logger.warn(
          `🔍 DEBUG - Trying fallback manual semantic search...`,
        );

        // Try fallback manual semantic search
        const fallbackResults = await this.performManualSemanticSearch(
          documentId,
          query,
          allSegments,
        );

        if (fallbackResults.length > 0) {
          this.logger.log(
            `✅ Fallback search found ${fallbackResults.length} results`,
          );
          const filteredFallbackResults = fallbackResults.filter(
            (result) => result.semanticScore >= similarityThreshold,
          );

          const finalResults = filteredFallbackResults
            .slice(0, limit)
            .map((result) => ({
              id: result.id,
              content: result.content,
              similarity: result.semanticScore,
              segment: {
                id: result.id,
                content: result.content,
                position: result.position,
                wordCount: result.wordCount,
                tokens: result.tokens,
                keywords: result.keywords,
                enabled: result.enabled,
                status: result.status,
                createdAt: result.createdAt,
                updatedAt: result.updatedAt,
                completedAt: result.completedAt,
                error: result.error,
              },
              matchType: 'semantic-fallback',
              scores: {
                bm25: 0,
                semantic: result.semanticScore,
                reranker: 0,
                final: result.semanticScore,
              },
            }));

          return {
            results: finalResults,
            query,
            count: finalResults.length,
            model: 'semantic-fallback-search',
            message: `Found ${finalResults.length} results using fallback semantic search`,
          };
        }
      }

      // Sort by similarity descending and take top K results (no threshold filtering)
      const sortedResults = semanticResults
        .sort((a, b) => b.semanticScore - a.semanticScore)
        .slice(0, limit);

      this.logger.log(
        `🎯 Selected top ${sortedResults.length} results by similarity (no threshold filtering)`,
      );

      const finalResults = sortedResults.map((result) => ({
        id: result.id,
        content: result.content,
        similarity: result.semanticScore, // Use semantic score directly
        segment: {
          id: result.id,
          content: result.content,
          position: result.position,
          wordCount: result.wordCount,
          tokens: result.tokens,
          keywords: result.keywords,
          enabled: result.enabled,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          completedAt: result.completedAt,
          error: result.error,
        },
        matchType: 'semantic',
        scores: {
          bm25: 0,
          semantic: result.semanticScore,
          reranker: 0,
          final: result.semanticScore,
        },
      }));

      return {
        results: finalResults,
        query,
        count: finalResults.length,
        model: 'semantic-only-search',
        message: `Found ${finalResults.length} results using semantic-only search (like Python script)`,
      };
    } catch (error) {
      this.logger.error(`❌ Semantic-only search failed:`, error.message);
      throw error;
    }
  }

  /**
   * Hybrid search combining BM25, semantic similarity, and reranking
   */
  async hybridSearch(
    documentId: string,
    query: string,
    limit: number = 10,
    semanticWeight: number = 0.7,
    keywordWeight: number = 0.3,
    rerankerType: RerankerType = RerankerType.NONE,
  ): Promise<HybridSearchResponse> {
    console.log(
      `🚀 HYBRID SEARCH CALLED: documentId=${documentId}, query="${query}", limit=${limit}`,
    );
    this.logger.log(
      `🔍 Starting hybrid search for document ${documentId} with query: "${query}"`,
    );

    try {
      // Step 1: Get all segments for the document
      const allSegments = await this.segmentRepository.find({
        where: { documentId, enabled: true },
        relations: ['embedding'],
        order: { position: 'ASC' },
      });

      if (allSegments.length === 0) {
        return {
          results: [],
          query,
          count: 0,
          message: 'No segments found for this document',
        };
      }

      // Step 2: Perform BM25 keyword search
      const keywordResults = this.performBM25Search(allSegments, query);
      this.logger.log(`📝 BM25 found ${keywordResults.length} keyword matches`);

      // Step 3: Perform semantic similarity search
      const semanticResults = await this.performSemanticSearch(
        documentId,
        query,
        allSegments,
      );
      this.logger.log(
        `🧠 Semantic search found ${semanticResults.length} semantic matches`,
      );

      // Step 4: Combine and deduplicate results
      const combinedResults = this.combineResults(
        keywordResults,
        semanticResults,
      );
      this.logger.log(`🔀 Combined ${combinedResults.length} unique results`);

      // Step 5: Apply reranking (ML or Mathematical)
      const rerankedResults = await this.applyReranking(
        combinedResults,
        query,
        semanticWeight,
        keywordWeight,
        rerankerType,
      );
      this.logger.log(
        `📊 Reranked ${rerankedResults.length} results using ${rerankerType}`,
      );

      // Step 6: Format and limit results
      const finalResults = rerankedResults.slice(0, limit).map((result) => ({
        id: result.id,
        content: result.content,
        similarity: result.finalScore,
        segment: {
          id: result.id,
          content: result.content,
          position: result.position,
          wordCount: result.wordCount,
          tokens: result.tokens,
          keywords: result.keywords,
          enabled: result.enabled,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          completedAt: result.completedAt,
          error: result.error,
        },
        matchType: result.matchType,
        scores: {
          bm25: result.bm25Score,
          semantic: result.semanticScore,
          reranker: result.rerankerScore,
          final: result.finalScore,
        },
      }));

      return {
        results: finalResults,
        query,
        count: finalResults.length,
        model: 'hybrid-search-bm25+semantic+reranker',
        rerankerType,
        message: `Found ${finalResults.length} results using hybrid search (BM25 + Semantic + ${rerankerType} Reranker)`,
      };
    } catch (error) {
      this.logger.error(`❌ Hybrid search failed:`, error.message);
      throw error;
    }
  }

  /**
   * BM25 keyword-based search
   */
  private performBM25Search(
    segments: DocumentSegment[],
    query: string,
  ): RankedResult[] {
    const queryTerms = this.tokenize(query.toLowerCase());
    const results: RankedResult[] = [];

    // Calculate document frequencies
    const docFreq = new Map<string, number>();
    const totalDocs = segments.length;

    // Build term frequencies and document frequencies
    for (const segment of segments) {
      const tokens = this.tokenize(segment.content.toLowerCase());
      const uniqueTokens = new Set(tokens);

      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // Calculate BM25 scores
    const k1 = 1.5; // Term frequency saturation parameter
    const b = 0.75; // Length normalization parameter
    const avgDocLength =
      segments.reduce((sum, seg) => sum + seg.wordCount, 0) / segments.length;

    for (const segment of segments) {
      const contentTokens = this.tokenize(segment.content.toLowerCase());

      // Extract and boost keywords
      const keywordTokens: string[] = [];
      if (segment.keywords && typeof segment.keywords === 'object') {
        const extractedKeywords = this.extractKeywords(
          segment.keywords as Record<string, unknown>,
        );
        keywordTokens.push(
          ...extractedKeywords.map((k: string) => k.toLowerCase()),
        );
      }

      // Combine content tokens with keywords (keywords get higher frequency)
      const termFreq = new Map<string, number>();

      // Count content term frequencies
      for (const token of contentTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }

      // Add keywords with 3x weight (they're important extracted terms)
      for (const keyword of keywordTokens) {
        const keywordTerms = this.tokenize(keyword);
        for (const term of keywordTerms) {
          termFreq.set(term, (termFreq.get(term) || 0) + 3);
        }
      }

      let bm25Score = 0;

      // Check for exact phrase match first (higher weight)
      const queryLower = query.toLowerCase();
      const contentLower = segment.content.toLowerCase();
      const hasExactPhrase = contentLower.includes(queryLower);

      // Calculate standard BM25 score
      for (const queryTerm of queryTerms) {
        const tf = termFreq.get(queryTerm) || 0;
        const df = docFreq.get(queryTerm) || 0;

        if (tf > 0) {
          // Improved IDF calculation to handle edge cases
          let idf;
          if (df >= totalDocs) {
            // If term appears in all or more documents than we have, use a small positive IDF
            idf = Math.log(1.1); // Small positive value
          } else {
            idf = Math.log((totalDocs - df + 0.5) / (df + 0.5));
          }
          const normalizedTf =
            (tf * (k1 + 1)) /
            (tf + k1 * (1 - b + b * (segment.wordCount / avgDocLength)));
          bm25Score += idf * normalizedTf;
        }
      }

      // Apply phrase matching bonuses/penalties
      if (hasExactPhrase) {
        bm25Score *= 3.0; // Triple the score for exact phrase matches
      } else {
        // Apply a penalty for partial matches to create better score separation
        const queryTermsFound = queryTerms.filter(
          (term) => (termFreq.get(term) || 0) > 0,
        ).length;
        const coverageRatio = queryTermsFound / queryTerms.length;

        // Reduce score based on how many query terms are missing
        bm25Score *= 0.3 + 0.7 * coverageRatio; // Scale between 30% and 100%
      }

      if (bm25Score > 0) {
        results.push({
          id: segment.id,
          content: segment.content,
          position: segment.position,
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          keywords: (segment.keywords as Record<string, unknown>) || {},
          enabled: segment.enabled,
          status: segment.status,
          createdAt: segment.createdAt.toString(),
          updatedAt: segment.updatedAt.toString(),
          completedAt: segment.completedAt?.toString(),
          error: segment.error,
          bm25Score,
          semanticScore: 0,
          rerankerScore: 0,
          finalScore: 0,
          matchType: 'keyword',
        });
      }
    }

    return results.sort((a, b) => b.bm25Score - a.bm25Score);
  }

  /**
   * Get embedding provider from dataset
   */
  private async getEmbeddingProviderFromDataset(
    documentId: string,
  ): Promise<string> {
    try {
      // Get document to find dataset
      const document = await this.segmentRepository
        .createQueryBuilder('segment')
        .leftJoinAndSelect('segment.document', 'document')
        .leftJoinAndSelect('document.dataset', 'dataset')
        .where('segment.documentId = :documentId', { documentId })
        .limit(1)
        .getOne();

      if (document?.document?.dataset?.embeddingModelProvider) {
        return document.document.dataset.embeddingModelProvider;
      }

      // Fallback to local if not found
      return 'local';
    } catch (error) {
      this.logger.warn(
        `Failed to get embedding provider from dataset: ${error.message}`,
      );
      return 'local';
    }
  }

  /**
   * Map dataset model name to the actual stored model name in embeddings table
   * Now uses centralized model mapping service for consistency
   */
  private mapDatasetModelToStoredModel(datasetModelName: string): string {
    // Try to find the embedding model enum from the stored name
    const embeddingModel =
      this.modelMappingService.getEmbeddingModelFromStoredName(
        datasetModelName,
      );

    if (embeddingModel) {
      // If we found a matching model, return the name as-is (it's already the stored name)
      return datasetModelName;
    }

    // Fallback: try to map common dataset model names to their stored equivalents
    const commonMappings: Record<string, string> = {
      'BAAI/bge-m3': 'Xenova/bge-m3',
      'mixedbread-ai/mxbai-embed-large-v1':
        'mixedbread-ai/mxbai-embed-large-v1',
      'WhereIsAI/UAE-Large-V1': 'WhereIsAI/UAE-Large-V1',
    };

    return commonMappings[datasetModelName] || 'Xenova/bge-m3';
  }

  /**
   * Get all possible model names that might be stored in the database
   * This handles cases where embeddings were created with different model names
   * Now uses centralized model mapping service for consistency
   */
  private getAllPossibleModelNames(datasetModelName: string): string[] {
    // Try to find the embedding model enum from the dataset model name
    const embeddingModel =
      this.modelMappingService.getEmbeddingModelFromStoredName(
        datasetModelName,
      );

    if (embeddingModel) {
      // If we found a matching model, get all possible stored names for it
      return this.modelMappingService.getAllPossibleStoredNames(embeddingModel);
    }

    // Fallback: return the dataset model name and its mapped equivalent
    const possibleNames = new Set<string>();
    possibleNames.add(datasetModelName);
    possibleNames.add(this.mapDatasetModelToStoredModel(datasetModelName));

    return Array.from(possibleNames);
  }

  /**
   * Semantic similarity search using PostgreSQL vector indexes
   */
  private async performSemanticSearch(
    documentId: string,
    query: string,
    segments: DocumentSegment[],
  ): Promise<RankedResult[]> {
    try {
      // Get the actual embedding model from the stored embeddings
      let actualEmbeddingModel =
        await this.documentSegmentService.getEmbeddingModelForDocument(
          documentId,
        );

      // Fallback: Get embedding model from dataset if not found in segments
      if (!actualEmbeddingModel) {
        this.logger.warn(
          `No embedding model found in segments for document ${documentId}, trying dataset configuration`,
        );

        // Get the dataset from the document via segment repository
        const segment = await this.segmentRepository
          .createQueryBuilder('segment')
          .leftJoinAndSelect('segment.document', 'document')
          .leftJoinAndSelect('document.dataset', 'dataset')
          .where('segment.documentId = :documentId', { documentId })
          .limit(1)
          .getOne();

        if (segment?.document?.dataset?.embeddingModel) {
          actualEmbeddingModel = segment.document.dataset.embeddingModel;
          this.logger.log(
            `Using dataset embedding model: ${actualEmbeddingModel}`,
          );
        } else {
          this.logger.warn(
            `No embedding model found for document ${documentId}`,
          );
          return [];
        }
      }

      // Get the embedding provider from the dataset
      const embeddingProvider =
        await this.getEmbeddingProviderFromDataset(documentId);
      this.logger.log(
        `Using embedding provider: ${embeddingProvider} for model: ${actualEmbeddingModel}`,
      );

      // Check embedding dimensions consistency
      const dimensionInfo =
        await this.documentSegmentService.getEmbeddingDimensionsForDocument(
          documentId,
        );

      if (!dimensionInfo.hasConsistentDimensions) {
        this.logger.warn(
          `Inconsistent embedding dimensions for document ${documentId}, using dataset default`,
        );
        // Don't return empty results, just log the warning and continue
        // The embedding service will handle dimension compatibility
      }

      // Generate query embedding using the same model and provider as the stored embeddings
      this.logger.log(
        `🔄 Generating query embedding for: "${query}" with model: ${actualEmbeddingModel}, provider: ${embeddingProvider}`,
      );
      const queryEmbeddingResult =
        await this.embeddingService.generateEmbedding(
          query,
          actualEmbeddingModel as any, // Cast to avoid type issues
          embeddingProvider as EmbeddingProvider, // Cast to enum
        );
      const queryEmbedding = queryEmbeddingResult.embedding;
      this.logger.log(
        `✅ Query embedding generated: ${queryEmbedding.length} dimensions`,
      );

      // Double-check dimension compatibility
      if (
        dimensionInfo.dimensions &&
        queryEmbeddingResult.dimensions !== dimensionInfo.dimensions
      ) {
        this.logger.warn(
          `Dimension mismatch: Query ${queryEmbeddingResult.dimensions}D vs stored ${dimensionInfo.dimensions}D, continuing anyway`,
        );
        // Don't return empty results, just log the warning and continue
        // The vector search will handle the dimension mismatch
      }

      // Use PostgreSQL vector search instead of manual cosine similarity
      this.logger.log(
        `🔍 Calling performVectorSearch with documentId: ${documentId}, model: ${actualEmbeddingModel}`,
      );
      const results = await this.performVectorSearch(
        documentId,
        queryEmbedding,
        actualEmbeddingModel || 'qwen3-embedding:0.6b', // Fallback to default model
        'hnsw', // Use HNSW with cosine distance for better similarity results
      );
      this.logger.log(
        `📊 performVectorSearch returned ${results.length} results`,
      );

      return results.sort((a, b) => b.semanticScore - a.semanticScore);
    } catch (error) {
      this.logger.error(`❌ Semantic search failed:`, error.message);
      // Fallback to manual cosine similarity if vector search fails
      return this.performManualSemanticSearch(documentId, query, segments);
    }
  }

  /**
   * Perform vector search using PostgreSQL indexes
   */
  private async performVectorSearch(
    documentId: string,
    queryEmbedding: number[],
    modelName: string,
    indexType: 'ivfflat' | 'hnsw' = 'hnsw',
  ): Promise<RankedResult[]> {
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

    // PostgreSQL vector similarity search query
    // Use cosine distance operator for consistent similarity calculation
    const distanceOperator = '<=>';
    const orderDirection = 'ASC'; // Lower distance = higher similarity

    // Get all possible model names that might be stored in the database
    const possibleModelNames = this.getAllPossibleModelNames(modelName);
    this.logger.log(
      `🔍 Trying vector search with model names: ${possibleModelNames.join(', ')}`,
    );
    this.logger.log(`🔍 Original model name: ${modelName}`);

    // Debug: Write to file for easier debugging
    const fs = require('fs');
    const debugInfo = {
      timestamp: new Date().toISOString(),
      originalModelName: modelName,
      possibleModelNames: possibleModelNames,
      queryEmbeddingLength: queryEmbeddingStr.length,
    };
    fs.writeFileSync(
      '/tmp/debug-search.log',
      JSON.stringify(debugInfo, null, 2) + '\n',
      { flag: 'a' },
    );
    this.logger.log(
      `🔍 Query embedding string length: ${queryEmbeddingStr.length}`,
    );

    // Try each possible model name until we find results
    let rawResults: any[] = [];

    for (const modelNameToTry of possibleModelNames) {
      const query = `
        SELECT 
          ds.id,
          ds.content,
          ds.position,
          ds.word_count as "wordCount",
          ds.tokens,
          ds.keywords,
          ds.enabled,
          ds.status,
          ds.created_at as "createdAt",
          ds.updated_at as "updatedAt",
          ds.completed_at as "completedAt",
          ds.error,
          (1 - (e.embedding ${distanceOperator} $1)) as similarity
        FROM document_segments ds
        JOIN embeddings e ON ds.embedding_id = e.id
        WHERE ds.document_id = $2 
          AND e.model_name = $3
          AND e.embedding IS NOT NULL
          AND ds.enabled = true
          AND (1 - (e.embedding ${distanceOperator} $1)) > 0.0
        ORDER BY e.embedding ${distanceOperator} $1 ${orderDirection}
        LIMIT 50
      `;

      try {
        const results = await this.segmentRepository.query(query, [
          queryEmbeddingStr,
          documentId,
          modelNameToTry,
        ]);

        if (results.length > 0) {
          rawResults = results;
          this.logger.log(
            `✅ Vector search found ${results.length} results with model: ${modelNameToTry}`,
          );
          break;
        } else {
          this.logger.log(
            `❌ Vector search found 0 results with model: ${modelNameToTry}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `❌ Vector search failed with model ${modelNameToTry}: ${error.message}`,
        );
      }
    }

    if (rawResults.length === 0) {
      this.logger.warn(`❌ Vector search found no results with any model name`);
      this.logger.warn(
        `🔍 DEBUG - Tried model names: ${possibleModelNames.join(', ')}`,
      );
      this.logger.warn(
        `🔍 DEBUG - Document ID: ${documentId}, Query embedding length: ${queryEmbedding.length}`,
      );
      return [];
    }

    // Convert to RankedResult format
    const results: RankedResult[] = rawResults.map((row: any) => {
      console.log(
        `🔍 DEBUG - Raw similarity from DB: ${row.similarity} (type: ${typeof row.similarity})`,
      );
      return {
        id: row.id,
        content: row.content,
        position: row.position,
        wordCount: row.wordCount,
        tokens: row.tokens,
        keywords: row.keywords || {},
        enabled: row.enabled,
        status: row.status,
        createdAt: row.createdAt.toString(),
        updatedAt: row.updatedAt.toString(),
        completedAt: row.completedAt?.toString(),
        error: row.error,
        bm25Score: 0,
        semanticScore: row.similarity,
        rerankerScore: 0,
        finalScore: 0,
        matchType: 'semantic',
      };
    });

    this.logger.log(
      `🚀 Vector search (${indexType}) found ${results.length} results`,
    );
    return results;
  }

  /**
   * Fallback manual semantic search (original implementation)
   */
  private async performManualSemanticSearch(
    documentId: string,
    query: string,
    segments: DocumentSegment[],
  ): Promise<RankedResult[]> {
    this.logger.log(`📦 Using manual cosine similarity as fallback`);

    // Filter segments with embeddings
    const segmentsWithEmbeddings = segments.filter(
      (seg) => seg.embedding?.embedding,
    );

    if (segmentsWithEmbeddings.length === 0) {
      this.logger.warn(
        `No segments with embeddings found for document ${documentId}`,
      );
      return [];
    }

    // Generate query embedding
    const actualEmbeddingModel =
      await this.documentSegmentService.getEmbeddingModelForDocument(
        documentId,
      );
    const queryEmbeddingResult = await this.embeddingService.generateEmbedding(
      query,
      (actualEmbeddingModel as any) || 'Xenova/bge-m3',
    );
    const queryEmbedding = queryEmbeddingResult.embedding;

    // Calculate cosine similarity manually
    const results: RankedResult[] = [];
    for (const segment of segmentsWithEmbeddings) {
      const segmentEmbedding = segment.embedding?.embedding;
      if (!segmentEmbedding) continue;
      const similarity = this.calculateCosineSimilarity(
        queryEmbedding,
        segmentEmbedding,
      );

      if (similarity > 0.01) {
        results.push({
          id: segment.id,
          content: segment.content,
          position: segment.position,
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          keywords: (segment.keywords as Record<string, unknown>) || {},
          enabled: segment.enabled,
          status: segment.status,
          createdAt: segment.createdAt.toString(),
          updatedAt: segment.updatedAt.toString(),
          completedAt: segment.completedAt?.toString(),
          error: segment.error,
          bm25Score: 0,
          semanticScore: similarity,
          rerankerScore: 0,
          finalScore: 0,
          matchType: 'semantic',
        });
      }
    }

    return results;
  }

  /**
   * Combine BM25 and semantic results, removing duplicates
   */
  private combineResults(
    keywordResults: RankedResult[],
    semanticResults: RankedResult[],
  ): RankedResult[] {
    const resultsMap = new Map<string, RankedResult>();

    // Add keyword results
    for (const result of keywordResults) {
      resultsMap.set(result.id, result);
    }

    // Merge semantic results
    for (const result of semanticResults) {
      const existing = resultsMap.get(result.id);
      if (existing) {
        // Combine scores for hybrid match
        existing.semanticScore = result.semanticScore;
        existing.matchType = 'hybrid';
      } else {
        resultsMap.set(result.id, result);
      }
    }

    return Array.from(resultsMap.values());
  }

  /**
   * Apply reranking using the selected strategy
   */
  private async applyReranking(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
    rerankerType: RerankerType,
  ): Promise<RankedResult[]> {
    if (rerankerType === RerankerType.NONE) {
      this.logger.log(
        '🚫 Skipping reranking - calculating final scores without reranking',
      );
      // When no reranking, set finalScore as weighted combination of BM25 and semantic scores
      return results.map((result) => ({
        ...result,
        finalScore:
          result.bm25Score * keywordWeight +
          result.semanticScore * semanticWeight,
      }));
    } else if (rerankerType === RerankerType.ML_CROSS_ENCODER) {
      try {
        return await this.mlRerank(
          results,
          query,
          semanticWeight,
          keywordWeight,
        );
      } catch (error) {
        this.logger.warn(
          `ML reranker failed, falling back to mathematical: ${error.message}`,
        );
        return this.mathematicalRerank(
          results,
          query,
          semanticWeight,
          keywordWeight,
        );
      }
    } else {
      return this.mathematicalRerank(
        results,
        query,
        semanticWeight,
        keywordWeight,
      );
    }
  }

  /**
   * ML-based reranking using BGE Reranker Cross-Encoder
   */
  private async mlRerank(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
  ): Promise<RankedResult[]> {
    if (results.length === 0) return results;

    this.logger.log(
      `🤖 Using BGE Reranker Cross-Encoder for ${results.length} results`,
    );

    try {
      // Check if reranker is already cached
      let reranker = this.rerankerCache.get('bge-reranker-base');
      if (!reranker) {
        this.logger.log(
          `🤖 Loading BGE reranker model: Xenova/bge-reranker-base`,
        );

        // Load BGE reranker model using Xenova Transformers
        const { pipeline } = await import('@xenova/transformers');
        reranker = await pipeline(
          'text-classification',
          'Xenova/bge-reranker-base',
          {
            quantized: true, // Use quantized models for better performance
          },
        );

        // Cache the model for future use
        this.rerankerCache.set('bge-reranker-base', reranker);
        this.logger.log(`✅ BGE reranker model cached for future use`);
      } else {
        this.logger.log(`♻️ Using cached BGE reranker model`);
      }

      // Normalize base scores with more aggressive scaling
      const maxBM25 = Math.max(...results.map((r) => r.bm25Score), 0.001);
      const maxSemantic = Math.max(
        ...results.map((r) => r.semanticScore),
        0.001,
      );

      this.logger.log(
        `🔍 Score normalization - Max BM25: ${maxBM25.toFixed(3)}, Max Semantic: ${maxSemantic.toFixed(3)}`,
      );

      const rerankedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Use BGE reranker to score query-document pairs
            // BGE reranker expects query and document separated by [SEP] token
            const rerankerInput = `${query} [SEP] ${result.content}`;
            const rerankerOutput = await reranker(rerankerInput);

            // Extract relevance score from BGE output
            // BGE reranker returns binary classification (relevant/not relevant)
            let mlScore = 0.5; // Default fallback score

            if (Array.isArray(rerankerOutput) && rerankerOutput.length > 0) {
              const output = rerankerOutput[0];
              if (output && typeof output.score === 'number') {
                // BGE reranker returns 1 for relevant, 0 for not relevant
                // We'll use this as a binary filter and combine with other signals
                mlScore = output.score;
              } else if (output && typeof output === 'number') {
                mlScore = output;
              }
            } else if (
              rerankerOutput &&
              typeof rerankerOutput.score === 'number'
            ) {
              mlScore = rerankerOutput.score;
            } else if (typeof rerankerOutput === 'number') {
              mlScore = rerankerOutput;
            }

            // Normalize base scores
            const normalizedBM25 = Math.min(1.0, result.bm25Score / maxBM25);
            const normalizedSemantic = Math.min(
              1.0,
              result.semanticScore / maxSemantic,
            );

            this.logger.log(
              `🔍 Segment ${result.position}: Raw BM25=${result.bm25Score.toFixed(3)}, Raw Semantic=${result.semanticScore.toFixed(3)}, Norm BM25=${normalizedBM25.toFixed(3)}, Norm Semantic=${normalizedSemantic.toFixed(3)}`,
            );

            // Simple weighted combination like the Python script
            // Use BGE reranker as a simple filter (0 or 1)
            const baseScore =
              normalizedBM25 * keywordWeight +
              normalizedSemantic * semanticWeight;

            // Apply BGE reranker as a simple multiplier (no complex scaling)
            const finalScore = baseScore * (mlScore > 0.5 ? 1.0 : 0.5);

            result.rerankerScore = mlScore;
            result.finalScore = finalScore;

            this.logger.log(
              `🎯 BGE Rerank - Segment ${result.position}: BM25=${normalizedBM25.toFixed(3)}, Semantic=${normalizedSemantic.toFixed(3)}, BGE=${mlScore.toFixed(3)}, Final=${finalScore.toFixed(3)} (${result.matchType})`,
            );

            return result;
          } catch (error) {
            this.logger.warn(
              `BGE reranker failed for segment ${result.position}, using fallback: ${error.message}`,
            );

            // Fallback to simple mathematical scoring like Python script
            const finalScore =
              result.bm25Score * keywordWeight +
              result.semanticScore * semanticWeight;

            result.rerankerScore = finalScore;
            result.finalScore = finalScore;

            return result;
          }
        }),
      );

      return rerankedResults.sort((a, b) => b.finalScore - a.finalScore);
    } catch (error) {
      this.logger.warn(
        `BGE reranker failed to load, falling back to mathematical: ${error.message}`,
      );
      return this.mathematicalRerank(
        results,
        query,
        semanticWeight,
        keywordWeight,
      );
    }
  }

  /**
   * Extract features for ML cross-encoder
   */
  private extractMLFeatures(
    result: RankedResult,
    query: string,
    position: number,
    totalResults: number,
  ): any {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = result.content.toLowerCase();

    return {
      // Semantic similarity
      semanticSimilarity: result.semanticScore,

      // BM25 score
      bm25Score: result.bm25Score,

      // Query-content matching features
      exactMatch: contentLower.includes(query.toLowerCase()) ? 1 : 0,
      queryTermCoverage:
        queryTerms.filter((term) => contentLower.includes(term)).length /
        queryTerms.length,

      // Content quality features
      contentLength: Math.min(result.content.length / 1000, 1),
      wordCount: Math.min(result.wordCount / 500, 1),

      // Position features
      position: result.position,
      relativePosition: position / totalResults,

      // Match type
      isHybridMatch: result.matchType === 'hybrid' ? 1 : 0,

      // Keyword features
      hasKeywords: Object.keys(result.keywords || {}).length > 0 ? 1 : 0,
    };
  }

  /**
   * Simulate ML Cross-Encoder scoring with improved score separation
   * In production, this would call an actual transformer model
   */
  private simulateMLCrossEncoder(
    features: any,
    query: string,
    content: string,
  ): number {
    // Simulate neural reranking with multiple signals
    let score = 0;

    // 1. Exact match bonus (strong signal) - More strict detection
    const exactMatchScore = this.calculateExactMatchScore(query, content);
    score += exactMatchScore * 0.35;

    // 2. Query term coverage (important for relevance) - Reduced weight
    score += features.queryTermCoverage * 0.2;

    // 3. Semantic similarity (pre-computed) - Increased weight
    score += features.semanticSimilarity * 0.25;

    // 4. BM25 integration (keyword relevance) - Reduced weight
    score += features.bm25Score * 0.1;

    // 5. Content quality indicators - Reduced impact
    score += Math.min(features.contentLength + features.wordCount / 2, 0.05);

    // 6. Hybrid match bonus - Reduced to prevent score inflation
    score += features.isHybridMatch * 0.02;

    // 7. Position bias (slight preference for earlier content)
    score += (1 - features.relativePosition) * 0.01;

    // 8. Keyword presence bonus - Reduced
    score += features.hasKeywords * 0.02;

    // Advanced features (simulating cross-encoder capabilities)
    // 9. Semantic coherence between query and content - Reduced weight
    const coherenceScore = this.calculateSemanticCoherence(query, content);
    score += coherenceScore * 0.05;

    // 10. Query-content structural similarity - Reduced weight
    const structuralScore = this.calculateStructuralSimilarity(query, content);
    score += structuralScore * 0.02;

    // Apply score separation penalty for non-perfect matches
    if (exactMatchScore < 0.95) {
      score *= 0.9; // Reduce score for non-exact matches
    }

    // Normalize to 0-1 range with better separation
    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Calculate more precise exact match score
   */
  private calculateExactMatchScore(query: string, content: string): number {
    const queryLower = query.toLowerCase().trim();
    const contentLower = content.toLowerCase();

    // Perfect phrase match
    if (contentLower.includes(queryLower)) {
      return 1.0;
    }

    // Check for exact word sequence match (ignoring punctuation)
    const queryWords = queryLower.split(/\s+/);
    const contentWords = contentLower.split(/\s+/);

    for (let i = 0; i <= contentWords.length - queryWords.length; i++) {
      const segment = contentWords.slice(i, i + queryWords.length);
      if (segment.join(' ') === queryWords.join(' ')) {
        return 0.95; // Very high but not perfect
      }
    }

    // Partial phrase matching with order preservation
    let consecutiveMatches = 0;
    let maxConsecutive = 0;

    for (let i = 0; i < queryWords.length; i++) {
      const word = queryWords[i];
      const nextWordIndex = i + 1;

      if (contentLower.includes(word)) {
        consecutiveMatches++;
        if (nextWordIndex < queryWords.length) {
          const nextWord = queryWords[nextWordIndex];
          const wordIndex = contentLower.indexOf(word);
          const nextWordIndexInContent = contentLower.indexOf(
            nextWord,
            wordIndex,
          );

          if (
            nextWordIndexInContent === -1 ||
            nextWordIndexInContent > wordIndex + word.length + 50
          ) {
            maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
            consecutiveMatches = 0;
          }
        }
      } else {
        maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
        consecutiveMatches = 0;
      }
    }

    maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    const orderPreservationScore = maxConsecutive / queryWords.length;

    return Math.min(orderPreservationScore * 0.8, 0.85); // Cap at 85% for partial matches
  }

  /**
   * Calculate semantic coherence (simplified simulation)
   */
  private calculateSemanticCoherence(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);

    // Simple word overlap with position weighting
    let coherence = 0;
    for (const queryWord of queryWords) {
      const contentIndex = contentWords.indexOf(queryWord);
      if (contentIndex !== -1) {
        // Earlier positions get higher weight
        const positionWeight = Math.max(
          0.5,
          1 - contentIndex / contentWords.length,
        );
        coherence += positionWeight;
      }
    }

    return Math.min(coherence / queryWords.length, 1);
  }

  /**
   * Calculate structural similarity (simplified simulation)
   */
  private calculateStructuralSimilarity(
    query: string,
    content: string,
  ): number {
    const queryLength = query.split(/\s+/).length;
    const contentLength = content.split(/\s+/).length;

    // Penalize very short or very long content relative to query
    const lengthRatio = Math.min(
      queryLength / contentLength,
      contentLength / queryLength,
    );
    return lengthRatio * 0.5; // Moderate influence
  }

  /**
   * Mathematical reranking (simplified implementation - like Python script)
   */
  private mathematicalRerank(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
  ): RankedResult[] {
    if (results.length === 0) return results;

    this.logger.log(
      `📊 Simplified reranking - using direct weighted combination like Python script`,
    );

    for (const result of results) {
      // Simple weighted combination like the Python script
      // No aggressive scaling, no randomization, no position bias
      const finalScore =
        result.bm25Score * keywordWeight +
        result.semanticScore * semanticWeight;

      result.rerankerScore = finalScore;
      result.finalScore = finalScore;

      this.logger.log(
        `🎯 Segment ${result.position}: BM25=${result.bm25Score.toFixed(3)}, Semantic=${result.semanticScore.toFixed(3)}, Final=${finalScore.toFixed(3)} (${result.matchType})`,
      );
    }

    return results.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Extract keywords from the keywords object structure
   */
  private extractKeywords(keywords: Record<string, unknown>): string[] {
    if (!keywords) return [];

    // Handle the structure created in the backend: { extracted: string[], count: number, extractedAt: string }
    if (keywords.extracted && Array.isArray(keywords.extracted)) {
      return keywords.extracted as string[];
    }

    // Fallback for other possible structures
    if (Array.isArray(keywords)) {
      return keywords as string[];
    }

    return [];
  }

  /**
   * Simple tokenization
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2); // Filter out very short tokens
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
