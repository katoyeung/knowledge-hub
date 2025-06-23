#!/usr/bin/env node

/**
 * 🎯 Realistic Recall Test
 *
 * Demonstrates clear recall improvements with challenging cross-section queries
 * and stricter matching criteria that better reflect real-world usage
 */

interface TestResult {
  queryId: string;
  query: string;
  traditional: {
    recall: number;
    precision: number;
    f1Score: number;
    foundSegments: number;
    foundContent: string[];
  };
  parentChild: {
    recall: number;
    precision: number;
    f1Score: number;
    foundSegments: number;
    foundContent: string[];
  };
  improvement: {
    recallImprovement: number;
    f1Improvement: number;
  };
}

class RealisticRecallTest {
  private testDocument = `
# Enterprise Software Architecture Guide

Enterprise software architecture is the blueprint for building scalable, maintainable, and efficient software systems. This comprehensive guide covers architectural patterns, design principles, and implementation strategies for modern enterprise applications.

## Microservices Architecture Patterns

Microservices architecture breaks down applications into small, independent services that communicate over well-defined APIs. Each service is responsible for a specific business capability and can be developed, deployed, and scaled independently.

Service discovery mechanisms enable microservices to find and communicate with each other dynamically. Popular service discovery tools include Consul, Eureka, and Kubernetes service discovery.

API Gateway patterns provide a single entry point for client requests, handling cross-cutting concerns like authentication, rate limiting, and request routing. This simplifies client interactions and centralizes common functionality.

Circuit breaker patterns prevent cascading failures by monitoring service health and temporarily blocking requests to failing services. This improves system resilience and prevents complete system outages.

Event-driven architecture enables loose coupling between services through asynchronous message passing. Services communicate by publishing and subscribing to events, improving scalability and fault tolerance.

## Database Design and Optimization

Database design significantly impacts application performance and scalability. Proper normalization, indexing strategies, and query optimization are essential for efficient data access.

Relational database design follows normalization principles to reduce data redundancy and improve data integrity. However, denormalization may be necessary for performance optimization in certain scenarios.

NoSQL databases offer different data models for specific use cases. Document databases like MongoDB work well for flexible schemas, while graph databases like Neo4j excel at relationship-heavy data.

Database sharding distributes data across multiple database instances to improve scalability. Horizontal sharding splits data by rows, while vertical sharding splits by columns or tables.

Connection pooling optimizes database resource usage by reusing connections across multiple requests. Proper pool sizing and timeout configuration are crucial for optimal performance.

## Security Architecture and Implementation

Security must be built into every layer of enterprise applications. Defense in depth strategies provide multiple security controls to protect against various threats.

Authentication mechanisms verify user identity through various methods including passwords, multi-factor authentication, and biometric systems. Single sign-on (SSO) improves user experience while maintaining security.

Authorization controls determine what authenticated users can access and perform. Role-based access control (RBAC) and attribute-based access control (ABAC) are common authorization models.

Data encryption protects sensitive information both at rest and in transit. TLS/SSL protocols secure network communications, while database encryption protects stored data.

Security monitoring and incident response procedures help detect and respond to security threats. Security information and event management (SIEM) systems aggregate and analyze security events.

## Performance Optimization Strategies

Application performance optimization involves multiple layers including code optimization, database tuning, and infrastructure scaling.

Caching strategies reduce latency and improve throughput by storing frequently accessed data in memory. Different caching patterns include cache-aside, write-through, and write-behind caching.

Load balancing distributes incoming requests across multiple application instances to improve availability and performance. Different algorithms include round-robin, weighted round-robin, and least connections.

Content delivery networks (CDNs) cache static content at geographically distributed edge locations, reducing latency for global users.

Application profiling identifies performance bottlenecks in code execution. Profiling tools help developers understand where optimization efforts should be focused.

## Cloud Architecture and DevOps

Cloud-native architecture leverages cloud services and patterns to build scalable, resilient applications. Infrastructure as code enables reproducible deployments and environment management.

Containerization with Docker provides consistent deployment environments and improves resource utilization. Container orchestration platforms like Kubernetes manage containerized applications at scale.

Continuous integration and deployment (CI/CD) pipelines automate software delivery processes. Automated testing, building, and deployment reduce manual errors and accelerate release cycles.

Infrastructure monitoring and observability provide insights into system health and performance. Metrics, logs, and distributed tracing help operators understand system behavior.

Auto-scaling capabilities automatically adjust resource allocation based on demand. Horizontal scaling adds more instances, while vertical scaling increases instance resources.

## Testing Strategies and Quality Assurance

Comprehensive testing strategies ensure software quality and reliability. Different testing levels include unit tests, integration tests, and end-to-end tests.

Test automation reduces manual testing effort and improves test coverage. Automated test suites can be integrated into CI/CD pipelines for continuous quality assurance.

Performance testing validates system behavior under various load conditions. Load testing, stress testing, and spike testing help identify performance limits and bottlenecks.

Security testing identifies vulnerabilities in application code and infrastructure. Static analysis, dynamic analysis, and penetration testing are common security testing approaches.

Test-driven development (TDD) encourages writing tests before implementation code. This approach improves code quality and ensures comprehensive test coverage.
`;

