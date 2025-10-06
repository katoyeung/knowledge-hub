import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmbeddingTestModule } from '../src/modules/embedding-test/embedding-test.module';
import { Dataset } from '../src/modules/dataset/entities/dataset.entity';
import { Document } from '../src/modules/dataset/entities/document.entity';
import { DocumentSegment } from '../src/modules/dataset/entities/document-segment.entity';
import { Embedding } from '../src/modules/dataset/entities/embedding.entity';
import {
  EmbeddingTestConfigDto,
  EmbeddingModel,
  EmbeddingProvider,
  TextSplitter,
} from '../src/modules/embedding-test/dto/embedding-test.dto';

describe('EmbeddingTestController (e2e)', () => {
  let app: INestApplication;
  let datasetRepository: Repository<Dataset>;
  let documentRepository: Repository<Document>;
  let segmentRepository: Repository<DocumentSegment>;
  let embeddingRepository: Repository<Embedding>;

  // Mock repositories
  const mockDatasetRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockDocumentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockSegmentRepository = {
    find: jest.fn(),
  };

  const mockEmbeddingRepository = {
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(Dataset))
      .useValue(mockDatasetRepository)
      .overrideProvider(getRepositoryToken(Document))
      .useValue(mockDocumentRepository)
      .overrideProvider(getRepositoryToken(DocumentSegment))
      .useValue(mockSegmentRepository)
      .overrideProvider(getRepositoryToken(Embedding))
      .useValue(mockEmbeddingRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    datasetRepository = moduleFixture.get<Repository<Dataset>>(
      getRepositoryToken(Dataset),
    );
    documentRepository = moduleFixture.get<Repository<Document>>(
      getRepositoryToken(Document),
    );
    segmentRepository = moduleFixture.get<Repository<DocumentSegment>>(
      getRepositoryToken(DocumentSegment),
    );
    embeddingRepository = moduleFixture.get<Repository<Embedding>>(
      getRepositoryToken(Embedding),
    );
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
      // Mock the test execution
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

      // Mock the service method
      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockResolvedValue(mockTestSummary);

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
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

      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockResolvedValue(mockTestSummary);

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
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

      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockResolvedValue(mockTestSummary);

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run-predefined')
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

      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockResolvedValue(mockTestSummary);

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run-predefined')
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
      const customConfigs: EmbeddingTestConfigDto[] = [
        {
          name: 'Custom Test',
          embeddingModel: EmbeddingModel.XENOVA_BGE_M3,
          embeddingModelProvider: EmbeddingProvider.LOCAL,
          textSplitter: TextSplitter.RECURSIVE_CHARACTER,
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

      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockResolvedValue(mockTestSummary);

      return request(app.getHttpServer())
        .post('/api/embedding-tests/run')
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
        .send({
          // Missing required 'configs' field
        })
        .expect(400);
    });

    it('should validate configuration structure', () => {
      return request(app.getHttpServer())
        .post('/api/embedding-tests/run')
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
      jest
        .spyOn(app.get('EmbeddingTestService'), 'runEmbeddingTests')
        .mockRejectedValue(new Error('Service error'));

      return request(app.getHttpServer())
        .post('/api/embedding-tests/quick-test')
        .send({})
        .expect(500)
        .expect((res) => {
          expect(res.body.message).toContain('Failed to run quick test');
        });
    });
  });
});
