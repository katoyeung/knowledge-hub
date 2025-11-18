/**
 * Script to process an existing post with LLM
 * Usage: npx tsx test/process-existing-post.ts <post-id>
 * Or: node --loader tsx test/process-existing-post.ts <post-id>
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GenericLLMProcessingJob } from '../src/modules/queue/jobs/llm-processing/generic-llm-processing.job';
import { PostStatus } from '../src/modules/posts/enums/post-status.enum';
import { FieldMappingConfig } from '../src/modules/queue/jobs/llm-processing/interfaces/result-application-strategy.interface';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { AuthHelper } from './auth-helper';
import request from 'supertest';

async function processExistingPost() {
  const postId = process.argv[2];

  if (!postId) {
    console.error('❌ Please provide a post ID');
    console.log('Usage: npx tsx test/process-existing-post.ts <post-id>');
    process.exit(1);
  }

  console.log(`🚀 Processing post: ${postId}`);

  // Create NestJS application
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const postRepository = app.get<Repository<Post>>(getRepositoryToken(Post));
  const genericLLMProcessingJob = app.get<GenericLLMProcessingJob>(
    GenericLLMProcessingJob,
  );

  // Get JWT token for API calls
  const nestApp = await NestFactory.create(AppModule);
  await nestApp.init();
  const authResult = await AuthHelper.authenticateAsAdmin(nestApp);
  const jwtToken = authResult.jwtToken;
  const userId = authResult.user.id;

  try {
    // Check if post exists
    const post = await postRepository.findOne({ where: { id: postId } });
    if (!post) {
      console.error(`❌ Post with ID ${postId} not found`);
      process.exit(1);
    }

    console.log(`\n📊 Post before processing:`);
    console.log(`   ID: ${post.id}`);
    console.log(`   Title: ${post.title}`);
    console.log(`   Status: ${post.status}`);
    console.log(`   Approval Reason: ${post.approvalReason || 'null'}`);
    console.log(`   Confidence Score: ${post.confidenceScore || 'null'}`);

    // Find or create Crumplete AI provider
    const providersResponse = await request(nestApp.getHttpServer())
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
      console.error('❌ Crumplete AI provider not found');
      process.exit(1);
    }

    const aiProviderId = crumpleteProvider.id;

    // Find or create "Detect Social Media Post" prompt
    const promptsResponse = await request(nestApp.getHttpServer())
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
      console.error('❌ "Detect Social Media Post" prompt not found');
      process.exit(1);
    }

    const promptId = detectPrompt.id;

    // Define field mappings
    const fieldMappings: FieldMappingConfig = {
      mappings: {
        status: {
          from: 'status',
          defaultValue: PostStatus.REJECTED,
          transform: (v) => {
            if (!v) {
              return PostStatus.REJECTED;
            }
            const statusLower = String(v).toLowerCase().trim();
            if (statusLower === 'approved') {
              return PostStatus.APPROVED;
            } else if (statusLower === 'rejected') {
              return PostStatus.REJECTED;
            }
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

    console.log(`\n🔄 Processing with:`);
    console.log(`   AI Provider: Crumplete AI (${aiProviderId})`);
    console.log(`   Model: llama3.3:70b`);
    console.log(`   Prompt: Detect Social Media Post (${promptId})`);

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
    const updatedPost = await postRepository.findOne({ where: { id: postId } });

    console.log(`\n📊 Post after processing:`);
    console.log(`   ID: ${updatedPost?.id}`);
    console.log(`   Status: ${updatedPost?.status}`);
    console.log(`   Approval Reason: ${updatedPost?.approvalReason || 'null'}`);
    console.log(
      `   Confidence Score: ${updatedPost?.confidenceScore || 'null'}`,
    );
    console.log(`   Updated At: ${updatedPost?.updatedAt}`);

    // Query database directly to verify
    const dbQueryResult = await dataSource.query(
      'SELECT id, status, approval_reason, confidence_score, updated_at FROM posts WHERE id = $1',
      [postId],
    );

    if (dbQueryResult.length > 0) {
      const dbPost = dbQueryResult[0];
      console.log(`\n📊 Post from database (raw SQL):`);
      console.log(`   Status: ${dbPost.status}`);
      console.log(`   Approval Reason: ${dbPost.approval_reason || 'null'}`);
      console.log(`   Confidence Score: ${dbPost.confidence_score || 'null'}`);
    }

    console.log(`\n✅ Post ${postId} processed successfully!`);
  } catch (error) {
    console.error('❌ Error processing post:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await nestApp.close();
    await app.close();
  }
}

processExistingPost();