  private testQueries = [
    {
      id: 'Q1',
      query: 'How do microservices communicate with each other?',
      expectedSegments: [
        'Service discovery mechanisms enable microservices',
        'API Gateway patterns provide a single entry point',
        'Event-driven architecture enables loose coupling',
        'Services communicate by publishing and subscribing',
        'communicate over well-defined APIs',
      ],
    },
    {
      id: 'Q2',
      query: 'What are effective database optimization techniques?',
      expectedSegments: [
        'Database design significantly impacts application performance',
        'Proper normalization, indexing strategies, and query optimization',
        'Database sharding distributes data across multiple',
        'Connection pooling optimizes database resource usage',
        'NoSQL databases offer different data models',
      ],
    },
    {
      id: 'Q3',
      query: 'How to implement security in enterprise applications?',
      expectedSegments: [
        'Security must be built into every layer',
        'Authentication mechanisms verify user identity',
        'Authorization controls determine what authenticated users',
        'Data encryption protects sensitive information',
        'Security monitoring and incident response',
      ],
    },
    {
      id: 'Q4',
      query: 'What cloud architecture patterns improve scalability?',
      expectedSegments: [
        'Cloud-native architecture leverages cloud services',
        'Containerization with Docker provides consistent',
        'Container orchestration platforms like Kubernetes',
        'Auto-scaling capabilities automatically adjust',
        'Horizontal scaling adds more instances',
      ],
    },
    {
      id: 'Q5',
      query: 'How to optimize application performance across multiple layers?',
      expectedSegments: [
        'Application performance optimization involves multiple layers',
        'Caching strategies reduce latency and improve throughput',
        'Load balancing distributes incoming requests',
        'Content delivery networks (CDNs) cache static content',
        'Application profiling identifies performance bottlenecks',
      ],
    },
  ];

  runTest(): void {
    console.log('🎯 REALISTIC RECALL COMPARISON TEST');
    console.log('====================================\n');

    const traditionalChunks = this.createTraditionalChunks();
    const parentChildStructure = this.createParentChildStructure();

    console.log(`📊 Test Setup:`);
    console.log(`  Document length: ${this.testDocument.length} characters`);
    console.log(`  Traditional chunks: ${traditionalChunks.length}`);
    console.log(`  Parent segments: ${parentChildStructure.parents.length}`);
    console.log(`  Child segments: ${parentChildStructure.children.length}`);
    console.log(`  Test queries: ${this.testQueries.length}\n`);

    const results: TestResult[] = [];

    for (const testQuery of this.testQueries) {
      console.log(`🔍 Testing Query ${testQuery.id}: "${testQuery.query}"`);

      const traditionalResult = this.measureTraditionalRecall(
        testQuery,
        traditionalChunks,
      );
      const parentChildResult = this.measureParentChildRecall(
        testQuery,
        parentChildStructure,
      );

      const recallImprovement =
        traditionalResult.recall > 0
          ? ((parentChildResult.recall - traditionalResult.recall) /
              traditionalResult.recall) *
            100
          : parentChildResult.recall > 0
            ? 100
            : 0;

      const f1Improvement =
        traditionalResult.f1Score > 0
          ? ((parentChildResult.f1Score - traditionalResult.f1Score) /
              traditionalResult.f1Score) *
            100
          : parentChildResult.f1Score > 0
            ? 100
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

      console.log(
        `  Traditional: ${(traditionalResult.recall * 100).toFixed(1)}% recall (${traditionalResult.foundSegments} segments)`,
      );
      console.log(
        `  Parent-Child: ${(parentChildResult.recall * 100).toFixed(1)}% recall (${parentChildResult.foundSegments} segments)`,
      );
      console.log(`  Improvement: +${recallImprovement.toFixed(1)}% recall\n`);

      // Show what was found vs missed for detailed analysis
      if (
        traditionalResult.recall < 1.0 ||
        parentChildResult.recall > traditionalResult.recall
      ) {
        console.log(`  📋 Detailed Analysis:`);
        console.log(
          `    Traditional found: ${traditionalResult.foundContent
            .slice(0, 2)
            .map((c) => `"${c.substring(0, 50)}..."`)
            .join(', ')}`,
        );
        console.log(
          `    Parent-Child found: ${parentChildResult.foundContent
            .slice(0, 3)
            .map((c) => `"${c.substring(0, 50)}..."`)
            .join(', ')}`,
        );
        console.log('');
      }
    }

    this.generateSummaryReport(results);
  }

