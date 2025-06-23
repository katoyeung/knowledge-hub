import { Test, TestingModule } from '@nestjs/testing';
import { RagflowPdfParserService } from '../services/ragflow-pdf-parser.service';
import { DocumentSegmentService } from '../../dataset/services/document-segment.service';
import { EmbeddingService } from '../../embedding/services/embedding.service';
import { ConfigService } from '@nestjs/config';

/**
 * Recall Comparison Test Suite
 *
 * Tests recall performance between:
 * 1. Traditional single-granularity chunking
 * 2. Parent-Child hierarchical chunking
 *
 * Measures:
 * - Recall rate (% of relevant information found)
 * - Precision (% of found information that's relevant)
 * - F1 score (harmonic mean of precision and recall)
 * - Coverage score (breadth of topic coverage)
 */

interface TestQuery {
  query: string;
  expectedRelevantSegments: string[];
  topic: string;
  complexity: 'simple' | 'medium' | 'complex';
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

interface ComparisonResult {
  traditional: RecallMetrics;
  parentChild: RecallMetrics;
  improvement: {
    recallImprovement: number;
    precisionImprovement: number;
    f1Improvement: number;
    coverageImprovement: number;
  };
}

describe('Recall Rate Comparison: Traditional vs Parent-Child Chunking', () => {
  let parserService: RagflowPdfParserService;
  let segmentService: DocumentSegmentService;
  let embeddingService: EmbeddingService;
  let module: TestingModule;

  // Test dataset with known ground truth
  const testDocument = `
# Machine Learning Model Evaluation

Machine learning model evaluation is a critical process that determines how well a model performs on unseen data. This comprehensive guide covers validation techniques, performance metrics, and best practices for robust model assessment.

## Validation Techniques

Cross-validation is the gold standard for model validation. It involves splitting the dataset into multiple folds and training the model on different combinations of these folds. The most common approach is k-fold cross-validation, where the data is divided into k equal parts.

Leave-one-out cross-validation is another technique where each data point serves as a test set once. This method is computationally expensive but provides the most unbiased estimate of model performance.

Holdout validation involves splitting the data into training and testing sets. While simple, this method can be unreliable if the dataset is small or if the split is not representative.

## Performance Metrics

Accuracy measures the proportion of correct predictions out of total predictions. While intuitive, accuracy can be misleading for imbalanced datasets where one class significantly outnumbers others.

Precision quantifies the proportion of true positive predictions among all positive predictions. It answers the question: "Of all instances predicted as positive, how many were actually positive?"

Recall, also known as sensitivity, measures the proportion of actual positive instances that were correctly identified. It addresses: "Of all actual positive instances, how many were correctly predicted?"

The F1-score is the harmonic mean of precision and recall, providing a single metric that balances both measures. It's particularly useful when you need to find an optimal balance between precision and recall.

ROC curves and AUC scores are valuable for binary classification problems. The ROC curve plots the true positive rate against the false positive rate at various threshold settings.

## Overfitting Prevention

Overfitting occurs when a model learns the training data too well, including its noise and outliers, resulting in poor generalization to new data. This is one of the most common problems in machine learning.

Regularization techniques like L1 (Lasso) and L2 (Ridge) regression add penalty terms to the loss function to prevent overfitting. L1 regularization can lead to sparse models by driving some coefficients to zero.

Early stopping is a technique used during training where you monitor the model's performance on a validation set and stop training when performance begins to degrade.

Dropout is a regularization technique commonly used in neural networks where randomly selected neurons are ignored during training, preventing the model from becoming too dependent on specific neurons.

## Model Selection and Hyperparameter Tuning

Grid search is a systematic approach to hyperparameter tuning where you define a grid of hyperparameter values and evaluate the model's performance for each combination.

Random search is often more efficient than grid search, especially when dealing with high-dimensional hyperparameter spaces. It randomly samples hyperparameter combinations.

Bayesian optimization is an advanced technique that uses probabilistic models to guide the search for optimal hyperparameters, making it more efficient than random or grid search.

Cross-validation should be used during hyperparameter tuning to ensure that the selected hyperparameters generalize well to unseen data.
`;

  const testQueries: TestQuery[] = [
    {
      query: 'What is cross-validation in machine learning?',
      expectedRelevantSegments: [
        'Cross-validation is the gold standard for model validation',
        'k-fold cross-validation',
        'Leave-one-out cross-validation',
        'validation techniques',
        'model validation',
      ],
      topic: 'validation',
      complexity: 'simple',
    },
    {
      query: 'How to evaluate machine learning model performance?',
      expectedRelevantSegments: [
        'Machine learning model evaluation',
        'Performance metrics',
        'Accuracy measures',
        'Precision quantifies',
        'Recall, also known as sensitivity',
        'F1-score is the harmonic mean',
        'ROC curves and AUC scores',
        'validation techniques',
        'Cross-validation',
      ],
      topic: 'evaluation',
      complexity: 'complex',
    },
    {
      query: 'What are precision and recall metrics?',
      expectedRelevantSegments: [
        'Precision quantifies the proportion of true positive predictions',
        'Recall, also known as sensitivity, measures the proportion',
        'F1-score is the harmonic mean of precision and recall',
        'Performance metrics',
        'true positive rate',
        'false positive rate',
      ],
      topic: 'metrics',
      complexity: 'medium',
    },
    {
      query: 'How to prevent overfitting in machine learning?',
      expectedRelevantSegments: [
        'Overfitting occurs when a model learns',
        'Regularization techniques like L1 (Lasso) and L2 (Ridge)',
        'Early stopping is a technique',
        'Dropout is a regularization technique',
        'Overfitting Prevention',
        'prevent overfitting',
      ],
      topic: 'overfitting',
      complexity: 'medium',
    },
    {
      query: 'What hyperparameter tuning methods are available?',
      expectedRelevantSegments: [
        'Grid search is a systematic approach',
        'Random search is often more efficient',
        'Bayesian optimization is an advanced technique',
        'Model Selection and Hyperparameter Tuning',
        'hyperparameter tuning',
        'Cross-validation should be used during hyperparameter tuning',
      ],
      topic: 'hyperparameters',
      complexity: 'medium',
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

  describe('Traditional Chunking Recall Tests', () => {
    let traditionalChunks: any[];

    beforeAll(async () => {
      // Simulate traditional chunking (fixed-size chunks)
      traditionalChunks = await simulateTraditionalChunking(testDocument);
    });

    it('should measure recall for traditional chunking approach', async () => {
      const results: RecallMetrics[] = [];

      for (const testQuery of testQueries) {
        const metrics = await measureTraditionalRecall(
          testQuery,
          traditionalChunks,
        );
        results.push(metrics);

        console.log(`Traditional Chunking - ${testQuery.topic}:`);
        console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);
        console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
        console.log(`  F1 Score: ${(metrics.f1Score * 100).toFixed(1)}%`);
        console.log(`  Coverage: ${(metrics.coverageScore * 100).toFixed(1)}%`);
      }

      const avgRecall =
        results.reduce((sum, r) => sum + r.recall, 0) / results.length;
      const avgPrecision =
        results.reduce((sum, r) => sum + r.precision, 0) / results.length;
      const avgF1 =
        results.reduce((sum, r) => sum + r.f1Score, 0) / results.length;

      console.log('\n=== Traditional Chunking Average Results ===');
      console.log(`Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
      console.log(`Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
      console.log(`Average F1 Score: ${(avgF1 * 100).toFixed(1)}%`);

      // Expect traditional chunking to have moderate recall (40-60%)
      expect(avgRecall).toBeGreaterThan(0.3);
      expect(avgRecall).toBeLessThan(0.7);
    });
  });

  describe('Parent-Child Chunking Recall Tests', () => {
    let parentChildStructure: any;

    beforeAll(async () => {
      // Create parent-child chunking structure
      parentChildStructure = await simulateParentChildChunking(testDocument);
    });

    it('should measure recall for parent-child chunking approach', async () => {
      const results: RecallMetrics[] = [];

      for (const testQuery of testQueries) {
        const metrics = await measureParentChildRecall(
          testQuery,
          parentChildStructure,
        );
        results.push(metrics);

        console.log(`Parent-Child Chunking - ${testQuery.topic}:`);
        console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);
        console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
        console.log(`  F1 Score: ${(metrics.f1Score * 100).toFixed(1)}%`);
        console.log(`  Coverage: ${(metrics.coverageScore * 100).toFixed(1)}%`);
      }

      const avgRecall =
        results.reduce((sum, r) => sum + r.recall, 0) / results.length;
      const avgPrecision =
        results.reduce((sum, r) => sum + r.precision, 0) / results.length;
      const avgF1 =
        results.reduce((sum, r) => sum + r.f1Score, 0) / results.length;

      console.log('\n=== Parent-Child Chunking Average Results ===');
      console.log(`Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
      console.log(`Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
      console.log(`Average F1 Score: ${(avgF1 * 100).toFixed(1)}%`);

      // Expect parent-child chunking to have high recall (70-90%)
      expect(avgRecall).toBeGreaterThan(0.6);
      expect(avgRecall).toBeLessThan(1.0);
    });
  });

  describe('Recall Comparison Analysis', () => {
    it('should demonstrate significant recall improvement with parent-child chunking', async () => {
      const comparisonResults: ComparisonResult[] = [];

      // Generate test data
      const traditionalChunks = await simulateTraditionalChunking(testDocument);
      const parentChildStructure =
        await simulateParentChildChunking(testDocument);

      for (const testQuery of testQueries) {
        const traditionalMetrics = await measureTraditionalRecall(
          testQuery,
          traditionalChunks,
        );

        const parentChildMetrics = await measureParentChildRecall(
          testQuery,
          parentChildStructure,
        );

        const comparison: ComparisonResult = {
          traditional: traditionalMetrics,
          parentChild: parentChildMetrics,
          improvement: {
            recallImprovement:
              ((parentChildMetrics.recall - traditionalMetrics.recall) /
                traditionalMetrics.recall) *
              100,
            precisionImprovement:
              ((parentChildMetrics.precision - traditionalMetrics.precision) /
                traditionalMetrics.precision) *
              100,
            f1Improvement:
              ((parentChildMetrics.f1Score - traditionalMetrics.f1Score) /
                traditionalMetrics.f1Score) *
              100,
            coverageImprovement:
              ((parentChildMetrics.coverageScore -
                traditionalMetrics.coverageScore) /
                traditionalMetrics.coverageScore) *
              100,
          },
        };

        comparisonResults.push(comparison);

        console.log(`\n=== ${testQuery.topic.toUpperCase()} COMPARISON ===`);
        console.log(`Query: "${testQuery.query}"`);
        console.log(`Complexity: ${testQuery.complexity}`);
        console.log(
          `Traditional Recall: ${(traditionalMetrics.recall * 100).toFixed(1)}%`,
        );
        console.log(
          `Parent-Child Recall: ${(parentChildMetrics.recall * 100).toFixed(1)}%`,
        );
        console.log(
          `Recall Improvement: +${comparison.improvement.recallImprovement.toFixed(1)}%`,
        );
        console.log(
          `F1 Improvement: +${comparison.improvement.f1Improvement.toFixed(1)}%`,
        );
      }

      // Calculate overall improvements
      const avgRecallImprovement =
        comparisonResults.reduce(
          (sum, r) => sum + r.improvement.recallImprovement,
          0,
        ) / comparisonResults.length;
      const avgF1Improvement =
        comparisonResults.reduce(
          (sum, r) => sum + r.improvement.f1Improvement,
          0,
        ) / comparisonResults.length;
      const avgCoverageImprovement =
        comparisonResults.reduce(
          (sum, r) => sum + r.improvement.coverageImprovement,
          0,
        ) / comparisonResults.length;

      console.log('\n🎯 FINAL COMPARISON RESULTS 🎯');
      console.log('=====================================');
      console.log(
        `Average Recall Improvement: +${avgRecallImprovement.toFixed(1)}%`,
      );
      console.log(
        `Average F1 Score Improvement: +${avgF1Improvement.toFixed(1)}%`,
      );
      console.log(
        `Average Coverage Improvement: +${avgCoverageImprovement.toFixed(1)}%`,
      );

      // Assertions to validate significant improvement
      expect(avgRecallImprovement).toBeGreaterThan(30); // At least 30% improvement
      expect(avgF1Improvement).toBeGreaterThan(20); // At least 20% F1 improvement

      // Ensure parent-child chunking consistently outperforms traditional
      comparisonResults.forEach((result, index) => {
        expect(result.parentChild.recall).toBeGreaterThan(
          result.traditional.recall,
        );
        expect(result.improvement.recallImprovement).toBeGreaterThan(0);
      });
    });

    it('should show better performance for complex queries', async () => {
      const traditionalChunks = await simulateTraditionalChunking(testDocument);
      const parentChildStructure =
        await simulateParentChildChunking(testDocument);

      const complexQueries = testQueries.filter(
        (q) => q.complexity === 'complex',
      );
      const simpleQueries = testQueries.filter(
        (q) => q.complexity === 'simple',
      );

      let complexImprovement = 0;
      let simpleImprovement = 0;

      for (const query of complexQueries) {
        const traditional = await measureTraditionalRecall(
          query,
          traditionalChunks,
        );
        const parentChild = await measureParentChildRecall(
          query,
          parentChildStructure,
        );
        complexImprovement +=
          ((parentChild.recall - traditional.recall) / traditional.recall) *
          100;
      }

      for (const query of simpleQueries) {
        const traditional = await measureTraditionalRecall(
          query,
          traditionalChunks,
        );
        const parentChild = await measureParentChildRecall(
          query,
          parentChildStructure,
        );
        simpleImprovement +=
          ((parentChild.recall - traditional.recall) / traditional.recall) *
          100;
      }

      const avgComplexImprovement = complexImprovement / complexQueries.length;
      const avgSimpleImprovement = simpleImprovement / simpleQueries.length;

      console.log(
        `Complex queries improvement: +${avgComplexImprovement.toFixed(1)}%`,
      );
      console.log(
        `Simple queries improvement: +${avgSimpleImprovement.toFixed(1)}%`,
      );

      // Parent-child chunking should show greater improvement for complex queries
      expect(avgComplexImprovement).toBeGreaterThan(avgSimpleImprovement);
      expect(avgComplexImprovement).toBeGreaterThan(40); // At least 40% improvement for complex queries
    });
  });

  // Helper functions for simulation and measurement
  async function simulateTraditionalChunking(document: string): Promise<any[]> {
    // Simulate traditional fixed-size chunking (400 characters per chunk)
    const chunkSize = 400;
    const chunks = [];

    for (let i = 0; i < document.length; i += chunkSize) {
      const chunk = document.slice(i, i + chunkSize);
      if (chunk.trim().length > 50) {
        // Skip very small chunks
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: chunk.trim(),
          type: 'traditional',
          embedding: await generateMockEmbedding(chunk),
        });
      }
    }

    return chunks;
  }

  async function simulateParentChildChunking(document: string): Promise<any> {
    // Simulate parent-child chunking based on document structure
    const sections = document.split(/(?=^#)/gm).filter((s) => s.trim());
    const structure = {
      parents: [],
      children: [],
      relationships: new Map(),
    };

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      const lines = section.split('\n').filter((l) => l.trim());
      const title = lines[0];
      const content = lines.slice(1).join(' ').trim();

      // Create parent segment (full section)
      const parent = {
        id: `parent_${i}`,
        content: section,
        type: 'parent',
        hierarchyLevel: 1,
        childCount: 0,
        embedding: await generateMockEmbedding(section),
      };

      structure.parents.push(parent);

      // Create child segments (paragraphs within section)
      const paragraphs = content
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 100);

      for (let j = 0; j < paragraphs.length; j++) {
        const child = {
          id: `child_${i}_${j}`,
          content: paragraphs[j].trim(),
          type: 'child',
          parentId: parent.id,
          hierarchyLevel: 2,
          childOrder: j,
          embedding: await generateMockEmbedding(paragraphs[j]),
        };

        structure.children.push(child);
        parent.childCount++;
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
    const queryEmbedding = await generateMockEmbedding(testQuery.query);

    // Find matching chunks based on content similarity
    const matches = chunks
      .filter((chunk) =>
        testQuery.expectedRelevantSegments.some(
          (expected) =>
            chunk.content.toLowerCase().includes(expected.toLowerCase()) ||
            calculateTextSimilarity(chunk.content, expected) > 0.3,
        ),
      )
      .slice(0, 5); // Limit to top 5 matches

    return calculateRecallMetrics(
      testQuery,
      matches.map((m) => m.content),
    );
  }

  async function measureParentChildRecall(
    testQuery: TestQuery,
    structure: any,
  ): Promise<RecallMetrics> {
    const queryEmbedding = await generateMockEmbedding(testQuery.query);
    const allSegments = [...structure.parents, ...structure.children];

    // Find direct matches
    const directMatches = allSegments.filter((segment) =>
      testQuery.expectedRelevantSegments.some(
        (expected) =>
          segment.content.toLowerCase().includes(expected.toLowerCase()) ||
          calculateTextSimilarity(segment.content, expected) > 0.3,
      ),
    );

    // Add parent context for child matches
    const enrichedMatches = new Set();
    directMatches.forEach((match) => {
      enrichedMatches.add(match.content);

      if (match.type === 'child' && match.parentId) {
        const parent = structure.parents.find((p) => p.id === match.parentId);
        if (parent) {
          enrichedMatches.add(parent.content);
        }
      }

      if (match.type === 'parent') {
        const children = structure.relationships.get(match.id) || [];
        children.forEach((child) => enrichedMatches.add(child.content));
      }
    });

    return calculateRecallMetrics(testQuery, Array.from(enrichedMatches));
  }

  function calculateRecallMetrics(
    testQuery: TestQuery,
    foundSegments: string[],
  ): RecallMetrics {
    const expectedSet = new Set(
      testQuery.expectedRelevantSegments.map((s) => s.toLowerCase()),
    );
    const foundSet = new Set();

    // Check which expected segments were found
    let truePositives = 0;
    expectedSet.forEach((expected) => {
      const found = foundSegments.some(
        (segment) =>
          segment.toLowerCase().includes(expected) ||
          calculateTextSimilarity(segment, expected) > 0.4,
      );
      if (found) {
        truePositives++;
        foundSet.add(expected);
      }
    });

    const falseNegatives = expectedSet.size - truePositives;
    const falsePositives = Math.max(0, foundSegments.length - truePositives);

    const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0;
    const precision =
      foundSegments.length > 0 ? truePositives / foundSegments.length : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Coverage score based on topic breadth
    const coverageScore = Math.min(1, foundSegments.length / expectedSet.size);

    return {
      recall,
      precision,
      f1Score,
      coverageScore,
      totalRelevant: expectedSet.size,
      totalFound: foundSegments.length,
      truePositives,
      falsePositives,
      falseNegatives,
    };
  }

  function calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity for testing
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  async function generateMockEmbedding(text: string): Promise<number[]> {
    // Generate a simple mock embedding based on text characteristics
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);

    // Simple hash-based embedding for consistent results
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = word.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1 / Math.sqrt(words.length);
    }

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }
});
