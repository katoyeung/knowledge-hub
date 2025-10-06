# Search Performance Specification

## Overview

This document specifies the search performance measurement framework for the Knowledge Hub system, including metrics, benchmarks, and optimization guidelines.

## Performance Metrics Specification

### Response Time Metrics

| Metric        | Target | Warning | Critical | Measurement               |
| ------------- | ------ | ------- | -------- | ------------------------- |
| Search Query  | 1s     | 2s      | 5s       | End-to-end query time     |
| Vector Search | 500ms  | 1s      | 2s       | Vector similarity search  |
| Hybrid Search | 800ms  | 1.5s    | 3s       | Combined vector + keyword |
| Reranking     | 200ms  | 500ms   | 1s       | Result reranking time     |
| LLM Response  | 3s     | 5s      | 10s      | Language model generation |

### Throughput Metrics

| Metric                | Target | Measurement               |
| --------------------- | ------ | ------------------------- |
| Queries per Second    | 100    | Concurrent query handling |
| Documents per Second  | 50     | Document processing rate  |
| Embeddings per Second | 20     | Embedding generation rate |
| Concurrent Users      | 1000   | Simultaneous active users |

### Quality Metrics

| Metric      | Target | Measurement Method                    |
| ----------- | ------ | ------------------------------------- |
| Precision@5 | >80%   | Top 5 results relevance               |
| Recall@10   | >75%   | Relevant results in top 10            |
| NDCG@10     | >0.8   | Normalized Discounted Cumulative Gain |
| MAP         | >0.7   | Mean Average Precision                |
| MRR         | >0.8   | Mean Reciprocal Rank                  |

## Benchmarking Framework

### Test Dataset Specification

#### Chinese Content Dataset

```typescript
interface ChineseTestDataset {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    language: "zh-CN";
    category: "business" | "academic" | "news" | "legal";
    expectedEntities: string[];
  }>;
  queries: Array<{
    id: string;
    text: string;
    expectedResults: string[];
    difficulty: "easy" | "medium" | "hard";
  }>;
}
```

#### English Content Dataset

```typescript
interface EnglishTestDataset {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    language: "en-US";
    category: "technical" | "business" | "academic" | "general";
    expectedKeywords: string[];
  }>;
  queries: Array<{
    id: string;
    text: string;
    expectedResults: string[];
    queryType: "factual" | "analytical" | "comparative";
  }>;
}
```

### Performance Test Suite

#### Load Testing

```typescript
describe("Search Performance Load Tests", () => {
  it("should handle 100 concurrent queries", async () => {
    const queries = generateTestQueries(100);
    const startTime = Date.now();

    const results = await Promise.all(
      queries.map((query) => searchService.search(query))
    );

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // 5 seconds max
    expect(results).toHaveLength(100);
  });

  it("should maintain response time under load", async () => {
    const responseTimes = [];

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await searchService.search(testQuery);
      responseTimes.push(Date.now() - start);
    }

    const avgResponseTime =
      responseTimes.reduce((a, b) => a + b) / responseTimes.length;
    expect(avgResponseTime).toBeLessThan(1000); // 1 second average
  });
});
```

#### Accuracy Testing

```typescript
describe("Search Accuracy Tests", () => {
  it("should achieve target precision@5", async () => {
    const testQueries = loadTestQueries();
    let totalPrecision = 0;

    for (const query of testQueries) {
      const results = await searchService.search(query.text, { limit: 5 });
      const precision = calculatePrecision(results, query.expectedResults);
      totalPrecision += precision;
    }

    const avgPrecision = totalPrecision / testQueries.length;
    expect(avgPrecision).toBeGreaterThan(0.8);
  });

  it("should achieve target recall@10", async () => {
    const testQueries = loadTestQueries();
    let totalRecall = 0;

    for (const query of testQueries) {
      const results = await searchService.search(query.text, { limit: 10 });
      const recall = calculateRecall(results, query.expectedResults);
      totalRecall += recall;
    }

    const avgRecall = totalRecall / testQueries.length;
    expect(avgRecall).toBeGreaterThan(0.75);
  });
});
```

## Configuration Optimization

### Search Configuration Tuning

#### Vector Search Parameters

```typescript
interface VectorSearchConfig {
  similarityThreshold: number; // 0.0-1.0, default: 0.7
  maxResults: number; // 1-100, default: 10
  embeddingModel: string; // Model identifier
  dimensions: number; // Vector dimensions
  indexType: "ivfflat" | "hnsw"; // Index algorithm
}
```

#### Hybrid Search Weights

