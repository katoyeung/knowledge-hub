import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';

// Test trivia questions with expected answers
const TRIVIA_QUESTIONS = [
  {
    question: 'Which wizard lived in Orthanc?',
    correctAnswer: 'Saruman',
    expectedChunks: ['The Two Towers', 'The Fellowship of the Ring'],
  },
  {
    question: 'What was the name of the inn in the village of Bree?',
    correctAnswer: 'The Prancing Pony',
    expectedChunks: ['The Fellowship of the Ring'],
  },
  {
    question: "What was Gandalf's sword's name?",
    correctAnswer: 'Glamdring',
    expectedChunks: ['The Fellowship of the Ring'],
  },
  {
    question: 'Who married Aragorn?',
    correctAnswer: 'Arwen',
    expectedChunks: [
      'The Fellowship of the Ring',
      'The Return of the King',
      'The Two Towers',
    ],
  },
  {
    question: 'Which type of blade was Frodo stabbed with?',
    correctAnswer: 'With a Morgul-knife',
    expectedChunks: ['The Fellowship of the Ring', 'The Return of the King'],
  },
];

describe('RAG Performance E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let datasetId: string;
  let documentIds: string[] = [];

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
      for (const docId of documentIds) {
        await dataSource.query(
          'DELETE FROM document_segments WHERE document_id = $1',
          [docId],
        );
        await dataSource.query('DELETE FROM documents WHERE id = $1', [docId]);
      }
      if (datasetId) {
        await dataSource.query('DELETE FROM datasets WHERE id = $1', [
          datasetId,
        ]);
      }
    }
    await app.close();
  });

  describe('Setup Test Environment', () => {
    it('should create dataset with BGE-M3 local model', async () => {
      const datasetData = {
        name: 'RAG Performance Test - BGE-M3',
        description: 'Performance test dataset using local BGE-M3 embeddings',
        embeddingModel: 'Xenova/bge-m3',
        embeddingModelProvider: 'local',
      };

      const response = await request(app.getHttpServer())
        .post('/datasets')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(datasetData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.embeddingModel).toBe('Xenova/bge-m3');
      expect(response.body.embeddingModelProvider).toBe('local');

      datasetId = response.body.id;
    });

    it('should upload test documents', async () => {
      const testDocuments = [
        'Volume I - The Fellowship of the Ring.txt',
        'Volume II - The Two Towers.txt',
        'Volume III - The Return of the King.txt',
      ];

      for (const docName of testDocuments) {
        const docPath = path.join(__dirname, '../../test-documents', docName);

        // Create test document if it doesn't exist
        if (!fs.existsSync(docPath)) {
          const testContent = `Test content for ${docName}. This contains information about wizards, rings, and Middle-earth.`;
          fs.writeFileSync(docPath, testContent);
        }

        const response = await request(app.getHttpServer())
          .post('/documents/upload')
          .set('Authorization', `Bearer ${jwtToken}`)
          .attach('files', docPath)
          .field('datasetId', datasetId)
          .expect(201);

        expect(response.body.data.documents).toBeDefined();
        expect(response.body.data.documents.length).toBeGreaterThan(0);

        const docId = response.body.data.documents[0].id;
        documentIds.push(docId);
      }

      expect(documentIds.length).toBe(3);
    });

    it('should process documents with BGE-M3', async () => {
      const processData = {
        datasetId: datasetId,
        documentIds: documentIds,
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
      await new Promise((resolve) => setTimeout(resolve, 20000));

      // Check document processing status
      const docStatus = await dataSource.query(
        'SELECT id, name, indexing_status, completed_at, error FROM documents WHERE id = ANY($1)',
        [documentIds],
      );

      for (const doc of docStatus) {
        expect(doc.indexing_status).toBe('completed');
        expect(doc.error).toBeNull();
      }

      // Check chunks and embeddings
      const chunks = await dataSource.query(
        'SELECT COUNT(*) as chunk_count FROM document_segments WHERE document_id = ANY($1)',
        [documentIds],
      );

      expect(parseInt(chunks[0].chunk_count)).toBeGreaterThan(0);
    });
  });

  describe('RAG Performance Tests', () => {
    it('should test search functionality for each trivia question', async () => {
      for (const questionData of TRIVIA_QUESTIONS) {
        const searchData = {
          query: questionData.question,
          datasetId: datasetId,
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

        // Check chunk relevance
        const relevantChunks = response.body.results.filter((result: any) =>
          questionData.expectedChunks.some((expected) =>
            result.documentName?.includes(expected),
          ),
        );

        const relevancePercentage =
          (relevantChunks.length / response.body.results.length) * 100;
        expect(relevancePercentage).toBeGreaterThan(0);
      }
    });

    it('should test chat functionality for each trivia question', async () => {
      for (const questionData of TRIVIA_QUESTIONS) {
        const chatData = {
          message: questionData.question,
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
        expect(Array.isArray(response.body.sources)).toBe(true);

        // Evaluate answer accuracy
        const modelAnswer =
          response.body.message?.content || response.body.response;
        const accuracy = evaluateAnswer(
          modelAnswer,
          questionData.correctAnswer,
        );

        // Note: We don't assert accuracy here as it depends on the LLM response
        // but we can log it for analysis
        console.log(`Question: ${questionData.question}`);
        console.log(`Expected: ${questionData.correctAnswer}`);
        console.log(`Got: ${modelAnswer}`);
        console.log(`Accuracy: ${accuracy ? '✅' : '❌'}`);
      }
    });

    it('should measure response times', async () => {
      const questionData = TRIVIA_QUESTIONS[0]; // Use first question

      // Test search response time
      const searchStartTime = Date.now();
      const searchData = {
        query: questionData.question,
        datasetId: datasetId,
        limit: 5,
        similarityThreshold: 0.1,
      };

      await request(app.getHttpServer())
        .post('/datasets/search-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(searchData)
        .expect(200);

      const searchResponseTime = Date.now() - searchStartTime;
      expect(searchResponseTime).toBeLessThan(5000); // Should be under 5 seconds

      // Test chat response time
      const chatStartTime = Date.now();
      const chatData = {
        message: questionData.question,
        datasetId: datasetId,
        llmProvider: 'openrouter',
        model: 'google/gemma-2-9b-it:free',
      };

      await request(app.getHttpServer())
        .post('/chat/with-documents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(chatData)
        .expect(200);

      const chatResponseTime = Date.now() - chatStartTime;
      expect(chatResponseTime).toBeLessThan(10000); // Should be under 10 seconds

      console.log(`Search response time: ${searchResponseTime}ms`);
      console.log(`Chat response time: ${chatResponseTime}ms`);
    });
  });
});

// Helper function to evaluate answer accuracy
function evaluateAnswer(modelAnswer: string, correctAnswer: string): boolean {
  if (!modelAnswer || modelAnswer.toLowerCase().includes('error')) {
    return false;
  }

  const modelLower = modelAnswer.toLowerCase();
  const correctLower = correctAnswer.toLowerCase();

  // Direct match
  if (modelLower.includes(correctLower)) {
    return true;
  }

  // Check for partial matches for complex answers
  const correctWords = correctLower.split(/\s+/);
  const modelWords = modelLower.split(/\s+/);

  const matchingWords = correctWords.filter(
    (word) =>
      word.length > 2 && modelWords.some((mWord) => mWord.includes(word)),
  );

  const matchPercentage = (matchingWords.length / correctWords.length) * 100;

  return matchPercentage >= 50; // 50% word match threshold
}
