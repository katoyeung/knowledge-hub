/**
 * Script to check post status and job processing
 * Usage: npx tsx test/check-post-status.ts <postId>
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { config } from 'dotenv';

config();

async function checkPostStatus(postId: string) {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'knowledge_hub',
    entities: [Post],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connected');

    const postRepository = dataSource.getRepository(Post);
    const post = await postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      console.error(`❌ Post ${postId} not found`);
      return;
    }

    console.log('\n📋 Post Details:');
    console.log(`   ID: ${post.id}`);
    console.log(`   Title: ${post.title}`);
    console.log(`   Status: ${post.status}`);
    console.log(`   Approval Reason: ${post.approvalReason || '(none)'}`);
    console.log(`   Confidence Score: ${post.confidenceScore || '(none)'}`);
    console.log(`   Created At: ${post.createdAt}`);
    console.log(`   Updated At: ${post.updatedAt}`);

    // Check if updated recently
    const now = new Date();
    const updatedAt = new Date(post.updatedAt);
    const diffMs = now.getTime() - updatedAt.getTime();
    const diffMins = Math.floor(diffMs / 1000 / 60);

    if (diffMins < 5) {
      console.log(`\n✅ Post was updated ${diffMins} minute(s) ago`);
    } else {
      console.log(`\n⚠️  Post was last updated ${diffMins} minute(s) ago`);
    }

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  }
}

const postId = process.argv[2];
if (!postId) {
  console.error('Usage: npx tsx test/check-post-status.ts <postId>');
  process.exit(1);
}

checkPostStatus(postId);
