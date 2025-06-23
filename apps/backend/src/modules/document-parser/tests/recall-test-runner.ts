#!/usr/bin/env node

/**
 * 🎯 Recall Test Runner
 *
 * Simple script to run and compare recall rates between traditional and parent-child chunking
 * Usage: npm run test:recall
 */

interface TestResult {
  queryId: string;
  query: string;
  traditional: {
    recall: number;
    precision: number;
    f1Score: number;
    foundSegments: number;
  };
  parentChild: {
    recall: number;
    precision: number;
    f1Score: number;
    foundSegments: number;
  };
  improvement: {
    recallImprovement: number;
    f1Improvement: number;
  };
}

interface TestQuery {
  id: string;
  query: string;
  expectedSegments: string[];
}

interface TraditionalChunk {
  id: string;
  content: string;
  type: string;
}

interface ParentSegment {
  id: string;
  content: string;
  type: string;
}

interface ChildSegment {
  id: string;
  content: string;
  type: string;
  parentId: string;
}

interface ParentChildStructure {
  parents: ParentSegment[];
  children: ChildSegment[];
}

class RecallTestRunner {
  private testDocument = `
# Database Performance Optimization: A Comprehensive Guide

Database performance optimization is a critical aspect of maintaining efficient and scalable applications. Poor database performance can lead to slow response times, increased server costs, and frustrated users. This comprehensive guide covers various strategies and techniques to optimize database performance across different database systems.

## Understanding Database Performance Bottlenecks

Before diving into optimization techniques, it's essential to understand what causes database performance issues. Common bottlenecks include inefficient queries, lack of proper indexing, inadequate hardware resources, and poor database design.

Query performance issues often stem from poorly written SQL statements that don't leverage indexes effectively. Full table scans are expensive operations that should be avoided whenever possible. Complex joins without proper indexing can significantly slow down query execution.

Hardware limitations such as insufficient RAM, slow disk I/O, or CPU constraints can severely impact database performance. Network latency between application servers and database servers also plays a crucial role in overall system performance.

Database design problems include denormalized schemas, missing foreign key constraints, and tables with too many columns. These issues can lead to data inconsistency and inefficient storage utilization.

## Indexing Strategies for Optimal Performance

Database indexes are specialized data structures that improve query performance by creating efficient pathways to data. Understanding when and how to use different types of indexes is crucial for database optimization.

B-tree indexes are the most common type of database index. They work well for equality comparisons and range queries on ordered data. B-tree indexes maintain sorted order and provide logarithmic time complexity for search operations.

Hash indexes are optimized for equality comparisons but cannot be used for range queries. They provide constant time lookup for exact matches but have limitations in functionality compared to B-tree indexes.

Composite indexes span multiple columns and can significantly improve performance for queries that filter on multiple fields. The order of columns in composite indexes matters greatly - the most selective column should typically come first.

Partial indexes only index rows that meet specific conditions, reducing index size and maintenance overhead. They are particularly useful for queries that frequently filter on specific subsets of data.

Covering indexes include all columns needed for a query, allowing the database to satisfy the query entirely from the index without accessing the actual table data. This can dramatically improve query performance.

## Query Optimization Techniques

Writing efficient queries is fundamental to database performance. Understanding how the database query optimizer works and how to influence its decisions is crucial for optimal performance.

Query execution plans show exactly how the database engine processes your queries. Learning to read and interpret execution plans helps identify performance bottlenecks and optimization opportunities.

JOIN operations can be expensive, especially when joining large tables. Using appropriate JOIN types (INNER, LEFT, RIGHT, FULL OUTER) and ensuring proper indexing on JOIN columns is essential for good performance.

WHERE clause optimization involves using selective conditions early in the query to reduce the dataset size. Avoid using functions in WHERE clauses as they can prevent index usage and force full table scans.

Subqueries vs JOINs present different performance characteristics. While subqueries can be more readable, JOINs often perform better. Modern query optimizers can sometimes convert subqueries to JOINs automatically.

LIMIT and OFFSET clauses can cause performance issues with large datasets. For better performance with large result sets, consider using cursor-based pagination instead of offset-based pagination.

## Caching Strategies and Implementation

Caching is one of the most effective ways to improve database performance by reducing the number of database queries and storing frequently accessed data in memory.

Query result caching stores the results of expensive queries in memory, reducing database load and improving response times. Cache invalidation strategies ensure data consistency while maintaining performance benefits.

Application-level caching using tools like Redis or Memcached can dramatically improve performance by storing computed results, session data, and frequently accessed objects in memory.

Database-level caching includes buffer pools, query plan caches, and result set caches. Proper configuration of these caches is essential for optimal database performance.

Cache warming strategies involve proactively loading frequently accessed data into cache before it's needed. This prevents cache misses during peak usage periods.

## Connection Management and Pooling

Efficient connection management is crucial for database performance, especially in applications with many concurrent users.

Connection pooling reduces the overhead of establishing database connections by reusing existing connections. This is particularly important for web applications that handle many concurrent requests.

Connection limits prevent database overload but must be balanced with application needs. Too few connections can create bottlenecks, while too many connections can overwhelm the database server.

Connection timeout settings help prevent resource leaks and ensure responsive applications. Proper configuration includes connection timeout, query timeout, and idle connection timeout.

Connection monitoring and metrics help identify connection-related performance issues. Tracking connection usage patterns can inform optimal pool sizing decisions.

## Hardware and Infrastructure Considerations

Database performance is heavily influenced by the underlying hardware and infrastructure configuration.

Storage considerations include the choice between SSD and HDD storage. SSDs provide significantly faster random access performance, which is crucial for database operations involving indexes and random reads.

Memory allocation affects buffer pool size, sort operations, and query execution performance. Adequate RAM allows the database to keep frequently accessed data in memory, reducing disk I/O.

CPU considerations include core count for parallel query execution and CPU speed for single-threaded operations. Database workloads often benefit from multiple cores for concurrent query processing.

Network infrastructure impacts performance, especially in distributed database systems. Network latency between application servers and database servers can significantly affect overall system performance.

## Monitoring and Performance Tuning

Continuous monitoring and performance tuning are essential for maintaining optimal database performance over time.

Performance metrics to track include query execution times, connection pool utilization, cache hit rates, and resource usage patterns. These metrics help identify performance degradation before it impacts users.

Automated monitoring tools can alert administrators to performance issues and provide detailed analytics on database performance trends. Setting up proper alerting thresholds is crucial for proactive performance management.

Regular performance audits help identify optimization opportunities and ensure that performance improvements are maintained over time. This includes reviewing query performance, index usage, and system resource utilization.

Performance testing should be conducted regularly to ensure that database performance meets application requirements under various load conditions. Load testing helps identify performance bottlenecks before they impact production systems.
`;

