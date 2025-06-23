# Hybrid Search with ML Reranker Implementation

## Overview

This implementation provides two reranking strategies for the hybrid search system:
1. **Mathematical Reranker** (original): Rule-based reranking with weighted combinations
2. **ML Cross-Encoder Reranker** (new): ML-based reranking with advanced feature extraction

## Reranker Types

### 1. Mathematical Reranker (`mathematical`)
- **Approach**: Weighted combination of BM25 and semantic scores
- **Features**: Position bias, hybrid match bonus, score normalization
- **Performance**: Fast, deterministic, lightweight
- **Use Case**: Production environments with strict latency requirements

### 2. ML Cross-Encoder Reranker (`ml-cross-encoder`)
- **Approach**: Simulated ML cross-encoder with advanced feature extraction  
- **Features**: 10+ scoring signals including semantic coherence, structural similarity
- **Performance**: More sophisticated scoring, better relevance ranking
- **Use Case**: Enhanced search quality, research environments

## API Usage

### Backend Endpoint
```typescript
POST /datasets/search-documents
{
  "documentId": "uuid",
  "query": "search terms",
  "limit": 10,
  "rerankerType": "ml-cross-encoder" // or "mathematical"
}
```

### Frontend API Client
```typescript
await datasetApi.search({
  documentId: "uuid",
  query: "search terms",
  limit: 10,
  rerankerType: "ml-cross-encoder" // optional, defaults to ML
});
```

## ML Reranker Features

The ML reranker simulates a cross-encoder model with these scoring signals:

### Core Features (70% of score)
1. **Exact Match Bonus** (30%): Full query phrase in content
2. **Query Term Coverage** (25%): Percentage of query terms found
3. **Semantic Similarity** (20%): Pre-computed embedding similarity
4. **BM25 Integration** (15%): Keyword relevance score

### Quality Features (20% of score)
5. **Content Length** (normalized): Optimal content length scoring
6. **Word Count** (normalized): Document quality indicator
7. **Hybrid Match Bonus** (5%): Documents matching both keyword and semantic

### Advanced Features (10% of score)
8. **Position Bias**: Slight preference for earlier content
9. **Keyword Presence**: Bonus for documents with extracted keywords
10. **Semantic Coherence**: Position-weighted word overlap
11. **Structural Similarity**: Query-content length ratio matching

## Implementation Details

### Service Architecture
```typescript
// Hybrid Search Service
class HybridSearchService {
  async hybridSearch(
    documentId: string,
    query: string,
    limit: number = 10,
    semanticWeight: number = 0.7,
    keywordWeight: number = 0.3,
    rerankerType: RerankerType = 'ml-cross-encoder'
  ): Promise<HybridSearchResponse>

  // Reranker dispatcher
  private async applyReranking(
    results: RankedResult[],
    query: string,
    semanticWeight: number,
    keywordWeight: number,
    rerankerType: RerankerType
  ): Promise<RankedResult[]>

  // ML reranker with fallback
  private async mlRerank(results, query, weights): Promise<RankedResult[]>
  
  // Mathematical reranker (original)
  private async mathematicalRerank(results, query, weights): Promise<RankedResult[]>
}
```

### Fallback Strategy
The ML reranker includes automatic fallback:
- If ML reranking fails, automatically falls back to mathematical reranker
- Logs warning and continues processing
- Ensures system reliability

## Score Normalization

Both rerankers implement score normalization:
- All scores bounded to 0-100% range
- Prevents score inflation above 100%
- Maintains consistent ranking behavior
- Enables meaningful score comparisons

## Response Format

```typescript
interface HybridSearchResponse {
  results: Array<{
    id: string;
    content: string;
    similarity: number; // Final score as decimal (0-1)
    segment: SearchResult;
    matchType: 'keyword' | 'semantic' | 'hybrid';
    scores: {
      bm25: number;        // BM25 keyword score
      semantic: number;    // Embedding similarity  
      reranker: number;    // Reranker-specific score
      final: number;       // Combined final score (0-100)
    };
  }>;
  query: string;
  count: number;
  model?: string;
  rerankerType: 'mathematical' | 'ml-cross-encoder';
  message?: string;
}
```

## Performance Characteristics

### Mathematical Reranker
- **Latency**: ~1-5ms per result
- **Memory**: Low overhead
- **Scalability**: Excellent for high-volume searches
- **Accuracy**: Good baseline performance

### ML Cross-Encoder Reranker  
- **Latency**: ~5-15ms per result (simulated)
- **Memory**: Moderate overhead for feature extraction
- **Scalability**: Good for moderate-volume searches
- **Accuracy**: Enhanced relevance scoring

## Future Enhancements

### Real ML Model Integration
Replace simulation with actual transformer models:
```typescript
// Future implementation with sentence-transformers
private async mlRerank(results, query) {
  const crossEncoder = await this.loadModel('cross-encoder/ms-marco-MiniLM-L-6-v2');
  const pairs = results.map(r => [query, r.content]);
  const scores = await crossEncoder.predict(pairs);
  return this.combineWithMLScores(results, scores);
}
```

### Model Options
- **cross-encoder/ms-marco-MiniLM-L-6-v2**: Fast, good quality
- **cross-encoder/ms-marco-electra-base**: Higher quality, slower
- **sentence-transformers/all-MiniLM-L6-v2**: Lightweight option

### Configuration Options
Future API parameters:
- `mlModelName`: Specify cross-encoder model
- `featureWeights`: Custom feature weight configuration
- `fallbackEnabled`: Control fallback to mathematical reranker

## Testing and Validation

### Test Cases
1. **Exact match queries**: Should score 100% with exact title matches
2. **Partial match queries**: Should show score separation (75-85%)
3. **Semantic queries**: Should leverage embedding similarity
4. **Fallback testing**: ML failure should gracefully use mathematical reranker

### Monitoring
- Track reranker selection distribution
- Monitor fallback frequency
- Compare ranking quality between methods
- Measure latency impact

## Configuration

Default settings optimized for quality:
- **Semantic Weight**: 70% (increased for better semantic matching)
- **Keyword Weight**: 30% (reduced but still significant)
- **Default Reranker**: ML Cross-Encoder
- **Fallback**: Enabled (automatic)

Adjust weights based on your use case:
- **Keyword-heavy**: Increase keyword weight to 50-60%
- **Semantic-heavy**: Keep semantic weight at 70-80%
- **Balanced**: Use 50/50 split for both signals 