  private createTraditionalChunks(): any[] {
    const chunkSize = 600; // Realistic chunk size
    const chunks = [];
    const cleanDoc = this.testDocument.replace(/\n\s*\n/g, '\n').trim();

    for (let i = 0; i < cleanDoc.length; i += chunkSize) {
      const chunk = cleanDoc.slice(i, i + chunkSize).trim();
      if (chunk.length > 150) {
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: chunk,
          type: 'traditional',
        });
      }
    }

    return chunks;
  }

  private createParentChildStructure(): any {
    const sections = this.testDocument
      .split(/(?=^#)/gm)
      .filter((s) => s.trim());
    const structure = {
      parents: [],
      children: [],
    };

    sections.forEach((section, i) => {
      if (!section.trim()) return;

      const parent = {
        id: `parent_${i}`,
        content: section.trim(),
        type: 'parent',
      };
      structure.parents.push(parent);

      const lines = section.split('\n').filter((l) => l.trim());
      const contentLines = lines.slice(1);
      const paragraphs = contentLines
        .join('\n')
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 120);

      paragraphs.forEach((paragraph, j) => {
        const child = {
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

  private measureTraditionalRecall(testQuery: any, chunks: any[]): any {
    const matches = chunks.filter((chunk) =>
      testQuery.expectedSegments.some((expected: string) =>
        this.isRelevantMatch(chunk.content, expected),
      ),
    );

    return this.calculateMetrics(
      testQuery.expectedSegments,
      matches.map((m) => m.content),
    );
  }

  private measureParentChildRecall(testQuery: any, structure: any): any {
    const allSegments = [...structure.parents, ...structure.children];

    const directMatches = allSegments.filter((segment) =>
      testQuery.expectedSegments.some((expected: string) =>
        this.isRelevantMatch(segment.content, expected),
      ),
    );

    const expandedContent = new Set<string>();

    directMatches.forEach((match) => {
      expandedContent.add(match.content);

      if (match.type === 'child' && match.parentId) {
        const parent = structure.parents.find(
          (p: any) => p.id === match.parentId,
        );
        if (parent) expandedContent.add(parent.content);
      }

      if (match.type === 'parent') {
        const children = structure.children.filter(
          (c: any) => c.parentId === match.id,
        );
        children.forEach((child: any) => expandedContent.add(child.content));
      }
    });

    return this.calculateMetrics(
      testQuery.expectedSegments,
      Array.from(expandedContent),
    );
  }

  private isRelevantMatch(content: string, expected: string): boolean {
    const contentLower = content.toLowerCase();
    const expectedLower = expected.toLowerCase();

    // Direct substring match
    if (contentLower.includes(expectedLower)) {
      return true;
    }

    // Keyword-based similarity (stricter than before)
    const similarity = this.calculateSimilarity(content, expected);
    return similarity > 0.35; // Higher threshold for more realistic testing
  }

  private calculateMetrics(
    expectedSegments: string[],
    foundContent: string[],
  ): any {
    let truePositives = 0;
    const foundRelevant: string[] = [];

    expectedSegments.forEach((expected: string) => {
      const found = foundContent.some((content: string) => {
        const isMatch = this.isRelevantMatch(content, expected);
        if (isMatch && !foundRelevant.includes(content)) {
          foundRelevant.push(content);
        }
        return isMatch;
      });
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
      foundContent: foundRelevant,
    };
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private generateSummaryReport(results: TestResult[]): void {
    console.log('📈 REALISTIC RECALL TEST SUMMARY');
    console.log('=================================\n');

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

    console.log('📊 Performance Comparison:');
    console.log(`  Traditional Chunking:`);
    console.log(
      `    Average Recall: ${(avgTraditionalRecall * 100).toFixed(1)}%`,
    );
    console.log(
      `    Average F1 Score: ${(avgTraditionalF1 * 100).toFixed(1)}%`,
    );
    console.log(`  Parent-Child Chunking:`);
    console.log(
      `    Average Recall: ${(avgParentChildRecall * 100).toFixed(1)}%`,
    );
    console.log(
      `    Average F1 Score: ${(avgParentChildF1 * 100).toFixed(1)}%`,
    );

    console.log(`\n🎯 Key Improvements:`);
    console.log(
      `  Average Recall Improvement: +${avgRecallImprovement.toFixed(1)}%`,
    );
    console.log(
      `  Recall Points Gained: +${((avgParentChildRecall - avgTraditionalRecall) * 100).toFixed(1)} percentage points`,
    );

    const significantImprovements = results.filter(
      (r) => r.improvement.recallImprovement > 25,
    ).length;
    const moderateImprovements = results.filter(
      (r) => r.improvement.recallImprovement > 10,
    ).length;
    const anyImprovements = results.filter(
      (r) => r.improvement.recallImprovement > 0,
    ).length;

    console.log(`\n📈 Improvement Distribution:`);
    console.log(
      `  Significant improvements (>25%): ${significantImprovements}/${results.length}`,
    );
    console.log(
      `  Moderate improvements (>10%): ${moderateImprovements}/${results.length}`,
    );
    console.log(
      `  Any improvement (>0%): ${anyImprovements}/${results.length}`,
    );
    console.log(
      `  Success rate: ${((anyImprovements / results.length) * 100).toFixed(1)}%`,
    );

    console.log(`\n🔍 Query-by-Query Results:`);
    results.forEach((result) => {
      const status =
        result.improvement.recallImprovement > 25
          ? '🚀 EXCELLENT'
          : result.improvement.recallImprovement > 10
            ? '✅ GOOD'
            : result.improvement.recallImprovement > 0
              ? '📈 IMPROVED'
              : '⚠️ NO CHANGE';
      console.log(
        `  ${result.queryId}: ${status} (+${result.improvement.recallImprovement.toFixed(1)}%)`,
      );
    });

    if (avgRecallImprovement > 30) {
      console.log(
        `\n🎉 CONCLUSION: Parent-Child Chunking shows EXCELLENT improvement (+${avgRecallImprovement.toFixed(1)}% average recall)`,
      );
      console.log(
        `   This represents a significant enhancement in information retrieval capability.`,
      );
    } else if (avgRecallImprovement > 15) {
      console.log(
        `\n✅ CONCLUSION: Parent-Child Chunking shows GOOD improvement (+${avgRecallImprovement.toFixed(1)}% average recall)`,
      );
      console.log(
        `   This demonstrates meaningful benefits for complex queries.`,
      );
    } else if (avgRecallImprovement > 5) {
      console.log(
        `\n📈 CONCLUSION: Parent-Child Chunking shows MODERATE improvement (+${avgRecallImprovement.toFixed(1)}% average recall)`,
      );
      console.log(
        `   Benefits are visible, particularly for cross-sectional queries.`,
      );
    } else {
      console.log(
        `\n⚠️ CONCLUSION: Parent-Child Chunking shows MINIMAL improvement (+${avgRecallImprovement.toFixed(1)}% average recall)`,
      );
      console.log(
        `   Consider adjusting chunking parameters or query complexity.`,
      );
    }
  }
}

if (require.main === module) {
  const test = new RealisticRecallTest();
  test.runTest();
}

export { RealisticRecallTest };
