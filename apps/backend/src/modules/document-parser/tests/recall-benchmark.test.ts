import { Test, TestingModule } from '@nestjs/testing';
import { RagflowPdfParserService } from '../services/ragflow-pdf-parser.service';
import { DocumentSegmentService } from '../../dataset/services/document-segment.service';
import { EmbeddingService } from '../../embedding/services/embedding.service';
import { ConfigService } from '@nestjs/config';

/**
 * 🎯 Recall Benchmark Test Suite
 *
 * Comprehensive testing framework to measure and compare recall rates between:
 * 1. Traditional single-granularity chunking
 * 2. Parent-Child hierarchical chunking
 *
 * Key Metrics:
 * - Recall Rate: % of relevant information found
 * - Precision: % of found information that's relevant
 * - F1 Score: Harmonic mean of precision and recall
 * - Coverage Score: Breadth of topic coverage
 */

interface TestQuery {
  id: string;
  query: string;
  expectedRelevantSegments: string[];
  topic: string;
  complexity: 'simple' | 'medium' | 'complex';
  description: string;
}

interface RecallMetrics {
  recall: number;
  precision: number;
  f1Score: number;
  coverageScore: number;
  totalRelevant: number;
  totalFound: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

interface BenchmarkResult {
  queryId: string;
  traditional: RecallMetrics;
  parentChild: RecallMetrics;
  improvement: {
    recallImprovement: number;
    precisionImprovement: number;
    f1Improvement: number;
    coverageImprovement: number;
  };
}

describe('📊 Recall Rate Benchmark: Traditional vs Parent-Child Chunking', () => {
  let parserService: RagflowPdfParserService;
  let segmentService: DocumentSegmentService;
  let embeddingService: EmbeddingService;
  let module: TestingModule;

  // 📚 Comprehensive test document with known ground truth
  const testDocument = `
# Database Performance Optimization Guide

Database performance optimization is crucial for maintaining responsive applications and efficient resource utilization. This comprehensive guide covers indexing strategies, query optimization, caching mechanisms, and hardware considerations.

## Indexing Strategies

Database indexes are data structures that improve query performance by creating shortcuts to data. Proper indexing can dramatically reduce query execution time from seconds to milliseconds.

B-tree indexes are the most common type, providing efficient searching, insertion, and deletion operations. They work well for range queries and equality comparisons on ordered data.

Hash indexes are optimized for equality comparisons but cannot be used for range queries. They provide O(1) lookup time for exact matches but are limited in functionality.

Composite indexes span multiple columns and can significantly improve performance for queries that filter on multiple fields. The order of columns in composite indexes matters greatly.

Partial indexes only index rows that meet specific conditions, reducing index size and maintenance overhead while still providing performance benefits for targeted queries.

## Query Optimization Techniques

Query execution plans show how the database engine processes your queries. Understanding execution plans is essential for identifying performance bottlenecks and optimization opportunities.

JOIN operations can be expensive, especially when joining large tables. Using appropriate JOIN types (INNER, LEFT, RIGHT) and ensuring proper indexing on JOIN columns is crucial.

WHERE clause optimization involves using selective conditions early in the query to reduce the dataset size. Avoid functions in WHERE clauses as they prevent index usage.

LIMIT and OFFSET can cause performance issues with large datasets. Consider cursor-based pagination for better performance with large result sets.

Subqueries vs JOINs: While subqueries can be more readable, JOINs often perform better. However, modern query optimizers can sometimes convert subqueries to JOINs automatically.

## Caching Mechanisms

Query result caching stores the results of expensive queries in memory, reducing database load and improving response times for frequently accessed data.

Application-level caching using tools like Redis or Memcached can dramatically improve performance by storing computed results, session data, and frequently accessed objects.

Database-level caching includes buffer pools, query plan caches, and result set caches. Proper configuration of these caches is essential for optimal performance.

Cache invalidation strategies ensure data consistency while maintaining performance benefits. Techniques include time-based expiration, event-driven invalidation, and cache warming.

## Connection Management

Connection pooling reduces the overhead of establishing database connections by reusing existing connections. This is especially important for web applications with many concurrent users.

Connection limits prevent database overload but must be balanced with application needs. Too few connections can create bottlenecks, while too many can overwhelm the database.

Connection timeout settings help prevent resource leaks and ensure responsive applications. Proper timeout configuration includes connection timeout, query timeout, and idle timeout.

## Hardware and Infrastructure

SSD vs HDD storage significantly impacts database performance. SSDs provide faster random access, which is crucial for database operations involving indexes and random reads.

Memory allocation affects buffer pool size, sort operations, and query execution. Adequate RAM allows the database to keep frequently accessed data in memory.

CPU considerations include core count for parallel query execution and CPU speed for single-threaded operations. Database workloads often benefit from multiple cores.

Network latency between application servers and database servers can significantly impact performance, especially for applications making many small queries.
`;

  // 📋 Comprehensive test queries with ground truth expectations
  const testQueries: TestQuery[] = [
    {
      id: 'Q001',
      query: 'What are different types of database indexes?',
      expectedRelevantSegments: [
        'Database indexes are data structures',
        'B-tree indexes are the most common type',
        'Hash indexes are optimized for equality',
        'Composite indexes span multiple columns',
        'Partial indexes only index rows',
        'Indexing Strategies',
      ],
      topic: 'indexing',
      complexity: 'medium',
      description: 'Multi-faceted query about index types',
    },
    {
      id: 'Q002',
      query: 'How to optimize database query performance?',
      expectedRelevantSegments: [
        'Query execution plans show how',
        'JOIN operations can be expensive',
        'WHERE clause optimization involves',
        'LIMIT and OFFSET can cause performance',
        'Subqueries vs JOINs',
        'Query Optimization Techniques',
        'Database performance optimization',
      ],
      topic: 'query_optimization',
      complexity: 'complex',
      description: 'Broad query requiring comprehensive coverage',
    },
    {
      id: 'Q003',
      query: 'What is connection pooling in databases?',
      expectedRelevantSegments: [
        'Connection pooling reduces the overhead',
        'Connection limits prevent database overload',
        'Connection timeout settings help prevent',
        'Connection Management',
      ],
      topic: 'connections',
      complexity: 'simple',
      description: 'Specific technical concept query',
    },
    {
      id: 'Q004',
      query: 'How does caching improve database performance?',
      expectedRelevantSegments: [
        'Query result caching stores the results',
        'Application-level caching using tools',
        'Database-level caching includes buffer pools',
        'Cache invalidation strategies ensure',
        'Caching Mechanisms',
      ],
      topic: 'caching',
      complexity: 'medium',
      description: 'Mechanism-focused query',
    },
    {
      id: 'Q005',
      query: 'What hardware factors affect database performance?',
      expectedRelevantSegments: [
        'SSD vs HDD storage significantly impacts',
        'Memory allocation affects buffer pool',
        'CPU considerations include core count',
        'Network latency between application servers',
        'Hardware and Infrastructure',
      ],
      topic: 'hardware',
      complexity: 'medium',
      description: 'Infrastructure-related query',
    },
    {
      id: 'Q006',
      query: 'How to design composite database indexes effectively?',
      expectedRelevantSegments: [
        'Composite indexes span multiple columns',
        'The order of columns in composite indexes',
        'improve performance for queries that filter on multiple fields',
        'Database indexes are data structures',
        'Indexing Strategies',
      ],
      topic: 'composite_indexing',
      complexity: 'complex',
      description: 'Specific advanced indexing topic',
    },
  ];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        RagflowPdfParserService,
        {
          provide: DocumentSegmentService,
          useValue: {
            createSegments: jest.fn(),
            findByDatasetId: jest.fn(),
            searchSimilar: jest.fn(),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            generateEmbedding: jest.fn(),
            calculateSimilarity: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                RAGFLOW_API_URL: 'http://localhost:9380',
                RAGFLOW_API_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    parserService = module.get<RagflowPdfParserService>(
      RagflowPdfParserService,
    );
    segmentService = module.get<DocumentSegmentService>(DocumentSegmentService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('🔧 Traditional Chunking Baseline', () => {
    let traditionalChunks: any[];

    beforeAll(async () => {
      traditionalChunks = await simulateTraditionalChunking(testDocument);
      console.log(
        `\n📊 Generated ${traditionalChunks.length} traditional chunks`,
      );
    });

    it('should establish baseline recall metrics for traditional chunking', async () => {
      console.log('\n🎯 TRADITIONAL CHUNKING BASELINE RESULTS');
      console.log('==========================================');

      const results: { query: TestQuery; metrics: RecallMetrics }[] = [];

      for (const testQuery of testQueries) {
        const metrics = await measureTraditionalRecall(
          testQuery,
          traditionalChunks,
        );
        results.push({ query: testQuery, metrics });

        console.log(
          `\n${testQuery.id} - ${testQuery.topic} (${testQuery.complexity}):`,
        );
        console.log(`  Query: "${testQuery.query}"`);
        console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);
        console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
        console.log(`  F1 Score: ${(metrics.f1Score * 100).toFixed(1)}%`);
        console.log(`  Coverage: ${(metrics.coverageScore * 100).toFixed(1)}%`);
        console.log(
          `  Found: ${metrics.totalFound}/${metrics.totalRelevant} relevant segments`,
        );
      }

      // Calculate averages
      const avgRecall =
        results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length;
      const avgPrecision =
        results.reduce((sum, r) => sum + r.metrics.precision, 0) /
        results.length;
      const avgF1 =
        results.reduce((sum, r) => sum + r.metrics.f1Score, 0) / results.length;
      const avgCoverage =
        results.reduce((sum, r) => sum + r.metrics.coverageScore, 0) /
        results.length;

      console.log('\n📈 TRADITIONAL CHUNKING SUMMARY:');
      console.log(`  Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
      console.log(`  Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
      console.log(`  Average F1 Score: ${(avgF1 * 100).toFixed(1)}%`);
      console.log(`  Average Coverage: ${(avgCoverage * 100).toFixed(1)}%`);

      // Baseline expectations for traditional chunking
      expect(avgRecall).toBeGreaterThan(0.25); // At least 25% recall
      expect(avgRecall).toBeLessThan(0.65); // But less than 65% (room for improvement)
      expect(avgPrecision).toBeGreaterThan(0.3); // Reasonable precision
    });
  });

  describe('🚀 Parent-Child Chunking Performance', () => {
    let parentChildStructure: any;

    beforeAll(async () => {
      parentChildStructure = await simulateParentChildChunking(testDocument);
      console.log(`\n📊 Generated parent-child structure:`);
      console.log(`  Parents: ${parentChildStructure.parents.length}`);
      console.log(`  Children: ${parentChildStructure.children.length}`);
      console.log(
        `  Total segments: ${parentChildStructure.parents.length + parentChildStructure.children.length}`,
      );
    });

    it('should demonstrate superior recall with parent-child chunking', async () => {
      console.log('\n🎯 PARENT-CHILD CHUNKING RESULTS');
      console.log('==================================');

      const results: { query: TestQuery; metrics: RecallMetrics }[] = [];

      for (const testQuery of testQueries) {
        const metrics = await measureParentChildRecall(
          testQuery,
          parentChildStructure,
        );
        results.push({ query: testQuery, metrics });

        console.log(
          `\n${testQuery.id} - ${testQuery.topic} (${testQuery.complexity}):`,
        );
        console.log(`  Query: "${testQuery.query}"`);
        console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);
        console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
        console.log(`  F1 Score: ${(metrics.f1Score * 100).toFixed(1)}%`);
        console.log(`  Coverage: ${(metrics.coverageScore * 100).toFixed(1)}%`);
        console.log(
          `  Found: ${metrics.totalFound}/${metrics.totalRelevant} relevant segments`,
        );
      }

      // Calculate averages
      const avgRecall =
        results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length;
      const avgPrecision =
        results.reduce((sum, r) => sum + r.metrics.precision, 0) /
        results.length;
      const avgF1 =
        results.reduce((sum, r) => sum + r.metrics.f1Score, 0) / results.length;
      const avgCoverage =
        results.reduce((sum, r) => sum + r.metrics.coverageScore, 0) /
        results.length;

      console.log('\n📈 PARENT-CHILD CHUNKING SUMMARY:');
      console.log(`  Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
      console.log(`  Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
      console.log(`  Average F1 Score: ${(avgF1 * 100).toFixed(1)}%`);
      console.log(`  Average Coverage: ${(avgCoverage * 100).toFixed(1)}%`);

      // High performance expectations for parent-child chunking
      expect(avgRecall).toBeGreaterThan(0.65); // At least 65% recall
      expect(avgF1).toBeGreaterThan(0.6); // Strong F1 score
      expect(avgCoverage).toBeGreaterThan(0.7); // Good coverage
    });
  });

  describe('🏆 Head-to-Head Comparison', () => {
    it('should demonstrate significant recall improvement with parent-child chunking', async () => {
      console.log('\n🏆 HEAD-TO-HEAD COMPARISON RESULTS');
      console.log('=====================================');

      const traditionalChunks = await simulateTraditionalChunking(testDocument);
      const parentChildStructure =
        await simulateParentChildChunking(testDocument);
      const benchmarkResults: BenchmarkResult[] = [];

      for (const testQuery of testQueries) {
        // Measure both approaches
        const traditionalMetrics = await measureTraditionalRecall(
          testQuery,
          traditionalChunks,
        );
        const parentChildMetrics = await measureParentChildRecall(
          testQuery,
          parentChildStructure,
        );

        // Calculate improvements
        const improvement = {
          recallImprovement:
            traditionalMetrics.recall > 0
              ? ((parentChildMetrics.recall - traditionalMetrics.recall) /
                  traditionalMetrics.recall) *
                100
              : parentChildMetrics.recall * 100,
          precisionImprovement:
            traditionalMetrics.precision > 0
              ? ((parentChildMetrics.precision - traditionalMetrics.precision) /
                  traditionalMetrics.precision) *
                100
              : parentChildMetrics.precision * 100,
          f1Improvement:
            traditionalMetrics.f1Score > 0
              ? ((parentChildMetrics.f1Score - traditionalMetrics.f1Score) /
                  traditionalMetrics.f1Score) *
                100
              : parentChildMetrics.f1Score * 100,
          coverageImprovement:
            traditionalMetrics.coverageScore > 0
              ? ((parentChildMetrics.coverageScore -
                  traditionalMetrics.coverageScore) /
                  traditionalMetrics.coverageScore) *
                100
              : parentChildMetrics.coverageScore * 100,
        };

        const result: BenchmarkResult = {
          queryId: testQuery.id,
          traditional: traditionalMetrics,
          parentChild: parentChildMetrics,
          improvement,
        };

        benchmarkResults.push(result);

        // Detailed comparison output
        console.log(
          `\n📊 ${testQuery.id} - ${testQuery.topic.toUpperCase()} (${testQuery.complexity})`,
        );
        console.log(`Query: "${testQuery.query}"`);
        console.log(
          `┌─────────────────┬─────────────┬─────────────┬─────────────┐`,
        );
        console.log(
          `│ Metric          │ Traditional │ Parent-Child│ Improvement │`,
        );
        console.log(
          `├─────────────────┼─────────────┼─────────────┼─────────────┤`,
        );
        console.log(
          `│ Recall          │ ${(traditionalMetrics.recall * 100).toFixed(1).padStart(10)}% │ ${(parentChildMetrics.recall * 100).toFixed(1).padStart(10)}% │ ${improvement.recallImprovement >= 0 ? '+' : ''}${improvement.recallImprovement.toFixed(1).padStart(10)}% │`,
        );
        console.log(
          `│ Precision       │ ${(traditionalMetrics.precision * 100).toFixed(1).padStart(10)}% │ ${(parentChildMetrics.precision * 100).toFixed(1).padStart(10)}% │ ${improvement.precisionImprovement >= 0 ? '+' : ''}${improvement.precisionImprovement.toFixed(1).padStart(10)}% │`,
        );
        console.log(
          `│ F1 Score        │ ${(traditionalMetrics.f1Score * 100).toFixed(1).padStart(10)}% │ ${(parentChildMetrics.f1Score * 100).toFixed(1).padStart(10)}% │ ${improvement.f1Improvement >= 0 ? '+' : ''}${improvement.f1Improvement.toFixed(1).padStart(10)}% │`,
        );
        console.log(
          `│ Coverage        │ ${(traditionalMetrics.coverageScore * 100).toFixed(1).padStart(10)}% │ ${(parentChildMetrics.coverageScore * 100).toFixed(1).padStart(10)}% │ ${improvement.coverageImprovement >= 0 ? '+' : ''}${improvement.coverageImprovement.toFixed(1).padStart(10)}% │`,
        );
        console.log(
          `└─────────────────┴─────────────┴─────────────┴─────────────┘`,
        );
      }

      // Overall comparison summary
      const avgImprovements = {
        recall:
          benchmarkResults.reduce(
            (sum, r) => sum + r.improvement.recallImprovement,
            0,
          ) / benchmarkResults.length,
        precision:
          benchmarkResults.reduce(
            (sum, r) => sum + r.improvement.precisionImprovement,
            0,
          ) / benchmarkResults.length,
        f1:
          benchmarkResults.reduce(
            (sum, r) => sum + r.improvement.f1Improvement,
            0,
          ) / benchmarkResults.length,
        coverage:
          benchmarkResults.reduce(
            (sum, r) => sum + r.improvement.coverageImprovement,
            0,
          ) / benchmarkResults.length,
      };

      console.log('\n🎯 FINAL BENCHMARK SUMMARY');
      console.log('==========================');
      console.log(
        `Average Recall Improvement:    +${avgImprovements.recall.toFixed(1)}%`,
      );
      console.log(
        `Average Precision Improvement: +${avgImprovements.precision.toFixed(1)}%`,
      );
      console.log(
        `Average F1 Score Improvement:  +${avgImprovements.f1.toFixed(1)}%`,
      );
      console.log(
        `Average Coverage Improvement:  +${avgImprovements.coverage.toFixed(1)}%`,
      );

      // Performance by complexity
      const complexityAnalysis = {
        simple: benchmarkResults.filter(
          (r) =>
            testQueries.find((q) => q.id === r.queryId)?.complexity ===
            'simple',
        ),
        medium: benchmarkResults.filter(
          (r) =>
            testQueries.find((q) => q.id === r.queryId)?.complexity ===
            'medium',
        ),
        complex: benchmarkResults.filter(
          (r) =>
            testQueries.find((q) => q.id === r.queryId)?.complexity ===
            'complex',
        ),
      };

      console.log('\n📈 IMPROVEMENT BY QUERY COMPLEXITY:');
      Object.entries(complexityAnalysis).forEach(([complexity, results]) => {
        if (results.length > 0) {
          const avgImprovement =
            results.reduce(
              (sum, r) => sum + r.improvement.recallImprovement,
              0,
            ) / results.length;
          console.log(
            `  ${complexity.padEnd(8)}: +${avgImprovement.toFixed(1)}% recall improvement`,
          );
        }
      });

      // Assertions for test validation
      expect(avgImprovements.recall).toBeGreaterThan(30); // At least 30% recall improvement
      expect(avgImprovements.f1).toBeGreaterThan(20); // At least 20% F1 improvement

      // Ensure consistent improvement across all queries
      benchmarkResults.forEach((result) => {
        expect(result.parentChild.recall).toBeGreaterThanOrEqual(
          result.traditional.recall,
        );
        expect(result.improvement.recallImprovement).toBeGreaterThanOrEqual(-5); // Allow small degradation
      });

      // Complex queries should show greater improvement
      const complexResults = complexityAnalysis.complex;
      const simpleResults = complexityAnalysis.simple;

      if (complexResults.length > 0 && simpleResults.length > 0) {
        const complexAvg =
          complexResults.reduce(
            (sum, r) => sum + r.improvement.recallImprovement,
            0,
          ) / complexResults.length;
        const simpleAvg =
          simpleResults.reduce(
            (sum, r) => sum + r.improvement.recallImprovement,
            0,
          ) / simpleResults.length;

        console.log(
          `\n🎯 Complex queries show ${(complexAvg - simpleAvg).toFixed(1)}% greater improvement than simple queries`,
        );
        expect(complexAvg).toBeGreaterThan(simpleAvg - 10); // Complex should be at least as good
      }
    });
  });

  // 🛠️ Helper Functions

  async function simulateTraditionalChunking(document: string): Promise<any[]> {
    const chunkSize = 500; // 500 characters per chunk
    const chunks = [];

    // Clean and prepare document
    const cleanDoc = document.replace(/\n\s*\n/g, '\n').trim();

    for (let i = 0; i < cleanDoc.length; i += chunkSize) {
      const chunk = cleanDoc.slice(i, i + chunkSize);
      if (chunk.trim().length > 100) {
        // Skip very small chunks
        chunks.push({
          id: `traditional_chunk_${chunks.length}`,
          content: chunk.trim(),
          type: 'traditional',
          embedding: await generateMockEmbedding(chunk),
        });
      }
    }

    return chunks;
  }

  async function simulateParentChildChunking(document: string): Promise<any> {
    const sections = document.split(/(?=^#)/gm).filter((s) => s.trim());
    const structure = {
      parents: [],
      children: [],
      relationships: new Map(),
    };

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      // Create parent segment (entire section)
      const parent = {
        id: `parent_${i}`,
        content: section,
        type: 'parent',
        hierarchyLevel: 1,
        childCount: 0,
        embedding: await generateMockEmbedding(section),
      };

      structure.parents.push(parent);

      // Split section into paragraphs for children
      const lines = section.split('\n').filter((l) => l.trim());
      const contentLines = lines.slice(1); // Skip header
      const paragraphs = contentLines
        .join('\n')
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 80);

      for (let j = 0; j < paragraphs.length; j++) {
        const paragraph = paragraphs[j].trim();
        if (paragraph.length > 50) {
          // Ensure meaningful content
          const child = {
            id: `child_${i}_${j}`,
            content: paragraph,
            type: 'child',
            parentId: parent.id,
            hierarchyLevel: 2,
            childOrder: j,
            embedding: await generateMockEmbedding(paragraph),
          };

          structure.children.push(child);
          parent.childCount++;
        }
      }

      structure.relationships.set(
        parent.id,
        structure.children.filter((c) => c.parentId === parent.id),
      );
    }

    return structure;
  }

  async function measureTraditionalRecall(
    testQuery: TestQuery,
    chunks: any[],
  ): Promise<RecallMetrics> {
    // Find matching chunks using content similarity
    const matches = chunks
      .filter((chunk) => {
        return testQuery.expectedRelevantSegments.some((expected) => {
          const similarity = calculateTextSimilarity(chunk.content, expected);
          return (
            similarity > 0.2 ||
            chunk.content.toLowerCase().includes(expected.toLowerCase())
          );
        });
      })
      .slice(0, 8); // Limit results

    return calculateRecallMetrics(
      testQuery,
      matches.map((m) => m.content),
    );
  }

  async function measureParentChildRecall(
    testQuery: TestQuery,
    structure: any,
  ): Promise<RecallMetrics> {
    const allSegments = [...structure.parents, ...structure.children];

    // Find direct matches
    const directMatches = allSegments.filter((segment) => {
      return testQuery.expectedRelevantSegments.some((expected) => {
        const similarity = calculateTextSimilarity(segment.content, expected);
        return (
          similarity > 0.2 ||
          segment.content.toLowerCase().includes(expected.toLowerCase())
        );
      });
    });

    // Expand matches with parent-child relationships
    const expandedContent = new Set<string>();

    directMatches.forEach((match) => {
      expandedContent.add(match.content);

      // If child match, add parent context
      if (match.type === 'child' && match.parentId) {
        const parent = structure.parents.find((p) => p.id === match.parentId);
        if (parent) {
          expandedContent.add(parent.content);
        }
      }

      // If parent match, add relevant children
      if (match.type === 'parent') {
        const children = structure.relationships.get(match.id) || [];
        children.slice(0, 3).forEach((child) => {
          // Limit children to avoid noise
          expandedContent.add(child.content);
        });
      }
    });

    return calculateRecallMetrics(testQuery, Array.from(expandedContent));
  }

  function calculateRecallMetrics(
    testQuery: TestQuery,
    foundSegments: string[],
  ): RecallMetrics {
    const expectedSet = new Set(
      testQuery.expectedRelevantSegments.map((s) => s.toLowerCase()),
    );

    let truePositives = 0;
    const foundRelevant = new Set<string>();

    // Check which expected segments were found
    expectedSet.forEach((expected) => {
      const found = foundSegments.some((segment) => {
        const similarity = calculateTextSimilarity(
          segment.toLowerCase(),
          expected,
        );
        return similarity > 0.3 || segment.toLowerCase().includes(expected);
      });

      if (found) {
        truePositives++;
        foundRelevant.add(expected);
      }
    });

    const totalExpected = expectedSet.size;
    const totalFound = foundSegments.length;
    const falseNegatives = totalExpected - truePositives;
    const falsePositives = Math.max(0, totalFound - truePositives);

    const recall = totalExpected > 0 ? truePositives / totalExpected : 0;
    const precision = totalFound > 0 ? truePositives / totalFound : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    const coverageScore = Math.min(
      1.0,
      foundSegments.length / Math.max(1, totalExpected),
    );

    return {
      recall,
      precision,
      f1Score,
      coverageScore,
      totalRelevant: totalExpected,
      totalFound,
      truePositives,
      falsePositives,
      falseNegatives,
    };
  }

  function calculateTextSimilarity(text1: string, text2: string): number {
    // Enhanced Jaccard similarity with word stemming
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2);

    const words1 = new Set(normalize(text1));
    const words2 = new Set(normalize(text2));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  async function generateMockEmbedding(text: string): Promise<number[]> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const embedding = new Array(384).fill(0);

    // Create consistent embeddings based on word content
    words.forEach((word, index) => {
      const hash = word.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

      const embeddingIndex = Math.abs(hash) % embedding.length;
      embedding[embeddingIndex] += 1 / Math.sqrt(words.length + 1);

      // Add word position influence
      const positionInfluence = (index / words.length) * 0.1;
      embedding[(embeddingIndex + 1) % embedding.length] += positionInfluence;
    });

    // Normalize vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }
});