  private testQueries: TestQuery[] = [
    {
      id: 'Q1',
      query: 'What are the main types of database indexes?',
      expectedSegments: [
        'B-tree indexes are the most common type',
        'Hash indexes are optimized for equality',
        'Composite indexes span multiple columns',
        'Partial indexes only index rows',
        'Covering indexes include all columns',
        'Indexing Strategies for Optimal Performance',
      ],
    },
    {
      id: 'Q2',
      query: 'How can I optimize database query performance?',
      expectedSegments: [
        'Query execution plans show exactly how',
        'JOIN operations can be expensive',
        'WHERE clause optimization involves',
        'Subqueries vs JOINs present different',
        'LIMIT and OFFSET clauses can cause',
        'Query Optimization Techniques',
        'Writing efficient queries is fundamental',
      ],
    },
    {
      id: 'Q3',
      query: 'What caching strategies improve database performance?',
      expectedSegments: [
        'Query result caching stores the results',
        'Application-level caching using tools',
        'Database-level caching includes buffer pools',
        'Cache warming strategies involve proactively',
        'Caching Strategies and Implementation',
        'Caching is one of the most effective ways',
      ],
    },
    {
      id: 'Q4',
      query: 'How does hardware affect database performance?',
      expectedSegments: [
        'Storage considerations include the choice',
        'Memory allocation affects buffer pool',
        'CPU considerations include core count',
        'Network infrastructure impacts performance',
        'Hardware and Infrastructure Considerations',
        'Database performance is heavily influenced',
      ],
    },
    {
      id: 'Q5',
      query: 'What are common database performance bottlenecks?',
      expectedSegments: [
        'Common bottlenecks include inefficient queries',
        'Query performance issues often stem',
        'Hardware limitations such as insufficient RAM',
        'Database design problems include denormalized',
        'Understanding Database Performance Bottlenecks',
        'Full table scans are expensive operations',
      ],
    },
  ];

