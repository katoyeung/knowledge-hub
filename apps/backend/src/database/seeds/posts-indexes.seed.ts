import { DataSource } from 'typeorm';

/**
 * Seeds indexes for posts table
 * Creates GIN index on meta JSONB column for efficient JSON queries
 */
export async function seedPostsIndexes(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    // Check if posts table exists
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'posts'
      )
    `);

    if (!tableExists[0].exists) {
      console.log('⚠️ Posts table does not exist, skipping index creation');
      return;
    }

    // Check if GIN index already exists
    const indexExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'posts' 
        AND indexname = 'idx_posts_meta'
      )
    `);

    if (indexExists[0].exists) {
      console.log('✅ Posts meta GIN index already exists');
      return;
    }

    // Create GIN index on meta JSONB column for efficient JSON queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_meta" ON "posts" USING gin ("meta")
    `);

    console.log('✅ Posts meta GIN index created successfully');
  } catch (error) {
    console.error('❌ Error creating posts indexes:', error);
    throw error;
  }
}
