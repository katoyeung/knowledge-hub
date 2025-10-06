import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EmbeddingTestController } from '../src/modules/embedding-test/controllers/embedding-test.controller';
import { EmbeddingTestService } from '../src/modules/embedding-test/services/embedding-test.service';

describe('EmbeddingTestController (e2e) - Simple', () => {
  let app: INestApplication;
  let jwtToken: string;

  // Mock EmbeddingTestService
  const mockEmbeddingTestService = {
    runEmbeddingTests: jest.fn(),
    getPredefinedTestConfigs: jest.fn().mockReturnValue([
      {
        name: 'BGE-M3 - Small Chunks (500 chars)',
        embeddingModel: 'Xenova/bge-m3',
        embeddingModelProvider: 'local',
        textSplitter: 'recursive_character',
        chunkSize: 500,
        chunkOverlap: 100,
        enableParentChildChunking: false,
        expectedDimensions: 1024,
        description: 'Testing chunk size constraints with very small chunks',
      },
      {
        name: 'BGE-M3 - Medium Chunks (800 chars)',
        embeddingModel: 'Xenova/bge-m3',
        embeddingModelProvider: 'local',
        textSplitter: 'recursive_character',
        chunkSize: 800,
        chunkOverlap: 160,
        enableParentChildChunking: false,
        expectedDimensions: 1024,
        description: 'Testing chunk size constraints with medium chunks',
      },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddingTestController],
      providers: [
        {
          provide: EmbeddingTestService,
          useValue: mockEmbeddingTestService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Mock JWT token for authentication
    jwtToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/api/embedding-tests/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/embedding-tests/health')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'healthy');
          expect(res.body).toHaveProperty('timestamp');
          expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
        });
    });
  });

  describe('/api/embedding-tests/configs/predefined (GET)', () => {
    it('should return predefined configurations', () => {
      return request(app.getHttpServer())
        .get('/api/embedding-tests/configs/predefined')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);

          const firstConfig = res.body[0];
          expect(firstConfig).toHaveProperty('name');
          expect(firstConfig).toHaveProperty('embeddingModel');
          expect(firstConfig).toHaveProperty('embeddingModelProvider');
          expect(firstConfig).toHaveProperty('textSplitter');
          expect(firstConfig).toHaveProperty('chunkSize');
          expect(firstConfig).toHaveProperty('chunkOverlap');
          expect(firstConfig).toHaveProperty('enableParentChildChunking');
          expect(firstConfig).toHaveProperty('expectedDimensions');
          expect(firstConfig).toHaveProperty('description');
        });
    });
  });

  describe('/api/embedding-tests/quick-test (POST)', () => {
    it('should run quick test with default parameters', () => {
      const mockTestSummary = {
        totalTests: 1,
        successfulTests: 1,
        successRate: 100,
        results: [
          {
            name: 'Quick Test',
            success: true,
            chunkAnalysis: {
              totalChunks: 5,
              averageLength: 400,
              minLength: 100,
              maxLength: 500,
              sizeConstraintPass: true,
              oversizedChunks: 0,
              parentChunks: 0,
              childChunks: 0,
              parentChildWorking: true,
            },
            embeddingAnalysis: {
              totalEmbeddings: 5,
              modelName: 'Xenova/bge-m3',
              provider: 'local',
              dimensions: 1024,
              expectedDimensions: 1024,
              dimensionMatch: true,
              modelNameMatch: true,
              providerMatch: true,
            },
            searchQuality: {
              query: 'Which wizard lived in Orthanc?',
              searchResults: 3,
              relevanceScore: 0.6,
            },
            issues: [],
            duration: 1000,
          },
        ],
        overallStatus: 'PASS',
        criticalIssues: [],
      };

      mockEmbeddingTestService.runEmbeddingTests.mockResolvedValue(
        mockTestSummary,
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockTestSummary);
        });
    });

    it('should run quick test with custom parameters', () => {
      const mockTestSummary = {
        totalTests: 1,
        successfulTests: 1,
        successRate: 100,
        results: [],
        overallStatus: 'PASS',
        criticalIssues: [],
      };

      mockEmbeddingTestService.runEmbeddingTests.mockResolvedValue(
        mockTestSummary,
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          embeddingModel: 'qwen3-embedding:4b',
          embeddingProvider: 'ollama',
          chunkSize: 400,
          testDocumentContent: 'Custom test content',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockTestSummary);
        });
    });

    it('should handle validation errors', () => {
      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          chunkSize: 'invalid', // Should be number
        })
        .expect(400);
    });
  });

  describe('/api/embedding-tests/run-predefined (POST)', () => {
    it('should run predefined tests', () => {
      const mockTestSummary = {
        totalTests: 4,
        successfulTests: 4,
        successRate: 100,
        results: [],
        overallStatus: 'PASS',
        criticalIssues: [],
      };

      mockEmbeddingTestService.runEmbeddingTests.mockResolvedValue(
        mockTestSummary,
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run-predefined')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockTestSummary);
        });
    });

    it('should run predefined tests with custom document content', () => {
      const mockTestSummary = {
        totalTests: 4,
        successfulTests: 4,
        successRate: 100,
        results: [],
        overallStatus: 'PASS',
        criticalIssues: [],
      };

      mockEmbeddingTestService.runEmbeddingTests.mockResolvedValue(
        mockTestSummary,
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run-predefined')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          testDocumentContent: 'Custom predefined test content',
          testDocumentFilename: 'predefined-test.txt',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockTestSummary);
        });
    });
  });

  describe('/api/embedding-tests/run (POST)', () => {
    it('should run custom embedding tests', () => {
      const customConfigs = [
        {
          name: 'Custom Test',
          embeddingModel: 'Xenova/bge-m3',
          embeddingModelProvider: 'local',
          textSplitter: 'recursive_character',
          chunkSize: 500,
          chunkOverlap: 100,
          enableParentChildChunking: false,
          expectedDimensions: 1024,
          description: 'Custom test configuration',
        },
      ];

      const mockTestSummary = {
        totalTests: 1,
        successfulTests: 1,
        successRate: 100,
        results: [],
        overallStatus: 'PASS',
        criticalIssues: [],
      };

      mockEmbeddingTestService.runEmbeddingTests.mockResolvedValue(
        mockTestSummary,
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          configs: customConfigs,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockTestSummary);
        });
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/api/embedding-tests/run')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          // Missing required 'configs' field
        })
        .expect(400);
    });

    it('should validate configuration structure', () => {
      return request(app.getHttpServer())
        .post('/api/embedding-tests/run')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          configs: [
            {
              // Missing required fields
              name: 'Invalid Test',
            },
          ],
        })
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', () => {
      mockEmbeddingTestService.runEmbeddingTests.mockRejectedValue(
        new Error('Service error'),
      );

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(500)
        .expect((res) => {
          expect(res.body.message).toContain('Failed to run quick test');
        });
    });
  });
});
