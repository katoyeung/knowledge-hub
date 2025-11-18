/**
 * E2E test to process an existing post
 * Set POST_ID environment variable to the post ID you want to process
 * Example: POST_ID=9548114e-0897-4193-a7cd-e3f1c777f3dc npm run test:e2e -- test/process-existing-post.e2e-spec.ts
 */

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

describe('Process Existing Post E2E Test', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;
  let aiProviderId: string;
  let promptId: string;
  let postRepository: Repository<Post>;
  let genericLLMProcessingJob: GenericLLMProcessingJob;
  const postId = process.env.POST_ID || '9548114e-0897-4193-a7cd-e3f1c777f3dc';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    postRepository = app.get<Repository<Post>>(getRepositoryToken(Post));
    genericLLMProcessingJob = app.get<GenericLLMProcessingJob>(
      GenericLLMProcessingJob,
    );

    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
    userId = authResult.user.id;

    // Find Crumplete AI provider
    const providersResponse = await request(app.getHttpServer())
      .get('/ai-providers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Crumplete AI' });

    const providers = Array.isArray(providersResponse.body)
      ? providersResponse.body
      : providersResponse.body.data || [];

    const crumpleteProvider = providers.find(
      (p: any) => p.name === 'Crumplete AI',
    );

    if (!crumpleteProvider) {
      throw new Error('Crumplete AI provider not found');
    }

    aiProviderId = crumpleteProvider.id;

    // Find "Detect Social Media Post" prompt
    const promptsResponse = await request(app.getHttpServer())
      .get('/prompts')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ 'filter[name]': 'Detect Social Media Post' });

    const prompts = Array.isArray(promptsResponse.body)
      ? promptsResponse.body
      : promptsResponse.body.data || [];

    const detectPrompt = prompts.find(
      (p: any) => p.name === 'Detect Social Media Post',
    );

    if (!detectPrompt) {
      throw new Error('Detect Social Media Post prompt not found');
    }

    promptId = detectPrompt.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it(`should process existing post ${postId}`, async () => {
    console.log(`\n🚀 Processing existing post: ${postId}`);

    // Check if post exists
    const postBefore = await postRepository.findOne({ where: { id: postId } });
    if (!postBefore) {
      throw new Error(`Post with ID ${postId} not found`);
    }

    console.log(`\n📊 Post BEFORE processing:`);
    console.log(`   ID: ${postBefore.id}`);
    console.log(`   Title: ${postBefore.title}`);
    console.log(`   Status: ${postBefore.status}`);
    console.log(`   Approval Reason: ${postBefore.approvalReason || 'null'}`);
    console.log(`   Confidence Score: ${postBefore.confidenceScore || 'null'}`);

    // Query database before
    const dbBefore = await dataSource.query(
      'SELECT id, status, approval_reason, confidence_score FROM posts WHERE id = $1',
      [postId],
    );
    console.log(`\n📊 Database BEFORE (raw SQL):`);
    console.log(`   Status: ${dbBefore[0]?.status}`);
    console.log(
      `   Approval Reason: ${dbBefore[0]?.approval_reason || 'null'}`,
    );

    // Define field mappings
    const fieldMappings: FieldMappingConfig = {
      mappings: {
        status: {
          from: 'status',
          defaultValue: PostStatus.REJECTED,
          transform: (v) => {
            if (!v) return PostStatus.REJECTED;
            const statusLower = String(v).toLowerCase().trim();
            if (statusLower === 'approved') return PostStatus.APPROVED;
            if (statusLower === 'rejected') return PostStatus.REJECTED;
            return PostStatus.REJECTED;
          },
        },
        approvalReason: 'reason',
        confidenceScore: {
          from: 'confidenceScore',
          transform: (v) => {
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
        error: PostStatus.PENDING,
      },
    };

    // Process the post
    await genericLLMProcessingJob.process({
      entityType: 'post',
      entityId: postId,
      promptId,
      aiProviderId,
      model: 'llama3.3:70b',
      temperature: 0.7,
      userId,
      fieldMappings,
    });

    console.log('✅ LLM processing completed');

    // Verify the update
    const postAfter = await postRepository.findOne({ where: { id: postId } });

    console.log(`\n📊 Post AFTER processing (via repository):`);
    console.log(`   Status: ${postAfter?.status}`);
    console.log(`   Approval Reason: ${postAfter?.approvalReason || 'null'}`);
    console.log(`   Confidence Score: ${postAfter?.confidenceScore || 'null'}`);
    console.log(`   Updated At: ${postAfter?.updatedAt}`);

    // Query database after
    const dbAfter = await dataSource.query(
      'SELECT id, status, approval_reason, confidence_score, updated_at FROM posts WHERE id = $1',
      [postId],
    );
    console.log(`\n📊 Database AFTER (raw SQL):`);
    console.log(`   Status: ${dbAfter[0]?.status}`);
    console.log(`   Approval Reason: ${dbAfter[0]?.approval_reason || 'null'}`);
    console.log(
      `   Confidence Score: ${dbAfter[0]?.confidence_score || 'null'}`,
    );
    console.log(`   Updated At: ${dbAfter[0]?.updated_at}`);

    // Assertions
    expect(postAfter).toBeDefined();
    expect(postAfter?.status).not.toBe(PostStatus.PENDING);
    expect(
      [PostStatus.APPROVED, PostStatus.REJECTED].includes(
        postAfter?.status as PostStatus,
      ),
    ).toBe(true);
    expect(postAfter?.approvalReason).toBeDefined();
    expect(postAfter?.approvalReason).not.toBeNull();

    console.log(`\n✅ Post ${postId} processed successfully!`);
    console.log(`   Final Status: ${postAfter?.status}`);
  }, 60000);
});
