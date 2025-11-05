import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';
import { Post } from '../src/modules/posts/entities/post.entity';
import { Workflow } from '../src/modules/pipeline/entities/workflow.entity';

describe('Post Upserter Workflow E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let workflowId: string;
  let createdPostIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Get JWT token for authentication
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      // Delete created posts
      if (createdPostIds.length > 0) {
        await dataSource.query(`DELETE FROM posts WHERE id = ANY($1::uuid[])`, [
          createdPostIds,
        ]);
      }

      // Delete workflow if exists
      if (workflowId) {
        await dataSource.query(
          'DELETE FROM workflow_executions WHERE workflow_id = $1',
          [workflowId],
        );
        await dataSource.query('DELETE FROM workflows WHERE id = $1', [
          workflowId,
        ]);
      }
    }
    await app.close();
  });

  describe('Post Upserter Step - Insert Test', () => {
    it('should successfully insert posts using Post Upserter step', async () => {
      // 1. Prepare input segments with test data
      // The input data should match what comes from Lenx API or other data sources
      const inputData = [
        {
          hash: 'test-hash-001',
          thread_title: 'Test Post Title 1',
          post_message: 'This is test content 1',
          site: 'test-site',
          channel: 'test-channel',
          country: 'US',
          provider: 'test-provider',
          source: 'test-source',
        },
        {
          hash: 'test-hash-002',
          thread_title: 'Test Post Title 2',
          post_message: 'This is test content 2',
          site: 'test-site',
          channel: 'test-channel',
          country: 'UK',
          provider: 'test-provider',
          source: 'test-source',
        },
        {
          hash: 'test-hash-003',
          thread_title: 'Test Post Title 3',
          post_message: 'This is test content 3',
          site: 'test-site',
          channel: 'test-channel',
          country: 'CA',
          provider: 'test-provider',
          source: 'test-source',
        },
      ];

      // Convert input data to DocumentSegment-like format
      // Post Upserter extracts data from segment content (JSON) or meta
      const inputSegments = inputData.map((item, index) => ({
        id: `segment-${index}`,
        content: JSON.stringify(item), // Post Upserter will parse this JSON
        wordCount: 0,
        tokens: 0,
        status: 'pending',
        position: index,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // 2. Test the Post Upserter step with proper configuration
      const postUpserterConfig = {
        fieldMappings: {
          title: 'thread_title', // Required: map title field
          hash: 'hash',
          provider: 'provider',
          source: 'source',
        },
        defaults: {
          provider: 'test-provider',
          source: 'test-source',
        },
        deduplicationStrategy: 'hash',
      };

      const testResponse = await request(app.getHttpServer())
        .post('/workflow/steps/test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          stepType: 'post_upserter',
          config: postUpserterConfig,
          inputSegments,
          previousOutput: null,
        })
        .expect(200);

      // 3. Verify test output structure matches expected format
      expect(testResponse.body).toHaveProperty('items');
      expect(testResponse.body).toHaveProperty('total');
      expect(testResponse.body).toHaveProperty('lastUpdated');
      expect(Array.isArray(testResponse.body.items)).toBe(true);
      expect(testResponse.body.total).toBe(3);
      expect(testResponse.body.items.length).toBe(3);
      expect(testResponse.body.lastUpdated).toBeDefined();
      expect(typeof testResponse.body.lastUpdated).toBe('string');

      // Store post IDs for cleanup
      createdPostIds = testResponse.body.items;
      expect(createdPostIds.every((id: string) => typeof id === 'string')).toBe(
        true,
      );

      // 4. Verify posts were actually created in the database
      for (const postId of createdPostIds) {
        const postResponse = await request(app.getHttpServer())
          .get(`/posts/${postId}`)
          .set('Authorization', `Bearer ${jwtToken}`)
          .expect(200);

        const post = postResponse.body;
        expect(post).toBeDefined();
        expect(post.id).toBe(postId);
        expect(post.title).toBeDefined();
        expect(post.hash).toBeDefined();
        expect(post.userId).toBeDefined(); // Should be set from context
      }

      // 5. Verify posts have correct data by searching
      const postsResponse = await request(app.getHttpServer())
        .get('/posts/search')
        .set('Authorization', `Bearer ${jwtToken}`)
        .query({ hash: 'test-hash-001' })
        .expect(200);

      expect(postsResponse.body.data).toBeDefined();
      expect(postsResponse.body.data.length).toBeGreaterThan(0);
      const post = postsResponse.body.data.find(
        (p: Post) => p.hash === 'test-hash-001',
      );
      expect(post).toBeDefined();
      expect(post.title).toBe('Test Post Title 1');
      expect(post.provider).toBe('test-provider');
      expect(post.source).toBe('test-source');
    });

    it('should create workflow and execute it to insert posts', async () => {
      // 1. Create workflow with Post Upserter
      const workflowData = {
        name: 'Post Upserter Execution Test',
        description: 'Test workflow execution for Post Upserter',
        nodes: [
          {
            id: 'lenx_datasource',
            type: 'lenx_api_datasource',
            name: 'Lenx API Data Source',
            position: { x: 100, y: 100 },
            config: {
              query: 'test query',
              apiUrl: 'https://prod-searcher.fasta.ai/api/raw/all',
              authToken: 'test-token',
              dateMode: 'dynamic',
              intervalMinutes: '180',
              timeout: 30000,
              maxRetries: 3,
            },
            enabled: true,
            inputSources: [],
          },
          {
            id: 'post_upserter',
            type: 'post_upserter',
            name: 'Post Upserter',
            position: { x: 300, y: 100 },
            config: {
              fieldMappings: {
                title: 'thread_title', // Required
                hash: 'hash',
                provider: 'provider',
                source: 'source',
              },
              defaults: {
                provider: 'test-provider',
                source: 'test-source',
              },
              deduplicationStrategy: 'hash',
            },
            enabled: true,
            inputSources: [
              {
                type: 'previous_node',
                nodeId: 'lenx_datasource',
                filters: [],
              },
            ],
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'lenx_datasource',
            target: 'post_upserter',
          },
        ],
        settings: {
          maxRetries: 3,
          errorHandling: 'stop',
          notifyOnFailure: false,
          parallelExecution: false,
          notifyOnCompletion: false,
        },
        isActive: false,
      };

      const createResponse = await request(app.getHttpServer())
        .post('/workflow/configs')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(workflowData)
        .expect(201);

      const testWorkflowId = createResponse.body.id;
      expect(testWorkflowId).toBeDefined();

      // 2. Test the Post Upserter node individually with mock data
      // First, prepare input data in the format that Lenx API would return
      const lenxApiResponseData = {
        data: [
          {
            hash: 'exec-hash-001',
            thread_title: 'Execution Test Title 1',
            provider: 'exec-provider',
            source: 'exec-source',
            site: 'test-site',
            channel: 'test-channel',
          },
        ],
        meta: {
          totalCount: 1,
          lastUpdated: new Date().toISOString(),
        },
      };

      // Convert to segments (as Lenx API step would output)
      const segmentsFromLenx = lenxApiResponseData.data.map(
        (item: any, index: number) => ({
          id: `segment-lenx-${index}`,
          content: JSON.stringify(item),
          wordCount: 0,
          tokens: 0,
          status: 'completed',
          position: index,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      // Test Post Upserter step
      const testResponse = await request(app.getHttpServer())
        .post('/workflow/steps/test')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          stepType: 'post_upserter',
          config: workflowData.nodes[1].config,
          inputSegments: segmentsFromLenx,
          previousOutput: null,
        })
        .expect(200);

      // Verify output format
      expect(testResponse.body).toHaveProperty('items');
      expect(testResponse.body).toHaveProperty('total');
      expect(testResponse.body).toHaveProperty('lastUpdated');
      expect(testResponse.body.items.length).toBe(1);
      expect(testResponse.body.total).toBe(1);

      // Store for cleanup
      if (testResponse.body.items[0]) {
        createdPostIds.push(testResponse.body.items[0]);
      }

      // Clean up test workflow
      await request(app.getHttpServer())
        .delete(`/workflow/configs/${testWorkflowId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
    });
  });
});
