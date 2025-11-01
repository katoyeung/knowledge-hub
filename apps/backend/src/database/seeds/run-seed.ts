import { DataSource } from 'typeorm';
import { InitialPermissionsSeed } from './initial-permissions.seed';
import { InitialRolesSeed } from './initial-roles.seed';
import { InitialAdminSeed } from './initial-admin.seed';
import { InitialAiProvidersSeed } from './initial-ai-providers.seed';
import { seedPrompts } from './initial-prompts.seed';
import { seedSocialMediaGraphExtractionPrompt } from './social-media-graph-extraction-prompt.seed';
import { seedDocumentGraphExtractionPrompt } from './document-graph-extraction-prompt.seed';
import { seedPostsIndexes } from './posts-indexes.seed';
import Keyv from 'keyv';

export class SeedRunner {
  constructor(
    private dataSource: DataSource,
    private cache: Keyv,
  ) {}

  async run() {
    try {
      // Run permission seeds first
      const permissionSeed = new InitialPermissionsSeed();
      await permissionSeed.run(this.dataSource);
      console.log('✅ Permissions seeded successfully');

      // Then run role seeds
      const roleSeed = new InitialRolesSeed();
      await roleSeed.run(this.dataSource);
      console.log('✅ Roles seeded successfully');

      // Create admin user
      const adminSeed = new InitialAdminSeed();
      await adminSeed.run(this.dataSource);
      console.log('✅ Admin user seeded successfully');

      // Create AI providers
      const aiProvidersSeed = new InitialAiProvidersSeed();
      await aiProvidersSeed.run(this.dataSource);
      console.log('✅ AI providers seeded successfully');

      // Create prompts
      await seedPrompts(this.dataSource);
      console.log('✅ Prompts seeded successfully');

      // Create social media graph extraction prompt
      await seedSocialMediaGraphExtractionPrompt(this.dataSource);
      console.log(
        '✅ Social Media Graph Extraction prompt seeded successfully',
      );

      // Create document graph extraction prompt
      await seedDocumentGraphExtractionPrompt(this.dataSource);
      console.log('✅ Document Graph Extraction prompt seeded successfully');

      // Create posts table indexes (GIN index for JSONB)
      await seedPostsIndexes(this.dataSource);
      console.log('✅ Posts indexes seeded successfully');

      // Create graph extraction prompts
      // TODO: Re-enable when TypeScript can resolve the dynamic import
      // try {
      //   const { seedGraphExtractionPrompts } = await import(
      //     './graph-extraction-prompts.seed'
      //   );
      //   await seedGraphExtractionPrompts(this.dataSource);
      //   console.log('✅ Graph extraction prompts seeded successfully');
      // } catch (error) {
      //   console.warn('⚠️ Graph extraction prompts seed not found, skipping...');
      // }

      // Invalidate user cache
      await this.invalidateUserCache();
      console.log('✅ User cache invalidated successfully');
    } catch (error) {
      console.error('❌ Error seeding database:', error);
      throw error;
    }
  }

  private async invalidateUserCache(): Promise<void> {
    // Get admin user from database
    const adminUser = await this.dataSource
      .getRepository('users')
      .findOne({ where: { email: 'admin@example.com' } });

    if (adminUser) {
      // Invalidate specific user cache
      await this.cache.delete(`user:${adminUser.id}`);
      // Invalidate all users cache if it exists
      await this.cache.delete('users:all');
    }
  }
}
