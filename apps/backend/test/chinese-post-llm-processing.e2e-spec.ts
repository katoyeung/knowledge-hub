import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { PostStatus } from '../src/modules/posts/enums/post-status.enum';
import { GenericLLMProcessingJob } from '../src/modules/queue/jobs/llm-processing/generic-llm-processing.job';
import { FieldMappingConfig } from '../src/modules/queue/jobs/llm-processing/interfaces/result-application-strategy.interface';
import { createHash } from 'crypto';

describe('Chinese Post LLM Processing E2E Test', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;
  let aiProviderId: string;
  let promptId: string;
  let postRepository: Repository<Post>;
  let genericLLMProcessingJob: GenericLLMProcessingJob;
  let testPostId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Get repositories
    postRepository = app.get<Repository<Post>>(getRepositoryToken(Post));

    // Get job instance
    genericLLMProcessingJob = app.get<GenericLLMProcessingJob>(
      GenericLLMProcessingJob,
    );

    // Get JWT token for authentication
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
    userId = authResult.user.id;

    // Find or create Crumplete AI provider (Ollama)
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
      // Create provider if it doesn't exist (API key should be in database)
      const createResponse = await request(app.getHttpServer())
        .post('/ai-providers')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Crumplete AI',
          type: 'ollama',
          baseUrl: 'https://api.crumplete.ai/v1',
          // API key should be set in the database entity
          apiKey: process.env.CRUMPLETE_API_KEY,
          isActive: true,
        });

      expect(createResponse.status).toBe(201);
      crumpleteProvider = createResponse.body;
    }

    // Verify provider has API key
    if (!crumpleteProvider.apiKey) {
      throw new Error(
        'Crumplete AI provider does not have an API key. Please set it in the database.',
      );
    }

    aiProviderId = crumpleteProvider.id;

    // Verify or add llama3.3:70b model
    const modelsResponse = await request(app.getHttpServer())
      .get(`/ai-providers/${aiProviderId}/models`)
      .set('Authorization', `Bearer ${jwtToken}`);

    let llamaModel;
    if (modelsResponse.status === 200) {
      const models = modelsResponse.body;
      llamaModel = models.find((m: any) => m.id === 'llama3.3:70b');
    }

    if (!llamaModel) {
      const addModelResponse = await request(app.getHttpServer())
        .post(`/ai-providers/${aiProviderId}/models`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          id: 'llama3.3:70b',
          name: 'Llama 3.3 70B',
          description: 'Crumplete AI Llama 3.3 70B model',
          maxTokens: 128000,
          contextWindow: 128000,
          pricing: { input: 0, output: 0 },
        });

      if (addModelResponse.status !== 201) {
        console.warn('Failed to add llama3.3:70b model');
      }
    }

    // Find or create "Detect Social Media Post" prompt
    const promptsResponse = await request(app.getHttpServer())
      .get('/prompts')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Detect Social Media Post' });

    let detectPrompt;
    if (promptsResponse.status === 200) {
      const prompts = Array.isArray(promptsResponse.body)
        ? promptsResponse.body
        : promptsResponse.body.data || [];
      detectPrompt = prompts.find(
        (p: any) => p.name === 'Detect Social Media Post',
      );
    }

    if (!detectPrompt) {
      const createPromptResponse = await request(app.getHttpServer())
        .post('/prompts')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Detect Social Media Post',
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
          description:
            'Prompt for detecting and categorizing social media posts',
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
                description:
                  'Explanation for the approval or rejection decision',
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
        });

      expect(createPromptResponse.status).toBe(201);
      detectPrompt = createPromptResponse.body;
    }

    promptId = detectPrompt.id;

    // Create test post with Chinese title
    const postData = {
      hash: createHash('sha256')
        .update(`chinese-post-${Date.now()}`)
        .digest('hex'),
      title: '老豆開礦？錢，自己印？幫洗？',
      source: 'test',
      provider: 'test',
      status: PostStatus.PENDING,
      meta: {
        content: '老豆開礦？錢，自己印？幫洗？',
      },
      userId,
    };

    const post = postRepository.create(postData);
    const savedPost = await postRepository.save(post);
    testPostId = savedPost.id;

    console.log(`✅ Created test post with ID: ${testPostId}`);
    console.log(`   Title: ${postData.title}`);
    console.log(`   Status: ${savedPost.status}`);
  });

  afterAll(async () => {
    // Clean up test data
    // NOTE: Set KEEP_TEST_POST=true to keep the post in database for manual inspection
    const keepTestPost = process.env.KEEP_TEST_POST === 'true';

    if (dataSource) {
      if (testPostId) {
        if (keepTestPost) {
          console.log(
            `\n⚠️  KEEP_TEST_POST=true - Post ${testPostId} NOT deleted for manual inspection`,
          );
          console.log(
            `   Query: SELECT * FROM posts WHERE id = '${testPostId}';`,
          );
        } else {
          await dataSource.query('DELETE FROM posts WHERE id = $1', [
            testPostId,
          ]);
          console.log(`\n🧹 Cleaned up test post ${testPostId}`);
        }
      }
    }
    await app.close();
  });

  it('should process Chinese post with Crumplete AI (Ollama) and update status', async () => {
    console.log('\n🚀 Starting LLM processing for Chinese post...');
    console.log(`   Post ID: ${testPostId}`);
    console.log(`   AI Provider: Crumplete AI (Ollama)`);
    console.log(`   Model: llama3.3:70b`);
    console.log(`   Prompt: Detect Social Media Post`);

    // Verify post is in pending status before processing
    const postBefore = await postRepository.findOne({
      where: { id: testPostId },
    });
    expect(postBefore).toBeDefined();
    expect(postBefore?.status).toBe(PostStatus.PENDING);
    expect(postBefore?.approvalReason).toBeNull();
    expect(postBefore?.confidenceScore).toBeNull();

    console.log(`   Initial status: ${postBefore?.status}`);

    // Query database before processing to show initial state
    const dbQueryBefore = await dataSource.query(
      'SELECT id, status, approval_reason, confidence_score, updated_at FROM posts WHERE id = $1',
      [testPostId],
    );
    if (dbQueryBefore.length > 0) {
      console.log('\n📊 Post state BEFORE processing (from database):');
      console.log('   Status:', dbQueryBefore[0].status);
      console.log('   Approval Reason:', dbQueryBefore[0].approval_reason);
      console.log('   Confidence Score:', dbQueryBefore[0].confidence_score);
    }

    // Define field mappings for approval use case
    const fieldMappings: FieldMappingConfig = {
      mappings: {
        status: {
          from: 'status',
          defaultValue: PostStatus.REJECTED, // Default to rejected if status is missing
          transform: (v) => {
            // Case-insensitive matching
            if (!v) {
              console.warn(
                '⚠️  Status field is missing or null from LLM response',
              );
              return PostStatus.REJECTED;
            }
            const statusLower = String(v).toLowerCase().trim();
            if (statusLower === 'approved') {
              return PostStatus.APPROVED;
            } else if (statusLower === 'rejected') {
              return PostStatus.REJECTED;
            }
            // If status doesn't match, log and return rejected as default
            console.warn(
              `⚠️  Unexpected status value from LLM: "${v}" (type: ${typeof v})`,
            );
            return PostStatus.REJECTED;
          },
        },
        approvalReason: 'reason',
        confidenceScore: {
          from: 'confidenceScore',
          transform: (v) => {
            // Convert string to number if needed
            if (typeof v === 'string') {
              const num = parseFloat(v);
              return isNaN(num) ? 0 : num;
            }
            return typeof v === 'number' ? v : 0;
          },
        },
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
        error: PostStatus.PENDING, // Keep as pending on error
      },
    };

    // Process the post using GenericLLMProcessingJob
    try {
      await genericLLMProcessingJob.process({
        entityType: 'post',
        entityId: testPostId,
        promptId,
        aiProviderId,
        model: 'llama3.3:70b',
        temperature: 0.7,
        userId,
        fieldMappings,
      });

      console.log('✅ LLM processing completed');
    } catch (error) {
      console.error('❌ LLM processing failed:', error);
      console.error(
        'Error details:',
        error instanceof Error ? error.message : String(error),
      );
      console.error(
        'Stack:',
        error instanceof Error ? error.stack : 'No stack trace',
      );
      throw error;
    }

    // Verify post status was updated - Query directly from database
    console.log('\n🔍 Querying database directly to verify update...');
    const dbQueryResult = await dataSource.query(
      'SELECT id, status, approval_reason, confidence_score, updated_at FROM posts WHERE id = $1',
      [testPostId],
    );

    if (dbQueryResult.length > 0) {
      const dbPost = dbQueryResult[0];
      console.log('\n📊 Post state from database (raw SQL query):');
      console.log('   ID:', dbPost.id);
      console.log('   Status:', dbPost.status);
      console.log('   Approval Reason:', dbPost.approval_reason);
      console.log('   Confidence Score:', dbPost.confidence_score);
      console.log('   Updated At:', dbPost.updated_at);
    }

    // Also query via repository
    const postAfter = await postRepository.findOne({
      where: { id: testPostId },
    });

    console.log('\n📊 Post state after processing (via repository):');
    console.log('   ID:', postAfter?.id);
    console.log('   Status:', postAfter?.status);
    console.log('   Approval Reason:', postAfter?.approvalReason);
    console.log('   Confidence Score:', postAfter?.confidenceScore);
    console.log('   Updated At:', postAfter?.updatedAt);

    expect(postAfter).toBeDefined();

    if (postAfter?.status === PostStatus.PENDING) {
      console.error('\n❌ Post status is still PENDING after processing!');
      console.error(
        '   This suggests the LLM result was not applied correctly.',
      );
      console.error('   Check backend logs for errors during processing.');
    }

    expect(postAfter?.status).not.toBe(PostStatus.PENDING);
    expect(
      [PostStatus.APPROVED, PostStatus.REJECTED].includes(
        postAfter?.status as PostStatus,
      ),
    ).toBe(true);
    expect(postAfter?.approvalReason).toBeDefined();
    expect(postAfter?.approvalReason).not.toBeNull();
    expect(postAfter?.confidenceScore).toBeDefined();
    // Handle both string and number (decimal columns may return as string)
    const confidenceScore =
      typeof postAfter?.confidenceScore === 'string'
        ? parseFloat(postAfter.confidenceScore)
        : postAfter?.confidenceScore;
    expect(confidenceScore).toBeGreaterThanOrEqual(0);
    expect(confidenceScore).toBeLessThanOrEqual(1);

    console.log(`\n✅ Post status updated successfully:`);
    console.log(`   Final status: ${postAfter?.status}`);
    console.log(`   Approval reason: ${postAfter?.approvalReason}`);
    console.log(`   Confidence score: ${postAfter?.confidenceScore}`);

    // Additional assertions
    expect(postAfter?.id).toBe(testPostId);
    expect(postAfter?.title).toBe('老豆開礦？錢，自己印？幫洗？');
  }, 60000); // 60 second timeout for LLM API call
});
