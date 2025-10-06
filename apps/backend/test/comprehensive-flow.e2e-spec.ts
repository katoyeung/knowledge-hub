import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';
import { Dataset } from '../src/modules/dataset/entities/dataset.entity';
import { Document } from '../src/modules/dataset/entities/document.entity';
import { DocumentSegment } from '../src/modules/dataset/entities/document-segment.entity';
import { Embedding } from '../src/modules/dataset/entities/embedding.entity';

describe('Comprehensive Flow E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let datasetId: string;
  let documentId: string;
  let ollamaDatasetId: string;
  let ollamaDocumentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Get JWT token for authentication using AuthHelper
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      if (documentId) {
        await dataSource.query(
          'DELETE FROM document_segments WHERE document_id = $1',
          [documentId],
        );
        await dataSource.query('DELETE FROM documents WHERE id = $1', [
          documentId,
        ]);
      }
      if (ollamaDocumentId) {
        await dataSource.query(
          'DELETE FROM document_segments WHERE document_id = $1',
          [ollamaDocumentId],
        );
        await dataSource.query('DELETE FROM documents WHERE id = $1', [
          ollamaDocumentId,
        ]);
      }
      if (datasetId) {
        await dataSource.query('DELETE FROM datasets WHERE id = $1', [
          datasetId,
        ]);
      }
      if (ollamaDatasetId) {
        await dataSource.query('DELETE FROM datasets WHERE id = $1', [
          ollamaDatasetId,
        ]);
      }
    }
    await app.close();
  });

  describe('BGE-M3 (Local) Embedding Model Tests', () => {
    it('should create dataset with BGE-M3 model', async () => {
      const datasetData = {
        name: 'Comprehensive Flow Test Dataset - BGE-M3',
        description: 'Test dataset using Xenova/bge-m3 for embeddings',
        embeddingModel: 'Xenova/bge-m3',
        embeddingModelProvider: 'local',
      };

      const response = await request(app.getHttpServer())
        .post('/datasets')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(datasetData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(datasetData.name);
      expect(response.body.embeddingModel).toBe(datasetData.embeddingModel);
      expect(response.body.embeddingModelProvider).toBe(
        datasetData.embeddingModelProvider,
      );

      datasetId = response.body.id;
    });

    it('should upload document to BGE-M3 dataset', async () => {
      const testDocPath = path.join(
        __dirname,
        '../../test-documents',
        'Volume II - The Two Towers.txt',
      );

      if (!fs.existsSync(testDocPath)) {
        // Create a test document if it doesn't exist
        fs.writeFileSync(
          testDocPath,
          'Test content for Saruman wizard in Orthanc tower.',
        );
      }

      const response = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('files', testDocPath)
        .field('datasetId', datasetId)
        .expect(201);

      expect(response.body.data.documents).toBeDefined();
      expect(response.body.data.documents.length).toBeGreaterThan(0);
      expect(response.body.data.documents[0].id).toBeDefined();

      documentId = response.body.data.documents[0].id;
    });

    it('should process document with BGE-M3 chunking and embedding', async () => {
      const processData = {
        datasetId: datasetId,
        documentIds: [documentId],
        embeddingModel: 'Xenova/bge-m3',
        embeddingProvider: 'local',
        textSplitter: 'recursive_character',
        chunkSize: 1000,
        chunkOverlap: 200,
        enableParentChildChunking: false,
      };

      const response = await request(app.getHttpServer())
        .post('/datasets/process-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(processData)
        .expect(201);

      expect(response.body.success).toBe(true);

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Check document processing status
      const docStatus = await dataSource.query(
        'SELECT id, name, indexing_status, completed_at, error FROM documents WHERE id = $1',
        [documentId],
      );

      expect(docStatus.length).toBeGreaterThan(0);
      expect(docStatus[0].indexing_status).toBe('completed');

      // Check chunks in database
      const chunks = await dataSource.query(
        'SELECT id, content, position, embedding_id, parent_id FROM document_segments WHERE document_id = $1 ORDER BY position',
        [documentId],
      );

      expect(chunks.length).toBeGreaterThan(0);

      // Check embeddings
      const embeddings = await dataSource.query(
        `SELECT e.id, e.model_name, e.provider_name, e.created_at
         FROM embeddings e
         WHERE e.id IN (
           SELECT DISTINCT embedding_id 
           FROM document_segments 
           WHERE document_id = $1 AND embedding_id IS NOT NULL
         )`,
        [documentId],
      );

      expect(embeddings.length).toBeGreaterThan(0);
      expect(embeddings[0].model_name).toBe('Xenova/bge-m3');
      expect(embeddings[0].provider_name).toBe('local');
    });

    it('should test search query with BGE-M3', async () => {
      const query = 'Which wizard lived in Orthanc?';
      const searchData = {
        query,
        documentId: documentId,
        limit: 5,
        similarityThreshold: 0.1,
      };

      const response = await request(app.getHttpServer())
        .post('/datasets/search-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(searchData)
        .expect(200);

      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should test chat query with BGE-M3', async () => {
      const chatData = {
        message: 'Which wizard lived in Orthanc?',
        datasetId: datasetId,
        llmProvider: 'openrouter',
        model: 'google/gemma-2-9b-it:free',
      };

      const response = await request(app.getHttpServer())
        .post('/chat/with-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(chatData)
        .expect(200);

      expect(response.body.message || response.body.response).toBeDefined();
      expect(response.body.sources).toBeDefined();
    });

    it('should verify dimension consistency for BGE-M3', async () => {
      // Get dataset configuration
      const dataset = await dataSource.query(
        'SELECT id, name, embedding_model, embedding_model_provider FROM datasets WHERE id = $1',
        [datasetId],
      );

      expect(dataset.length).toBeGreaterThan(0);
      expect(dataset[0].embedding_model).toBe('Xenova/bge-m3');

      // Get actual embeddings from segments
      const actualEmbeddings = await dataSource.query(
        `SELECT e.model_name, e.provider_name, COUNT(*) as count
         FROM document_segments ds
         JOIN embeddings e ON ds.embedding_id = e.id
         WHERE ds.document_id = $1
         GROUP BY e.model_name, e.provider_name`,
        [documentId],
      );

      expect(actualEmbeddings.length).toBeGreaterThan(0);
      expect(actualEmbeddings[0].model_name).toBe('Xenova/bge-m3');
      expect(actualEmbeddings[0].provider_name).toBe('local');
    });
  });

  describe('Ollama Qwen3 Embedding Model Tests', () => {
    it('should create dataset with Ollama Qwen3 model', async () => {
      const datasetData = {
        name: 'Comprehensive Flow Test Dataset - Ollama Qwen3',
        description:
          'Test dataset using Ollama qwen3-embedding:4b for embeddings',
        embeddingModel: 'qwen3-embedding:4b',
        embeddingModelProvider: 'ollama',
      };

      const response = await request(app.getHttpServer())
        .post('/datasets')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(datasetData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(datasetData.name);
      expect(response.body.embeddingModel).toBe(datasetData.embeddingModel);
      expect(response.body.embeddingModelProvider).toBe(
        datasetData.embeddingModelProvider,
      );

      ollamaDatasetId = response.body.id;
    });

    it('should upload document to Ollama dataset', async () => {
      const testDocPath = path.join(
        __dirname,
        '../../test-documents',
        'Volume II - The Two Towers.txt',
      );

      if (!fs.existsSync(testDocPath)) {
        // Create a test document if it doesn't exist
        fs.writeFileSync(
          testDocPath,
          'Test content for Saruman wizard in Orthanc tower.',
        );
      }

      const response = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('files', testDocPath)
        .field('datasetId', ollamaDatasetId)
        .expect(201);

      expect(response.body.data.documents).toBeDefined();
      expect(response.body.data.documents.length).toBeGreaterThan(0);
      expect(response.body.data.documents[0].id).toBeDefined();

      ollamaDocumentId = response.body.data.documents[0].id;
    });

    it('should process document with Ollama chunking and embedding', async () => {
      const processData = {
        datasetId: ollamaDatasetId,
        documentIds: [ollamaDocumentId],
        embeddingModel: 'qwen3-embedding:4b',
        embeddingProvider: 'ollama',
        textSplitter: 'recursive_character',
        chunkSize: 1000,
        chunkOverlap: 150, // Must be ≤ 150 for this model (15% of chunk size)
        enableParentChildChunking: false,
      };

      const response = await request(app.getHttpServer())
        .post('/datasets/process-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(processData)
        .expect(201);

      expect(response.body.success).toBe(true);

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Check document processing status
      const docStatus = await dataSource.query(
        'SELECT id, name, indexing_status, completed_at, error FROM documents WHERE id = $1',
        [ollamaDocumentId],
      );

      expect(docStatus.length).toBeGreaterThan(0);
      expect(docStatus[0].indexing_status).toBe('completed');

      // Check chunks in database
      const chunks = await dataSource.query(
        'SELECT id, content, position, embedding_id, parent_id FROM document_segments WHERE document_id = $1 ORDER BY position',
        [ollamaDocumentId],
      );

      expect(chunks.length).toBeGreaterThan(0);

      // Check embeddings
      const embeddings = await dataSource.query(
        `SELECT e.id, e.model_name, e.provider_name, e.created_at
         FROM embeddings e
         WHERE e.id IN (
           SELECT DISTINCT embedding_id 
           FROM document_segments 
           WHERE document_id = $1 AND embedding_id IS NOT NULL
         )`,
        [ollamaDocumentId],
      );

      expect(embeddings.length).toBeGreaterThan(0);
      expect(embeddings[0].model_name).toBe('qwen3-embedding:4b');
      expect(embeddings[0].provider_name).toBe('ollama');
    });

    it('should test search query with Ollama', async () => {
      const query = 'Which wizard lived in Orthanc?';
      const searchData = {
        query,
        documentId: ollamaDocumentId,
        limit: 5,
        similarityThreshold: 0.1,
      };

      const response = await request(app.getHttpServer())
        .post('/datasets/search-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(searchData)
        .expect(200);

      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should test chat query with Ollama', async () => {
      const chatData = {
        message: 'Which wizard lived in Orthanc?',
        datasetId: ollamaDatasetId,
        llmProvider: 'openrouter',
        model: 'google/gemma-2-9b-it:free',
      };

      const response = await request(app.getHttpServer())
        .post('/chat/with-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(chatData)
        .expect(200);

      expect(response.body.message || response.body.response).toBeDefined();
      expect(response.body.sources).toBeDefined();
    });
  });
});