  runTests(): void {
    console.log('🎯 RECALL RATE COMPARISON TEST');
    console.log('==============================\n');

    const traditionalChunks = this.createTraditionalChunks();
    const parentChildStructure = this.createParentChildStructure();

    console.log(`📊 Test Setup:`);
    console.log(`  Traditional chunks: ${traditionalChunks.length}`);
    console.log(`  Parent segments: ${parentChildStructure.parents.length}`);
    console.log(`  Child segments: ${parentChildStructure.children.length}`);
    console.log(`  Test queries: ${this.testQueries.length}\n`);

    const results: TestResult[] = [];

    for (const testQuery of this.testQueries) {
      console.log(`🔍 Testing Query ${testQuery.id}: "${testQuery.query}"`);

      // Test traditional chunking
      const traditionalResult = this.measureTraditionalRecall(
        testQuery,
        traditionalChunks,
      );

      // Test parent-child chunking
      const parentChildResult = this.measureParentChildRecall(
        testQuery,
        parentChildStructure,
      );

      // Calculate improvements
      const recallImprovement =
        traditionalResult.recall > 0
          ? ((parentChildResult.recall - traditionalResult.recall) /
              traditionalResult.recall) *
            100
          : 0;

      const f1Improvement =
        traditionalResult.f1Score > 0
          ? ((parentChildResult.f1Score - traditionalResult.f1Score) /
              traditionalResult.f1Score) *
            100
          : 0;

      const result: TestResult = {
        queryId: testQuery.id,
        query: testQuery.query,
        traditional: traditionalResult,
        parentChild: parentChildResult,
        improvement: {
          recallImprovement,
          f1Improvement,
        },
      };

      results.push(result);

      // Display results
      console.log(
        `  Traditional: ${(traditionalResult.recall * 100).toFixed(1)}% recall, ${(traditionalResult.f1Score * 100).toFixed(1)}% F1`,
      );
      console.log(
        `  Parent-Child: ${(parentChildResult.recall * 100).toFixed(1)}% recall, ${(parentChildResult.f1Score * 100).toFixed(1)}% F1`,
      );
      console.log(
        `  Improvement: +${recallImprovement.toFixed(1)}% recall, +${f1Improvement.toFixed(1)}% F1\n`,
      );
    }

    this.generateSummaryReport(results);
  }

  private createTraditionalChunks(): TraditionalChunk[] {
    const chunkSize = 800; // NEW OPTIMIZED: BGE M3 optimized chunk size
    const overlap = 80; // NEW OPTIMIZED: 10% overlap for efficiency
    const chunks: TraditionalChunk[] = [];
    const cleanDoc = this.testDocument.replace(/\n\s*\n/g, '\n').trim();

    // Implement overlapping chunks for more realistic testing
    for (let i = 0; i < cleanDoc.length; i += chunkSize - overlap) {
      const chunk = cleanDoc.slice(i, i + chunkSize).trim();
      if (chunk.length > 100) {
        // Ensure meaningful content
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: chunk,
          type: 'traditional',
        });
      }

