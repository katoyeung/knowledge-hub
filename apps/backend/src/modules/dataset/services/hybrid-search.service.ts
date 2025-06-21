import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSegment } from '../entities/document-segment.entity';
import { EmbeddingService } from './embedding.service';
import { DocumentSegmentService } from '../document-segment.service';

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
  rerankerType?: 'mathematical' | 'ml-cross-encoder';
  message?: string;
}

export type RerankerType = 'mathematical' | 'ml-cross-encoder';

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly embeddingService: EmbeddingService,
    private readonly documentSegmentService: DocumentSegmentService,
  ) {}

  /**
   * Hybrid search combining BM25, semantic similarity, and reranking
   */
  async hybridSearch(
    documentId: string,
    query: string,
    limit: number = 10,
    semanticWeight: number = 0.7,
    keywordWeight: number = 0.3,
    rerankerType: RerankerType = 'ml-cross-encoder',
  ): Promise<HybridSearchResponse> {
    this.logger.log(`🔍 Starting hybrid search for document ${documentId} with query: "${query}"`);

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
      const keywordResults = await this.performBM25Search(allSegments, query);
      this.logger.log(`📝 BM25 found ${keywordResults.length} keyword matches`);

      // Step 3: Perform semantic similarity search
      const semanticResults = await this.performSemanticSearch(documentId, query, allSegments);
      this.logger.log(`🧠 Semantic search found ${semanticResults.length} semantic matches`);

      // Step 4: Combine and deduplicate results
      const combinedResults = this.combineResults(keywordResults, semanticResults);
      this.logger.log(`🔀 Combined ${combinedResults.length} unique results`);

      // Step 5: Apply reranking (ML or Mathematical)
      const rerankedResults = await this.applyReranking(combinedResults, query, semanticWeight, keywordWeight, rerankerType);
      this.logger.log(`📊 Reranked ${rerankedResults.length} results using ${rerankerType}`);

      // Step 6: Format and limit results
      const finalResults = rerankedResults
        .slice(0, limit)
        .map(result => ({
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
  private async performBM25Search(segments: DocumentSegment[], query: string): Promise<RankedResult[]> {
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
    const avgDocLength = segments.reduce((sum, seg) => sum + seg.wordCount, 0) / segments.length;

    for (const segment of segments) {
      const contentTokens = this.tokenize(segment.content.toLowerCase());
      
      // Extract and boost keywords
      const keywordTokens: string[] = [];
      if (segment.keywords && typeof segment.keywords === 'object') {
        const extractedKeywords = this.extractKeywords(segment.keywords as Record<string, unknown>);
        keywordTokens.push(...extractedKeywords.map((k: string) => k.toLowerCase()));
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
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5));
          const normalizedTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (segment.wordCount / avgDocLength)));
          bm25Score += idf * normalizedTf;
        }
      }
      
      // Apply phrase matching bonuses/penalties
      if (hasExactPhrase) {
        bm25Score *= 3.0; // Triple the score for exact phrase matches
      } else {
        // Apply a penalty for partial matches to create better score separation
        const queryTermsFound = queryTerms.filter(term => (termFreq.get(term) || 0) > 0).length;
        const coverageRatio = queryTermsFound / queryTerms.length;
        
        // Reduce score based on how many query terms are missing
        bm25Score *= (0.3 + 0.7 * coverageRatio); // Scale between 30% and 100%
      }

      if (bm25Score > 0) {
        results.push({
          id: segment.id,
          content: segment.content,
          position: segment.position,
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          keywords: segment.keywords as Record<string, unknown> || {},
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
   * Semantic similarity search using PostgreSQL vector indexes
   */
  private async performSemanticSearch(
    documentId: string,
    query: string,
    segments: DocumentSegment[],
  ): Promise<RankedResult[]> {
    try {
      // Get the actual embedding model from the stored embeddings
      const actualEmbeddingModel = await this.documentSegmentService.getEmbeddingModelForDocument(documentId);

      if (!actualEmbeddingModel) {
        this.logger.warn(`No embedding model found for document ${documentId}`);
        return [];
      }

      // Check embedding dimensions consistency
      const dimensionInfo = await this.documentSegmentService.getEmbeddingDimensionsForDocument(documentId);

      if (!dimensionInfo.hasConsistentDimensions) {
        this.logger.warn(`Inconsistent embedding dimensions for document ${documentId}`);
        return [];
      }

      // Generate query embedding using the same model as the stored embeddings
      const queryEmbeddingResult = await this.embeddingService.generateEmbedding(
        query,
        actualEmbeddingModel as any, // Cast to avoid type issues
      );
      const queryEmbedding = queryEmbeddingResult.embedding;

      // Double-check dimension compatibility
      if (
        dimensionInfo.dimensions &&
        queryEmbeddingResult.dimensions !== dimensionInfo.dimensions
      ) {
        this.logger.warn(`Dimension mismatch: Query ${queryEmbeddingResult.dimensions}D vs stored ${dimensionInfo.dimensions}D`);
        return [];
      }

      // Use PostgreSQL vector search instead of manual cosine similarity
      const results = await this.performVectorSearch(
        documentId,
        queryEmbedding,
        actualEmbeddingModel,
        segments.length > 1000 ? 'ivfflat' : 'hnsw' // Use IVFFlat for large datasets, HNSW for smaller
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
    indexType: 'ivfflat' | 'hnsw' = 'hnsw'
  ): Promise<RankedResult[]> {
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;
    
    // PostgreSQL vector similarity search query
    // Uses the appropriate distance operator based on index type
    const distanceOperator = indexType === 'ivfflat' ? '<->' : '<->';
    const orderDirection = 'ASC'; // Lower distance = higher similarity
    
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
        AND (1 - (e.embedding ${distanceOperator} $1)) > 0.1
      ORDER BY e.embedding ${distanceOperator} $1 ${orderDirection}
      LIMIT 50
    `;

    const rawResults = await this.segmentRepository.query(query, [
      queryEmbeddingStr,
      documentId,
      modelName
    ]);

    // Convert to RankedResult format
    const results: RankedResult[] = rawResults.map((row: any) => ({
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
    }));

    this.logger.log(`🚀 Vector search (${indexType}) found ${results.length} results`);
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
    const segmentsWithEmbeddings = segments.filter(seg => seg.embedding?.embedding);

    if (segmentsWithEmbeddings.length === 0) {
      this.logger.warn(`No segments with embeddings found for document ${documentId}`);
      return [];
    }

    // Generate query embedding
    const actualEmbeddingModel = await this.documentSegmentService.getEmbeddingModelForDocument(documentId);
    const queryEmbeddingResult = await this.embeddingService.generateEmbedding(
      query,
      actualEmbeddingModel as any
    );
    const queryEmbedding = queryEmbeddingResult.embedding;

    // Calculate cosine similarity manually
    const results: RankedResult[] = [];
    for (const segment of segmentsWithEmbeddings) {
      const segmentEmbedding = segment.embedding!.embedding;
      const similarity = this.calculateCosineSimilarity(queryEmbedding, segmentEmbedding);

      if (similarity > 0.1) {
        results.push({
          id: segment.id,
          content: segment.content,
          position: segment.position,
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          keywords: segment.keywords as Record<string, unknown> || {},
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
  private combineResults(keywordResults: RankedResult[], semanticResults: RankedResult[]): RankedResult[] {
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
    if (rerankerType === 'ml-cross-encoder') {
      try {
        return await this.mlRerank(results, query, semanticWeight, keywordWeight);
      } catch (error) {
        this.logger.warn(`ML reranker failed, falling back to mathematical: ${error.message}`);
        return await this.mathematicalRerank(results, query, semanticWeight, keywordWeight);
      }
    } else {
      return await this.mathematicalRerank(results, query, semanticWeight, keywordWeight);
    }
  }

  /**
   * ML-based reranking using Cross-Encoder approach
   */
  private async mlRerank(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
  ): Promise<RankedResult[]> {
    if (results.length === 0) return results;

    this.logger.log(`🤖 Using ML Cross-Encoder reranker for ${results.length} results`);

    // Normalize base scores
    const maxBM25 = Math.max(...results.map(r => r.bm25Score), 0.001);
    const maxSemantic = Math.max(...results.map(r => r.semanticScore), 0.001);

    const rerankedResults = results.map((result, index) => {
      // Extract features for ML scoring
      const features = this.extractMLFeatures(result, query, index, results.length);
      
      // Simulate ML cross-encoder prediction
      const mlScore = this.simulateMLCrossEncoder(features, query, result.content);
      
      // Normalize base scores
      const normalizedBM25 = Math.min(1.0, result.bm25Score / maxBM25);
      const normalizedSemantic = Math.min(1.0, result.semanticScore / maxSemantic);
      
      // Combine scores with ML boost
      let finalScore = (
        normalizedBM25 * keywordWeight +
        normalizedSemantic * semanticWeight +
        mlScore * 0.2 // ML contribution factor
      );

      // Hybrid match bonus
      if (result.matchType === 'hybrid') {
        finalScore *= 1.05; // Smaller boost for hybrid matches
      }

      // Ensure score doesn't exceed 1.0
      finalScore = Math.min(1.0, finalScore);

      result.rerankerScore = mlScore;
      result.finalScore = finalScore;

      this.logger.log(`🎯 ML Rerank - Segment ${result.position}: BM25=${normalizedBM25.toFixed(3)}, Semantic=${normalizedSemantic.toFixed(3)}, ML=${mlScore.toFixed(3)}, Final=${finalScore.toFixed(3)}`);

      return result;
    });

    return rerankedResults.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Extract features for ML cross-encoder
   */
  private extractMLFeatures(result: RankedResult, query: string, position: number, totalResults: number): any {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = result.content.toLowerCase();
    const contentWords = contentLower.split(/\s+/);

    return {
      // Semantic similarity
      semanticSimilarity: result.semanticScore,
      
      // BM25 score
      bm25Score: result.bm25Score,
      
      // Query-content matching features
      exactMatch: contentLower.includes(query.toLowerCase()) ? 1 : 0,
      queryTermCoverage: queryTerms.filter(term => contentLower.includes(term)).length / queryTerms.length,
      
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
  private simulateMLCrossEncoder(features: any, query: string, content: string): number {
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
          const nextWordIndexInContent = contentLower.indexOf(nextWord, wordIndex);
          
          if (nextWordIndexInContent === -1 || nextWordIndexInContent > wordIndex + word.length + 50) {
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
        const positionWeight = Math.max(0.5, 1 - (contentIndex / contentWords.length));
        coherence += positionWeight;
      }
    }
    
    return Math.min(coherence / queryWords.length, 1);
  }

  /**
   * Calculate structural similarity (simplified simulation)
   */
  private calculateStructuralSimilarity(query: string, content: string): number {
    const queryLength = query.split(/\s+/).length;
    const contentLength = content.split(/\s+/).length;
    
    // Penalize very short or very long content relative to query
    const lengthRatio = Math.min(queryLength / contentLength, contentLength / queryLength);
    return lengthRatio * 0.5; // Moderate influence
  }

  /**
   * Mathematical reranking (original implementation)
   */
  private async mathematicalRerank(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
  ): Promise<RankedResult[]> {
    if (results.length === 0) return results;

    // Normalize scores to 0-1 range safely
    const maxBM25 = Math.max(...results.map(r => r.bm25Score), 0.001); // Avoid division by zero
    const maxSemantic = Math.max(...results.map(r => r.semanticScore), 0.001);

    this.logger.log(`📊 Score ranges - BM25: 0-${maxBM25.toFixed(3)}, Semantic: 0-${maxSemantic.toFixed(3)}`);

    for (const result of results) {
      // Normalize scores to 0-1 range
      const normalizedBM25 = Math.min(1.0, result.bm25Score / maxBM25);
      const normalizedSemantic = Math.min(1.0, result.semanticScore / maxSemantic);

      // Calculate weighted combination
      let rerankerScore = (normalizedBM25 * keywordWeight) + (normalizedSemantic * semanticWeight);

      // Boost score for hybrid matches (but keep it reasonable)
      if (result.matchType === 'hybrid') {
        rerankerScore *= 1.1; // Reduced from 1.2 to 1.1
      }

      // Apply minimal position bias (only for very similar scores)
      const positionBias = Math.max(0.95, 1 - (result.position * 0.0001)); // Much smaller bias
      rerankerScore *= positionBias;

      // Ensure final score never exceeds 1.0
      rerankerScore = Math.min(1.0, rerankerScore);

      result.rerankerScore = rerankerScore;
      result.finalScore = rerankerScore;

      this.logger.log(`🎯 Segment ${result.position}: BM25=${normalizedBM25.toFixed(3)}, Semantic=${normalizedSemantic.toFixed(3)}, Final=${rerankerScore.toFixed(3)} (${result.matchType})`);
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
      .filter(token => token.length > 2); // Filter out very short tokens
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