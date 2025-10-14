# BM25 System Analysis

## Overview

This document provides a comprehensive analysis of how BM25 (Best Matching 25) is implemented and used in the Knowledge Hub system for hybrid search functionality.

## 1. Document Processing with BM25

### Location

- **File**: `apps/backend/src/modules/dataset/services/document-processing.service.ts`
- **Key Method**: `processDocument()` (lines 195-480)

### What Happens During Document Processing

1. **Text Extraction**: Documents are parsed and text content is extracted
2. **Text Splitting**: Content is split into chunks using configurable strategies:

   - Recursive Character Splitter
   - Character Splitter
   - Token Splitter
   - Markdown Splitter
   - Python Code Splitter
   - Smart Chunking (with Chinese text support)

3. **Segment Creation**: Each chunk becomes a `DocumentSegment` with:

   - `content`: The actual text content
   - `wordCount`: Number of words for BM25 length normalization
   - `tokens`: Token count for processing
   - `keywords`: Optional extracted keywords (JSONB field)
   - `position`: Order within the document

4. **Keyword Extraction**: Optional keyword extraction can be performed:

   - Keywords are stored in the `keywords` JSONB field
   - Format: `{ extracted: string[], count: number, extractedAt: string }`
   - These keywords receive 3x weight boost in BM25 scoring

5. **Embedding Generation**: Each segment gets vector embeddings for semantic search

### BM25 Preprocessing

- **No special BM25 preprocessing** occurs during document processing
- BM25 calculations happen at query time using the stored segment data
- Keywords are the only BM25-specific data stored during processing

## 2. Search with BM25 Enabled

### Location

- **File**: `apps/backend/src/modules/dataset/services/hybrid-search.service.ts`
- **Key Method**: `hybridSearch()` (lines 239-344)

### Hybrid Search Flow

1. **Segment Retrieval** (lines 255-269):

   ```typescript
   const allSegments = await this.segmentRepository.find({
     where: { documentId, enabled: true },
     relations: ["embedding"],
     order: { position: "ASC" },
   });
   ```

2. **BM25 Keyword Search** (lines 271-273):

   ```typescript
   const keywordResults = this.performBM25Search(allSegments, query);
   ```

3. **Semantic Vector Search** (lines 275-283):

   ```typescript
   const semanticResults = await this.performSemanticSearch(
     documentId,
     query,
     allSegments
   );
   ```

4. **Result Combination** (lines 285-290):

   ```typescript
   const combinedResults = this.combineResults(keywordResults, semanticResults);
   ```

5. **Reranking** (lines 292-299):
   ```typescript
   const rerankedResults = await this.applyReranking(
     combinedResults,
     query,
     semanticWeight,
     keywordWeight,
     rerankerType
   );
   ```

### BM25 Implementation Details

#### Algorithm Parameters

- **k1**: 1.5 (term frequency saturation parameter)
- **b**: 0.75 (length normalization parameter)

#### Scoring Process (lines 370-432)

1. **Tokenization**:

   ```typescript
   const queryTerms = this.tokenize(query.toLowerCase());
   const contentTokens = this.tokenize(segment.content.toLowerCase());
   ```

2. **Document Frequency Calculation**:

   ```typescript
   for (const segment of segments) {
     const tokens = this.tokenize(segment.content.toLowerCase());
     const uniqueTokens = new Set(tokens);
     for (const token of uniqueTokens) {
       docFreq.set(token, (docFreq.get(token) || 0) + 1);
     }
   }
   ```

3. **Term Frequency Calculation**:

   ```typescript
   // Count content term frequencies
   for (const token of contentTokens) {
     termFreq.set(token, (termFreq.get(token) || 0) + 1);
   }

   // Add keywords with 3x weight
   for (const keyword of keywordTokens) {
     const keywordTerms = this.tokenize(keyword);
     for (const term of keywordTerms) {
       termFreq.set(term, (termFreq.get(term) || 0) + 3);
     }
   }
   ```

4. **BM25 Score Calculation**:

   ```typescript
   for (const queryTerm of queryTerms) {
     const tf = termFreq.get(queryTerm) || 0;
     const df = docFreq.get(queryTerm) || 0;

     if (tf > 0) {
       const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5));
       const normalizedTf =
         (tf * (k1 + 1)) /
         (tf + k1 * (1 - b + b * (segment.wordCount / avgDocLength)));
       bm25Score += idf * normalizedTf;
     }
   }
   ```

5. **Phrase Matching Bonuses** (lines 434-446):
   - **Exact phrase match**: 3x score multiplier
   - **Partial match penalty**: Scaled based on query term coverage
   - **Coverage ratio**: `queryTermsFound / queryTerms.length`

## 3. Current System Benefits from BM25

### 1. Hybrid Scoring

