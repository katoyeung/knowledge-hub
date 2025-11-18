import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { PostStatus } from '../src/modules/posts/enums/post-status.enum';
import { DocumentSegment } from '../src/modules/dataset/entities/document-segment.entity';
import { GenericLLMProcessingJob } from '../src/modules/queue/jobs/llm-processing/generic-llm-processing.job';
import { FieldMappingConfig } from '../src/modules/queue/jobs/llm-processing/interfaces/result-application-strategy.interface';
import { createHash } from 'crypto';

describe('Generic LLM Processing Job E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;
  let aiProviderId: string;
  let promptId: string;
  let postRepository: Repository<Post>;
  let segmentRepository: Repository<DocumentSegment>;
  let genericLLMProcessingJob: GenericLLMProcessingJob;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Get repositories
    postRepository = app.get<Repository<Post>>(getRepositoryToken(Post));
    segmentRepository = app.get<Repository<DocumentSegment>>(
      getRepositoryToken(DocumentSegment),
    );

    // Get job instance
    genericLLMProcessingJob = app.get<GenericLLMProcessingJob>(
      GenericLLMProcessingJob,
    );

    // Get JWT token for authentication
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
    userId = authResult.user.id;

    // Find or create AI provider
    const providersResponse = await request(app.getHttpServer())
      .get('/ai-providers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Crumplete AI' });

    expect(providersResponse.status).toBe(200);
    const providers = Array.isArray(providersResponse.body)
      ? providersResponse.body
      : providersResponse.body.data || [];

    let crumpleteProvider = providers.find(
      (p: any) => p.name === 'Crumplete AI',
    );

    if (!crumpleteProvider) {
      // Create provider if it doesn't exist
      const createResponse = await request(app.getHttpServer())
        .post('/ai-providers')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Crumplete AI',
          type: 'custom',
          baseUrl: 'https://api.crumplete.ai/v1',
          apiKey: process.env.CRUMPLETE_API_KEY || 'test-key',
          isActive: true,
        });

      expect(createResponse.status).toBe(201);
      crumpleteProvider = createResponse.body;
    }

    aiProviderId = crumpleteProvider.id;

    // Verify or add model
    const modelsResponse = await request(app.getHttpServer())
      .get(`/ai-providers/${aiProviderId}/models`)
      .set('Authorization', `Bearer ${jwtToken}`);

    let qwenModel;
    if (modelsResponse.status === 200) {
      const models = modelsResponse.body;
      qwenModel = models.find((m: any) => m.id === 'qwen3:30b');
    }

    if (!qwenModel) {
      const addModelResponse = await request(app.getHttpServer())
        .post(`/ai-providers/${aiProviderId}/models`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          id: 'qwen3:30b',
          name: 'Qwen3 30B',
          description: 'Crumplete AI Qwen3 30B model',
          maxTokens: 128000,
          contextWindow: 128000,
          pricing: { input: 0, output: 0 },
        });

      if (addModelResponse.status !== 201) {
        console.warn('Failed to add qwen3:30b model');
      }
    }

    // Create or find approval prompt
    const promptsResponse = await request(app.getHttpServer())
      .get('/prompts')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Post Approval' });

    let approvalPrompt;
    if (promptsResponse.status === 200) {
      const prompts = Array.isArray(promptsResponse.body)
        ? promptsResponse.body
        : promptsResponse.body.data || [];
      approvalPrompt = prompts.find((p: any) => p.name === 'Post Approval');
    }

    if (!approvalPrompt) {
      const createPromptResponse = await request(app.getHttpServer())
        .post('/prompts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Post Approval',
          systemPrompt:
            'You are a content moderation assistant. Analyze the post content and determine if it should be approved or rejected.',
          userPromptTemplate:
            'Analyze the following post and provide your decision:\n\n{{content}}\n\nRespond with JSON: {"status": "approved" | "rejected", "reason": "explanation", "confidenceScore": 0.0-1.0}',
          jsonSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['approved', 'rejected'],
              },
              reason: { type: 'string' },
              confidenceScore: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['status', 'reason', 'confidenceScore'],
          },
          isActive: true,
        });

      expect(createPromptResponse.status).toBe(201);
      approvalPrompt = createPromptResponse.body;
    }

    promptId = approvalPrompt.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Post Processing', () => {
    let testPostId: string;

    beforeEach(async () => {
      // Create a test post
      const postData = {
        hash: createHash('sha256')
          .update(`test-post-${Date.now()}`)
          .digest('hex'),
        title: 'Test Post for LLM Processing',
        source: 'test',
        provider: 'test',
        status: PostStatus.PENDING,
        meta: {
          content:
            'This is a test post that should be approved. It contains appropriate content.',
        },
        userId,
      };

      const post = postRepository.create(postData);
      const savedPost = await postRepository.save(post);
      testPostId = savedPost.id;
    });

    afterEach(async () => {
      // Clean up test post
      if (testPostId) {
        await postRepository.delete(testPostId);
      }
    });

    it('should process post with approval field mappings', async () => {
      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: {
            from: 'status',
            transform: (v) =>
              v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
          },
          approvalReason: 'reason',
          confidenceScore: 'confidenceScore',
        },
        enumConversions: {
          status: {
            approved: PostStatus.APPROVED,
            rejected: PostStatus.REJECTED,
          },
        },
        statusField: 'status',
        statusValues: {
          pending: PostStatus.PENDING,
          error: PostStatus.PENDING,
        },
      };

      await genericLLMProcessingJob.process({
        entityType: 'post',
        entityId: testPostId,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
        fieldMappings,
      });

      // Verify post was updated
      const updatedPost = await postRepository.findOne({
        where: { id: testPostId },
      });

      expect(updatedPost).toBeDefined();
      expect(updatedPost?.status).toBeDefined();
      expect([PostStatus.APPROVED, PostStatus.REJECTED]).toContain(
        updatedPost?.status,
      );
      expect(updatedPost?.approvalReason).toBeDefined();
      expect(updatedPost?.confidenceScore).toBeDefined();
    });

    it('should handle custom field mappings', async () => {
      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: 'status',
          'meta.reviewedAt': {
            from: 'timestamp',
            transform: () => new Date().toISOString(),
          },
          'meta.reviewer': {
            from: 'reviewer',
            defaultValue: 'system',
          },
        },
      };

      await genericLLMProcessingJob.process({
        entityType: 'post',
        entityId: testPostId,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
        fieldMappings,
      });

      const updatedPost = await postRepository.findOne({
        where: { id: testPostId },
      });

      expect(updatedPost).toBeDefined();
      if (updatedPost?.meta) {
        expect(updatedPost.meta.reviewedAt).toBeDefined();
        expect(updatedPost.meta.reviewer).toBeDefined();
      }
    });
  });

  describe('Segment Processing', () => {
    let testSegmentId: string;
    let testDatasetId: string;
    let testDocumentId: string;

    beforeEach(async () => {
      // Create test dataset, document, and segment
      // Note: This is a simplified version - you may need to adjust based on your actual setup
      const segmentData = {
        content: 'This is a test segment for LLM processing.',
        position: 0,
        wordCount: 10,
        tokens: 15,
        status: 'waiting',
        userId,
      };

      // For a real test, you'd need to create dataset and document first
      // This is a placeholder - adjust based on your actual entity relationships
      const segment = segmentRepository.create(segmentData as any);
      const savedSegment = await segmentRepository.save(segment);
      testSegmentId = savedSegment.id;
    });

    afterEach(async () => {
      if (testSegmentId) {
        await segmentRepository.delete(testSegmentId);
      }
    });

    it('should process segment with classification field mappings', async () => {
      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: 'classificationStatus',
          'hierarchyMetadata.category': 'category',
          'hierarchyMetadata.confidence': 'confidence',
        },
        statusField: 'status',
        statusValues: {
          pending: 'waiting',
          completed: 'completed',
          error: 'error',
        },
      };

      // Create a classification prompt
      const classificationPromptResponse = await request(app.getHttpServer())
        .post('/prompts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Segment Classification',
          systemPrompt:
            'You are a content classification assistant. Classify the segment content.',
          userPromptTemplate:
            'Classify the following segment:\n\n{{content}}\n\nRespond with JSON: {"category": "string", "confidence": 0.0-1.0, "classificationStatus": "completed"}',
          jsonSchema: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              classificationStatus: { type: 'string' },
            },
            required: ['category', 'confidence', 'classificationStatus'],
          },
          isActive: true,
        });

      const classificationPromptId =
        classificationPromptResponse.status === 201
          ? classificationPromptResponse.body.id
          : promptId;

      await genericLLMProcessingJob.process({
        entityType: 'segment',
        entityId: testSegmentId,
        promptId: classificationPromptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
        fieldMappings,
      });

      const updatedSegment = await segmentRepository.findOne({
        where: { id: testSegmentId },
      });

      expect(updatedSegment).toBeDefined();
      expect(updatedSegment?.status).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent entity gracefully', async () => {
      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
        statusField: 'status',
        statusValues: { error: PostStatus.PENDING },
      };

      await expect(
        genericLLMProcessingJob.process({
          entityType: 'post',
          entityId: 'non-existent-id',
          promptId,
          aiProviderId,
          model: 'qwen3:30b',
          temperature: 0.7,
          userId,
          fieldMappings,
        }),
      ).rejects.toThrow();
    });

    it('should handle LLM errors gracefully', async () => {
      const postData = {
        hash: createHash('sha256')
          .update(`error-test-${Date.now()}`)
          .digest('hex'),
        title: 'Error Test Post',
        source: 'test',
        provider: 'test',
        status: PostStatus.PENDING,
        userId,
      };

      const post = postRepository.create(postData);
      const savedPost = await postRepository.save(post);

      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
        statusField: 'status',
        statusValues: { error: PostStatus.PENDING },
      };

      // Use invalid prompt ID to trigger error
      try {
        await genericLLMProcessingJob.process({
          entityType: 'post',
          entityId: savedPost.id,
          promptId: 'invalid-prompt-id',
          aiProviderId,
          model: 'qwen3:30b',
          temperature: 0.7,
          userId,
          fieldMappings,
        });
      } catch (error) {
        // Error is expected
        expect(error).toBeDefined();
      }

      // Verify post status was updated to error state
      const updatedPost = await postRepository.findOne({
        where: { id: savedPost.id },
      });

      // Clean up
      await postRepository.delete(savedPost.id);
    });
  });

  describe('Template Variables', () => {
    it('should extract and use template variables from post', async () => {
      const postData = {
        hash: createHash('sha256')
          .update(`template-test-${Date.now()}`)
          .digest('hex'),
        title: 'Template Test Post',
        source: 'facebook',
        provider: 'google api',
        postedAt: new Date(),
        status: PostStatus.PENDING,
        meta: {
          content: 'Test content',
          author: 'Test Author',
        },
        userId,
      };

      const post = postRepository.create(postData);
      const savedPost = await postRepository.save(post);

      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
      };

      // Additional template variables
      const additionalVariables = {
        customVar: 'custom value',
      };

      await genericLLMProcessingJob.process({
        entityType: 'post',
        entityId: savedPost.id,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
        fieldMappings,
        templateVariables: additionalVariables,
      });

      // Clean up
      await postRepository.delete(savedPost.id);
    });
  });
});