```typescript
interface HybridSearchWeights {
  vectorWeight: number; // 0.0-1.0, default: 0.7
  keywordWeight: number; // 0.0-1.0, default: 0.3
  rerankerWeight: number; // 0.0-1.0, default: 0.5
}
```

#### Reranking Configuration

```typescript
interface RerankerConfig {
  enabled: boolean;
  type: "mathematical" | "cross_encoder";
  model: string;
  topK: number; // Rerank top K results
  threshold: number; // Minimum score threshold
}
```

### Performance Optimization Guidelines

#### Database Optimization

```sql
-- Vector index optimization
CREATE INDEX CONCURRENTLY idx_embeddings_vector
ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Query optimization
CREATE INDEX CONCURRENTLY idx_document_segments_document_id
ON document_segments (document_id)
WHERE enabled = true;

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY idx_segments_document_enabled_position
ON document_segments (document_id, enabled, position);
```

#### Caching Strategy

```typescript
interface SearchCacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache size
  keyStrategy: "query_hash" | "query_text";
  invalidationStrategy: "time_based" | "event_based";
}
```

## Monitoring & Alerting

### Performance Dashboards

#### Real-time Metrics

- Query response time (P50, P95, P99)
- Throughput (queries per second)
- Error rate and error types
- Resource utilization (CPU, memory, database)

#### Quality Metrics

- Precision and recall trends
- User satisfaction scores
- Query success rate
- Search abandonment rate

### Alerting Rules

| Metric            | Warning Threshold | Critical Threshold | Action               |
| ----------------- | ----------------- | ------------------ | -------------------- |
| Response Time P95 | >2s               | >5s                | Scale resources      |
| Error Rate        | >5%               | >10%               | Investigate errors   |
| Throughput        | <50 qps           | <20 qps            | Check system health  |
| Precision         | <75%              | <60%               | Review search config |

## Testing Procedures

### Automated Testing Pipeline

#### Continuous Performance Testing

```yaml
# .github/workflows/performance-tests.yml
name: Performance Tests
on:
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM
  push:
    branches: [main]

jobs:
  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup test environment
        run: |
          docker-compose up -d
          npm run test:performance:setup
      - name: Run performance tests
        run: |
          npm run test:performance:load
          npm run test:performance:accuracy
      - name: Generate report
        run: npm run test:performance:report
```

#### Performance Regression Testing

```typescript
describe("Performance Regression Tests", () => {
  it("should not regress from baseline performance", async () => {
    const baseline = loadBaselineMetrics();
    const current = await measureCurrentPerformance();

    expect(current.responseTime).toBeLessThanOrEqual(
      baseline.responseTime * 1.1
    );
    expect(current.throughput).toBeGreaterThanOrEqual(
      baseline.throughput * 0.9
    );
    expect(current.accuracy).toBeGreaterThanOrEqual(baseline.accuracy * 0.95);
  });
});
```

### Manual Testing Procedures

#### Load Testing Checklist

- [ ] System handles expected concurrent users
- [ ] Response times remain within targets
- [ ] No memory leaks during extended load
- [ ] Database connections remain stable
- [ ] Error rates stay below thresholds

#### Quality Testing Checklist

- [ ] Search results are relevant to queries
- [ ] Precision and recall meet targets
- [ ] Results are consistent across multiple runs
- [ ] Different query types perform well
- [ ] Language-specific optimizations work

## Troubleshooting Guide

### Common Performance Issues

| Issue              | Symptoms             | Root Cause                 | Solution              |
| ------------------ | -------------------- | -------------------------- | --------------------- |
| Slow vector search | High response times  | Missing vector indexes     | Create proper indexes |
| Poor accuracy      | Irrelevant results   | Wrong similarity threshold | Tune threshold values |
| Memory issues      | Out of memory errors | Large embedding models     | Optimize model size   |
| Database locks     | Query timeouts       | Concurrent access issues   | Optimize queries      |

### Debug Tools

```bash
# Performance profiling
npm run test:performance:profile

# Database query analysis
npm run test:performance:db-analysis

# Memory usage monitoring
npm run test:performance:memory

# Search quality analysis
npm run test:performance:quality-analysis
```

## Performance Baselines

### Current System Performance

- **Response Time P95**: 1.2s
- **Throughput**: 120 qps
- **Precision@5**: 85%
- **Recall@10**: 78%
- **NDCG@10**: 0.82

### Target Performance (Next Quarter)

- **Response Time P95**: <1s
- **Throughput**: 200 qps
- **Precision@5**: >90%
- **Recall@10**: >85%
- **NDCG@10**: >0.85