- **Combines strengths**: BM25 excels at exact keyword matches, semantic search handles meaning
- **Configurable weights**: Dataset-level `bm25Weight` (default 0.4) and `embeddingWeight` (default 0.6)
- **Balanced approach**: Neither method dominates, both contribute to final ranking

### 2. Exact Match Detection

- **Phrase matching**: 3x boost for exact phrase matches
- **Keyword precision**: BM25 is excellent at finding specific terms and phrases
- **Order preservation**: Considers word order in scoring

### 3. Keyword Extraction Benefits

- **Pre-extracted keywords**: Get 3x weight boost in BM25 scoring
- **Important terms**: Keywords represent the most important concepts in each segment
- **Quality filtering**: Only segments with relevant keywords get higher scores

### 4. Fallback Mechanism

- **Reliability**: When semantic search fails, BM25 provides keyword-based results
- **Coverage**: Ensures some results are always returned for queries
- **Robustness**: Handles cases where embeddings might be missing or low quality

### 5. Chat Integration

- **Location**: `apps/backend/src/modules/chat/services/segment-retrieval.service.ts`
- **Fallback usage** (lines 296-338): When semantic search returns no results, hybrid search with BM25 is used
- **Dataset weights**: Uses stored `bm25Weight` and `embeddingWeight` from dataset configuration

### 6. Configurable Performance

- **Weight tuning**: Can adjust BM25 vs semantic balance per dataset
- **Use case optimization**: Different datasets can have different optimal weights
- **A/B testing**: Easy to compare different weight configurations

## 4. Configuration Options

### Dataset-Level Configuration

```typescript
// In Dataset entity
@Column('decimal', { precision: 3, scale: 2, default: 0.4, nullable: true })
bm25Weight: number;

@Column('decimal', { precision: 3, scale: 2, default: 0.6, nullable: true })
embeddingWeight: number;
```

### Search-Level Override

```typescript
// Can override dataset weights per search request
const finalBm25Weight = bm25Weight ?? dataset?.bm25Weight ?? 0.4;
const finalEmbeddingWeight = embeddingWeight ?? dataset?.embeddingWeight ?? 0.6;
```

### Reranker Types

- **NONE**: Simple weighted combination of BM25 and semantic scores
- **MATHEMATICAL**: Rule-based reranking with additional features
- **ML_CROSS_ENCODER**: Machine learning-based reranking (BGE Reranker)

## 5. Performance Characteristics

### BM25 Advantages

- **Fast**: No neural network inference required
- **Exact matches**: Excellent at finding specific terms and phrases
- **Interpretable**: Scores are based on clear mathematical principles
- **Language agnostic**: Works with any language that can be tokenized

### BM25 Limitations

- **No semantic understanding**: Cannot handle synonyms or related concepts
- **Keyword dependency**: Requires exact term matches
- **No context awareness**: Doesn't understand document structure or meaning

### Hybrid Benefits

- **Best of both worlds**: Combines keyword precision with semantic understanding
- **Robust**: Falls back gracefully when one method fails
- **Tunable**: Can be optimized for specific use cases

## 6. Use Cases and Recommendations

### When BM25 Helps Most

- **Factual queries**: "What is the capital of France?"
- **Specific terms**: Names, dates, technical terms
- **Exact matches**: Queries that should match specific phrases
- **Keyword-heavy content**: Technical documentation, specifications

### When Semantic Search is Better

- **Conceptual queries**: "How does machine learning work?"
- **Synonyms**: "car" vs "automobile"
- **Related concepts**: "climate change" vs "global warming"
- **Natural language**: Conversational queries

### Optimal Configuration Guidelines

- **High BM25 weight (0.6-0.8)**: For factual, keyword-based content
- **Balanced weights (0.4-0.6)**: For general-purpose knowledge bases
- **High semantic weight (0.7-0.9)**: For conversational, conceptual content

## 7. Technical Implementation Notes

### Tokenization

```typescript
private tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2); // Filter out very short tokens
}
```

### Score Normalization

- BM25 scores are not normalized to 0-1 range
- Final scores combine BM25 and semantic scores using weighted average
- Reranking can further adjust scores based on additional features

### Memory and Performance

- BM25 calculations are done in-memory for all segments
- No additional storage required beyond segment content and keywords
- Performance scales with number of segments, not document size

## 8. Future Improvements

### Potential Enhancements

1. **Caching**: Cache BM25 scores for frequently queried terms
2. **Indexing**: Pre-compute document frequencies for faster queries
3. **Weight learning**: Automatically tune weights based on user feedback
4. **Advanced tokenization**: Support for stemming, lemmatization, n-grams
5. **Field weighting**: Different weights for different document fields

### Monitoring and Metrics

- Track BM25 vs semantic score distributions
- Monitor query performance with different weight configurations
- A/B test different configurations to find optimal settings
- Measure user satisfaction with different search approaches
