import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';

describe('Search Flow E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let datasetId: string;
  let documentId: string;

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
      if (datasetId) {
        await dataSource.query('DELETE FROM datasets WHERE id = $1', [
          datasetId,
        ]);
      }
    }
    await app.close();
  });

  describe('Search Flow Analysis', () => {
    it('should setup test environment with dataset and document', async () => {
      // Create dataset
      const datasetData = {
        name: 'Search Flow Test Dataset',
        description: 'Test dataset for search flow analysis',
        embeddingModel: 'Xenova/bge-m3',
        embeddingModelProvider: 'local',
      };

      const datasetResponse = await request(app.getHttpServer())
        .post('/datasets')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(datasetData)
        .expect(201);

      datasetId = datasetResponse.body.id;

      // Upload test document
      const testDocPath = path.join(
        __dirname,
        '../../test-documents',
        'Volume II - The Two Towers.txt',
      );

      if (!fs.existsSync(testDocPath)) {
        const testContent =
          'Test content about Saruman the wizard who lived in Orthanc tower.';
        fs.writeFileSync(testDocPath, testContent);
      }

      const uploadResponse = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('files', testDocPath)
        .field('datasetId', datasetId)
        .expect(201);

      documentId = uploadResponse.body.data.documents[0].id;

      // Process document
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

      await request(app.getHttpServer())
        .post('/datasets/process-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(processData)
        .expect(201);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 15000));
    });

    it('should test getEmbeddingModelForDocument logic', async () => {
      const embeddingModelQuery = `
        SELECT 
          segment.id,
          segment.document_id,
          embedding.id as embedding_id,
          embedding.model_name,
          embedding.provider_name
        FROM document_segments segment
        LEFT JOIN embeddings embedding ON segment.embedding_id = embedding.id
        WHERE segment.document_id = $1
        AND segment.embedding_id IS NOT NULL
        AND embedding.model_name IS NOT NULL
        LIMIT 1
      `;

      const embeddingModelResult = await dataSource.query(embeddingModelQuery, [
        documentId,
      ]);

      expect(embeddingModelResult.length).toBeGreaterThan(0);

      const actualEmbeddingModel = embeddingModelResult[0].model_name;
      expect(actualEmbeddingModel).toBe('Xenova/bge-m3');
    });

    it('should test dataset configuration fallback', async () => {
      const datasetQuery = `
        SELECT 
          id,
          name,
          embedding_model,
          embedding_model_provider
        FROM datasets
        WHERE id = $1
      `;

      const datasetResult = await dataSource.query(datasetQuery, [datasetId]);

      expect(datasetResult.length).toBeGreaterThan(0);

      const dataset = datasetResult[0];
      expect(dataset.embedding_model).toBe('Xenova/bge-m3');
      expect(dataset.embedding_model_provider).toBe('local');
    });

    it('should check for model mismatch', async () => {
      // Get actual embedding model from segments
      const actualEmbeddingQuery = `
        SELECT 
          e.model_name,
          e.provider_name
        FROM document_segments ds
        JOIN embeddings e ON ds.embedding_id = e.id
        WHERE ds.document_id = $1
        LIMIT 1
      `;

      const actualEmbeddingResult = await dataSource.query(
        actualEmbeddingQuery,
        [documentId],
      );
      const actualEmbeddingModel = actualEmbeddingResult[0].model_name;

      // Get dataset configuration
      const datasetQuery = `
        SELECT 
          embedding_model,
          embedding_model_provider
        FROM datasets
        WHERE id = $1
      `;

      const datasetResult = await dataSource.query(datasetQuery, [datasetId]);
      const datasetModel = datasetResult[0].embedding_model;

      // Check for mismatch
      const hasModelMismatch = actualEmbeddingModel !== datasetModel;

      expect(hasModelMismatch).toBe(false);
      expect(actualEmbeddingModel).toBe(datasetModel);
    });

    it('should test model mapping service logic', async () => {
      // Simulate the getAllPossibleModelNames method
      const datasetQuery = `
        SELECT embedding_model
        FROM datasets
        WHERE id = $1
      `;

      const datasetResult = await dataSource.query(datasetQuery, [datasetId]);
      const datasetModelName = datasetResult[0].embedding_model;

      // This is what the search service does
      const possibleNames = [datasetModelName];

      expect(possibleNames).toContain('Xenova/bge-m3');
      expect(possibleNames.length).toBe(1);
    });

    it('should test vector search with correct model names', async () => {
      const vectorSearchQuery = `
        SELECT 
          ds.id,
          ds.content,
          ds.position,
          ds.word_count as "wordCount",
          ds.tokens,
          ds.keywords,
          ds.enabled,
          ds.status,
          ds.created_at as "createdAt",
          ds.updated_at as "updatedAt",
          ds.completed_at as "completedAt",
          ds.error,
          e.model_name,
          e.provider_name,
          vector_dims(e.embedding) as dimensions
        FROM document_segments ds
        JOIN embeddings e ON ds.embedding_id = e.id
        WHERE ds.document_id = $1 
          AND e.model_name = $2
          AND e.embedding IS NOT NULL
          AND ds.enabled = true
        ORDER BY ds.position
        LIMIT 10
      `;

      const results = await dataSource.query(vectorSearchQuery, [
        documentId,
        'Xenova/bge-m3',
      ]);

      expect(results.length).toBeGreaterThan(0);

      // Check if any segments contain "Saruman"
      const sarumanSegments = results.filter((row) =>
        row.content.toLowerCase().includes('saruman'),
      );

      expect(sarumanSegments.length).toBeGreaterThan(0);
    });

    it('should test search API with proper model matching', async () => {
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
      expect(response.body.results.length).toBeGreaterThan(0);

      // Check if results contain relevant content
      const hasRelevantContent = response.body.results.some(
        (result: any) =>
          result.content?.toLowerCase().includes('saruman') ||
          result.content?.toLowerCase().includes('orthanc'),
      );

      expect(hasRelevantContent).toBe(true);
    });

    it('should verify search system consistency', async () => {
      // This test verifies that the search system is working correctly
      // by ensuring that the model names match between dataset config and actual embeddings

      const actualEmbeddingQuery = `
        SELECT 
          e.model_name,
          e.provider_name,
          COUNT(*) as count
        FROM document_segments ds
        JOIN embeddings e ON ds.embedding_id = e.id
        WHERE ds.document_id = $1
        GROUP BY e.model_name, e.provider_name
      `;

      const actualEmbeddingResult = await dataSource.query(
        actualEmbeddingQuery,
        [documentId],
      );

      expect(actualEmbeddingResult.length).toBeGreaterThan(0);

      const actualModel = actualEmbeddingResult[0].model_name;
      const actualProvider = actualEmbeddingResult[0].provider_name;

      // Get dataset configuration
      const datasetQuery = `
        SELECT 
          embedding_model,
          embedding_model_provider
        FROM datasets
        WHERE id = $1
      `;

      const datasetResult = await dataSource.query(datasetQuery, [datasetId]);
      const datasetModel = datasetResult[0].embedding_model;
      const datasetProvider = datasetResult[0].embedding_model_provider;

      // Verify consistency
      expect(actualModel).toBe(datasetModel);
      expect(actualProvider).toBe(datasetProvider);

      console.log(`✅ Search system consistency verified:`);
      console.log(
        `   Model: ${actualModel} (matches dataset: ${datasetModel})`,
      );
      console.log(
        `   Provider: ${actualProvider} (matches dataset: ${datasetProvider})`,
      );
    });
  });
});