      // Stop if we've covered the entire document
      if (i + chunkSize >= cleanDoc.length) break;
    }

    return chunks;
  }

  private createParentChildStructure(): ParentChildStructure {
    const sections = this.testDocument
      .split(/(?=^#)/gm)
      .filter((s) => s.trim());
    const structure: ParentChildStructure = {
      parents: [],
      children: [],
    };

    sections.forEach((section, i) => {
      if (!section.trim()) return;

      // Create parent (full section)
      const parent: ParentSegment = {
        id: `parent_${i}`,
        content: section.trim(),
        type: 'parent',
      };
      structure.parents.push(parent);

      // Create children (paragraphs within section)
      const lines = section.split('\n').filter((l) => l.trim());
      const contentLines = lines.slice(1); // Skip header
      const paragraphs = contentLines
        .join('\n')
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 100);

      paragraphs.forEach((paragraph, j) => {
        const child: ChildSegment = {
          id: `child_${i}_${j}`,
          content: paragraph.trim(),
          type: 'child',
          parentId: parent.id,
        };
        structure.children.push(child);
      });
    });

    return structure;
  }

  private measureTraditionalRecall(
    testQuery: TestQuery,
    chunks: TraditionalChunk[],
  ): any {
    const matches = chunks.filter((chunk) =>
      testQuery.expectedSegments.some(
        (expected: string) =>
          chunk.content.toLowerCase().includes(expected.toLowerCase()) ||
          this.calculateSimilarity(chunk.content, expected) > 0.25, // Lower threshold for stricter matching
      ),
    );

    return this.calculateMetrics(
      testQuery.expectedSegments,
      matches.map((m) => m.content),
    );
  }

  private measureParentChildRecall(
    testQuery: TestQuery,
    structure: ParentChildStructure,
  ): any {
    const allSegments = [...structure.parents, ...structure.children];

    // Find direct matches
    const directMatches = allSegments.filter((segment) =>
      testQuery.expectedSegments.some(
        (expected: string) =>
          segment.content.toLowerCase().includes(expected.toLowerCase()) ||
          this.calculateSimilarity(segment.content, expected) > 0.25,
      ),
    );

    // Expand with parent-child relationships
    const expandedContent = new Set<string>();

    directMatches.forEach((match) => {
      expandedContent.add(match.content);

      // Add parent context for child matches
      if (match.type === 'child' && 'parentId' in match) {
        const parent = structure.parents.find(
          (p: ParentSegment) => p.id === match.parentId,
        );
        if (parent) expandedContent.add(parent.content);
      }

      // Add children for parent matches
      if (match.type === 'parent') {
        const children = structure.children.filter(
          (c: ChildSegment) => c.parentId === match.id,
        );
        children.forEach((child: ChildSegment) =>
          expandedContent.add(child.content),
        );
      }
    });

    return this.calculateMetrics(
      testQuery.expectedSegments,
      Array.from(expandedContent),
    );
  }

  private calculateMetrics(
    expectedSegments: string[],
    foundContent: string[],
  ): any {
    let truePositives = 0;

    expectedSegments.forEach((expected: string) => {
      const found = foundContent.some(
        (content: string) =>
          content.toLowerCase().includes(expected.toLowerCase()) ||
          this.calculateSimilarity(content, expected) > 0.3,
      );
      if (found) truePositives++;
    });

    const recall =
      expectedSegments.length > 0 ? truePositives / expectedSegments.length : 0;
    const precision =
      foundContent.length > 0 ? truePositives / foundContent.length : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return {
      recall,
      precision,
      f1Score,
      foundSegments: foundContent.length,
      truePositives,
    };
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private generateSummaryReport(results: TestResult[]): void {
    console.log('📈 SUMMARY REPORT');
    console.log('=================\n');

    // Calculate averages
    const avgTraditionalRecall =
      results.reduce((sum, r) => sum + r.traditional.recall, 0) /
      results.length;
    const avgParentChildRecall =
      results.reduce((sum, r) => sum + r.parentChild.recall, 0) /
      results.length;
    const avgRecallImprovement =
      results.reduce((sum, r) => sum + r.improvement.recallImprovement, 0) /
      results.length;

    const avgTraditionalF1 =
      results.reduce((sum, r) => sum + r.traditional.f1Score, 0) /
      results.length;
    const avgParentChildF1 =
      results.reduce((sum, r) => sum + r.parentChild.f1Score, 0) /
      results.length;
    const avgF1Improvement =
      results.reduce((sum, r) => sum + r.improvement.f1Improvement, 0) /
      results.length;

    console.log('📊 Average Performance:');
    console.log(`  Traditional Chunking:`);
    console.log(`    Recall: ${(avgTraditionalRecall * 100).toFixed(1)}%`);
    console.log(`    F1 Score: ${(avgTraditionalF1 * 100).toFixed(1)}%`);
    console.log(`  Parent-Child Chunking:`);
    console.log(`    Recall: ${(avgParentChildRecall * 100).toFixed(1)}%`);
    console.log(`    F1 Score: ${(avgParentChildF1 * 100).toFixed(1)}%`);

    console.log(`\n🎯 Overall Improvements:`);
    console.log(`  Recall Improvement: +${avgRecallImprovement.toFixed(1)}%`);
    console.log(`  F1 Score Improvement: +${avgF1Improvement.toFixed(1)}%`);

    // Performance analysis
    const significantImprovements = results.filter(
      (r) => r.improvement.recallImprovement > 20,
    ).length;
    const consistentImprovements = results.filter(
      (r) => r.improvement.recallImprovement > 0,
    ).length;

    console.log(`\n📈 Analysis:`);
    console.log(
      `  Queries with >20% recall improvement: ${significantImprovements}/${results.length}`,
    );
    console.log(
      `  Queries with any recall improvement: ${consistentImprovements}/${results.length}`,
    );
    console.log(
      `  Success rate: ${((consistentImprovements / results.length) * 100).toFixed(1)}%`,
    );

    // Detailed query analysis
    console.log(`\n🔍 Per-Query Analysis:`);
    results.forEach((result) => {
      const status =
        result.improvement.recallImprovement > 20
          ? '🚀'
          : result.improvement.recallImprovement > 0
            ? '✅'
            : '⚠️';
      console.log(
        `  ${status} ${result.queryId}: ${result.improvement.recallImprovement.toFixed(1)}% recall improvement`,
      );
    });

    // Conclusion
    if (avgRecallImprovement > 30) {
      console.log(
        `\n✅ CONCLUSION: Parent-Child Chunking shows SIGNIFICANT improvement (+${avgRecallImprovement.toFixed(1)}% recall)`,
      );
    } else if (avgRecallImprovement > 10) {
      console.log(
        `\n✅ CONCLUSION: Parent-Child Chunking shows MODERATE improvement (+${avgRecallImprovement.toFixed(1)}% recall)`,
      );
    } else {
      console.log(
        `\n⚠️  CONCLUSION: Parent-Child Chunking shows MINIMAL improvement (+${avgRecallImprovement.toFixed(1)}% recall)`,
      );
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const runner = new RecallTestRunner();
  runner.runTests();
}

export { RecallTestRunner };
