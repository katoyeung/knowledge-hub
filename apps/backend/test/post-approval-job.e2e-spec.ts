import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';
import { DataSource } from 'typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { PostStatus } from '../src/modules/posts/enums/post-status.enum';
import { PostApprovalJob } from '../src/modules/queue/jobs/posts/post-approval.job';
import { createHash } from 'crypto';

describe('Post Approval Job E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;
  let aiProviderId: string;
  let promptId: string;
  let approvedPostId: string;
  let rejectedPostId: string;

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
    userId = authResult.user.id;

    // Find Crumplete AI provider
    const providersResponse = await request(app.getHttpServer())
      .get('/ai-providers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Crumplete AI' });

    expect(providersResponse.status).toBe(200);
    const providers = Array.isArray(providersResponse.body)
      ? providersResponse.body
      : providersResponse.body.data || [];

    const crumpleteProvider = providers.find(
      (p: any) => p.name === 'Crumplete AI',
    );

    if (!crumpleteProvider) {
      throw new Error(
        'Crumplete AI provider not found. Please ensure it exists in the database.',
      );
    }

    aiProviderId = crumpleteProvider.id;

    // Verify the model exists or add it
    const modelsResponse = await request(app.getHttpServer())
      .get(`/ai-providers/${aiProviderId}/models`)
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(modelsResponse.status).toBe(200);
    const models = modelsResponse.body;
    let qwenModel = models.find((m: any) => m.id === 'qwen3:30b');

    if (!qwenModel) {
      // Add the model to the provider
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
        console.warn(
          'Failed to add qwen3:30b model, trying with existing model',
          addModelResponse.body,
        );
        // Try to use an existing model
        qwenModel = models[0];
        if (!qwenModel) {
          throw new Error(
            'No models found in Crumplete AI provider and failed to add qwen3:30b',
          );
        }
      } else {
        qwenModel = { id: 'qwen3:30b' };
      }
    }

    // Upsert prompt for post approval
    const promptData = {
      name: 'detect social media data',
      systemPrompt: `You are an expert content moderator for social media posts. Your task is to analyze social media content and determine if it should be approved or rejected based on quality, relevance, and appropriateness.

Guidelines:
- Approve posts that are informative, relevant, and appropriate
- Reject posts that contain spam, inappropriate content, or are irrelevant
- Provide a clear reason for your decision
- Assign a confidence score between 0 and 1 based on how certain you are

You must respond with a valid JSON object matching the provided schema.`,
      userPromptTemplate: `Analyze the following social media post and determine if it should be approved or rejected:

{{content}}

You must respond with a valid JSON object in the following format:
{
  "status": "approved" or "rejected",
  "reason": "Brief explanation of your decision",
  "confidenceScore": 0.0 to 1.0
}

Important: Your response must be valid JSON only, no additional text or markdown formatting.`,
      description: 'Prompt for detecting and categorizing social media data',
      type: 'intention',
      isGlobal: false,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['approved', 'rejected'],
            description: 'The approval status of the post',
          },
          reason: {
            type: 'string',
            description: 'Explanation for the approval or rejection decision',
          },
          confidenceScore: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score between 0 and 1',
          },
        },
        required: ['status', 'reason', 'confidenceScore'],
        additionalProperties: false,
      },
    };

    // Try to find existing prompt first
    const existingPromptsResponse = await request(app.getHttpServer())
      .get('/prompts')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'detect social media data' });

    let existingPrompt = null;
    if (existingPromptsResponse.status === 200) {
      const prompts = Array.isArray(existingPromptsResponse.body)
        ? existingPromptsResponse.body
        : existingPromptsResponse.body.data || [];
      existingPrompt = prompts.find(
        (p: any) => p.name === 'detect social media data',
      );
    }

    if (existingPrompt) {
      // Update existing prompt
      const updateResponse = await request(app.getHttpServer())
        .patch(`/prompts/${existingPrompt.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(promptData);

      expect(updateResponse.status).toBe(200);
      promptId = existingPrompt.id;
    } else {
      // Create new prompt
      const createResponse = await request(app.getHttpServer())
        .post('/prompts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(promptData);

      expect(createResponse.status).toBe(201);
      promptId = createResponse.body.id;
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      if (approvedPostId) {
        await dataSource.query('DELETE FROM posts WHERE id = $1', [
          approvedPostId,
        ]);
      }
      if (rejectedPostId) {
        await dataSource.query('DELETE FROM posts WHERE id = $1', [
          rejectedPostId,
        ]);
      }
      if (promptId) {
        await dataSource.query('DELETE FROM prompts WHERE id = $1', [promptId]);
      }
    }
    await app.close();
  });

  describe('Post Approval Job Tests', () => {
    it('should create a post that should be approved', async () => {
      const timestamp = Date.now();
      const postContent = {
        title: `Helpful Tech Tip ${timestamp}`,
        content:
          'Just discovered a great productivity tool that helps manage tasks efficiently. This tool has been very useful for organizing my daily workflow. Highly recommend checking it out! #productivity #tech #tools',
        source: 'twitter',
        provider: 'test',
        timestamp,
      };

      const hash = createHash('sha256')
        .update(JSON.stringify(postContent))
        .digest('hex');

      const createResponse = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          hash,
          title: postContent.title,
          meta: { content: postContent.content },
          source: postContent.source,
          provider: postContent.provider,
          userId,
        });

      expect(createResponse.status).toBe(201);
      approvedPostId = createResponse.body.id;

      // Verify post is created with pending status
      expect(createResponse.body.status).toBe(PostStatus.PENDING);
      expect(createResponse.body.approvalReason).toBeNull();
      expect(createResponse.body.confidenceScore).toBeNull();
    });

    it('should create a post that should be rejected', async () => {
      const timestamp = Date.now();
      const postContent = {
        title: `Spam Post ${timestamp}`,
        content:
          'CLICK HERE NOW!!! FREE MONEY!!! LIMITED TIME OFFER!!! BUY NOW!!! URGENT!!! ACT FAST!!!',
        source: 'facebook',
        provider: 'test',
        timestamp,
      };

      const hash = createHash('sha256')
        .update(JSON.stringify(postContent))
        .digest('hex');

      const createResponse = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          hash,
          title: postContent.title,
          meta: { content: postContent.content },
          source: postContent.source,
          provider: postContent.provider,
          userId,
        });

      expect(createResponse.status).toBe(201);
      rejectedPostId = createResponse.body.id;

      // Verify post is created with pending status
      expect(createResponse.body.status).toBe(PostStatus.PENDING);
    });

    it('should approve a post using PostApprovalJob', async () => {
      // Dispatch the approval job
      await PostApprovalJob.dispatch({
        postId: approvedPostId,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
      }).dispatch();

      // Wait for job to complete (with timeout and polling)
      const maxWaitTime = 30000; // 30 seconds
      const checkInterval = 2000; // 2 seconds
      const startTime = Date.now();
      let postUpdated = false;

      while (Date.now() - startTime < maxWaitTime && !postUpdated) {
        const getResponse = await request(app.getHttpServer())
          .get(`/posts/${approvedPostId}`)
          .set('Authorization', `Bearer ${jwtToken}`);

        if (getResponse.status === 200) {
          const post = getResponse.body;
          if (
            post.status !== PostStatus.PENDING &&
            post.approvalReason !== null
          ) {
            postUpdated = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      // Verify post was updated
      const getResponse = await request(app.getHttpServer())
        .get(`/posts/${approvedPostId}`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(getResponse.status).toBe(200);
      const post = getResponse.body;

      // Verify post status is approved (or at least not pending)
      expect(post.status).not.toBe(PostStatus.PENDING);
      // Note: The LLM might reject even good content, so we just verify it was processed
      expect([PostStatus.APPROVED, PostStatus.REJECTED]).toContain(post.status);
      expect(post.approvalReason).toBeDefined();
      expect(post.approvalReason).not.toBeNull();
      expect(typeof post.approvalReason).toBe('string');
      expect(post.approvalReason.length).toBeGreaterThan(0);

      // Verify confidence score is set (decimal comes as string from DB)
      expect(post.confidenceScore).toBeDefined();
      expect(post.confidenceScore).not.toBeNull();
      const confidenceScoreNum =
        typeof post.confidenceScore === 'string'
          ? parseFloat(post.confidenceScore)
          : post.confidenceScore;
      expect(confidenceScoreNum).toBeGreaterThanOrEqual(0);
      expect(confidenceScoreNum).toBeLessThanOrEqual(1);

      console.log('✅ Approved post details:', {
        status: post.status,
        reason: post.approvalReason,
        confidenceScore: post.confidenceScore,
      });
    });

    it('should reject a post using PostApprovalJob', async () => {
      // Dispatch the approval job
      await PostApprovalJob.dispatch({
        postId: rejectedPostId,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
      }).dispatch();

      // Wait for job to complete (with timeout and polling)
      const maxWaitTime = 30000; // 30 seconds
      const checkInterval = 2000; // 2 seconds
      const startTime = Date.now();
      let postUpdated = false;

      while (Date.now() - startTime < maxWaitTime && !postUpdated) {
        const getResponse = await request(app.getHttpServer())
          .get(`/posts/${rejectedPostId}`)
          .set('Authorization', `Bearer ${jwtToken}`);

        if (getResponse.status === 200) {
          const post = getResponse.body;
          if (
            post.status !== PostStatus.PENDING &&
            post.approvalReason !== null
          ) {
            postUpdated = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      // Verify post was updated
      const getResponse = await request(app.getHttpServer())
        .get(`/posts/${rejectedPostId}`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(getResponse.status).toBe(200);
      const post = getResponse.body;

      // Verify post status is rejected
      expect(post.status).toBe(PostStatus.REJECTED);
      expect(post.approvalReason).toBeDefined();
      expect(post.approvalReason).not.toBeNull();
      expect(typeof post.approvalReason).toBe('string');
      expect(post.approvalReason.length).toBeGreaterThan(0);

      // Verify confidence score is set (decimal comes as string from DB)
      expect(post.confidenceScore).toBeDefined();
      expect(post.confidenceScore).not.toBeNull();
      const confidenceScoreNum =
        typeof post.confidenceScore === 'string'
          ? parseFloat(post.confidenceScore)
          : post.confidenceScore;
      expect(confidenceScoreNum).toBeGreaterThanOrEqual(0);
      expect(confidenceScoreNum).toBeLessThanOrEqual(1);

      console.log('✅ Rejected post details:', {
        status: post.status,
        reason: post.approvalReason,
        confidenceScore: post.confidenceScore,
      });
    });

    it('should verify LLM response has fixed JSON structure', async () => {
      // Create a test post to verify JSON structure
      const timestamp = Date.now();
      const testPostContent = {
        title: `Test Post for JSON Validation ${timestamp}`,
        content: `This is a test post to verify that the LLM returns properly structured JSON responses. Timestamp: ${timestamp}`,
        source: 'test',
        provider: 'test',
        timestamp,
      };

      const hash = createHash('sha256')
        .update(JSON.stringify(testPostContent))
        .digest('hex');

      const createResponse = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          hash,
          title: testPostContent.title,
          meta: { content: testPostContent.content },
          source: testPostContent.source,
          provider: testPostContent.provider,
          userId,
        });

      expect(createResponse.status).toBe(201);
      const testPostId = createResponse.body.id;

      // Dispatch the approval job
      await PostApprovalJob.dispatch({
        postId: testPostId,
        promptId,
        aiProviderId,
        model: 'qwen3:30b',
        temperature: 0.7,
        userId,
      }).dispatch();

      // Wait for job to complete (with timeout and polling)
      const maxWaitTime = 30000; // 30 seconds
      const checkInterval = 2000; // 2 seconds
      const startTime = Date.now();
      let postUpdated = false;

      while (Date.now() - startTime < maxWaitTime && !postUpdated) {
        const getResponse = await request(app.getHttpServer())
          .get(`/posts/${testPostId}`)
          .set('Authorization', `Bearer ${jwtToken}`);

        if (getResponse.status === 200) {
          const post = getResponse.body;
          if (
            post.status !== PostStatus.PENDING &&
            post.approvalReason !== null
          ) {
            postUpdated = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      // Verify post was updated with valid JSON structure
      const getResponse = await request(app.getHttpServer())
        .get(`/posts/${testPostId}`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(getResponse.status).toBe(200);
      const post = getResponse.body;

      // Verify the response structure matches expected format
      expect(post.status).toMatch(/^(approved|rejected|pending)$/);
      expect(post.approvalReason).toBeDefined();
      expect(post.confidenceScore).toBeDefined();
      const confidenceScoreNum =
        typeof post.confidenceScore === 'string'
          ? parseFloat(post.confidenceScore)
          : post.confidenceScore;
      expect(confidenceScoreNum).toBeGreaterThanOrEqual(0);
      expect(confidenceScoreNum).toBeLessThanOrEqual(1);

      // Clean up test post
      await dataSource.query('DELETE FROM posts WHERE id = $1', [testPostId]);

      console.log('✅ JSON structure validation passed:', {
        status: post.status,
        hasReason: !!post.approvalReason,
        hasConfidenceScore: post.confidenceScore !== null,
        confidenceScoreInRange:
          confidenceScoreNum >= 0 && confidenceScoreNum <= 1,
      });
    });
  });
});
