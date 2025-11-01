import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostsTable1734567896000 implements MigrationInterface {
  name = 'CreatePostsTable1734567896000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create posts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "posts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "hash" varchar(255) NOT NULL,
        "provider" varchar(255),
        "source" varchar(255),
        "title" text,
        "meta" jsonb,
        "user_id" uuid,
        "dataset_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_posts" PRIMARY KEY ("id")
      )
    `);

    // Create unique index on hash
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_posts_hash" ON "posts" ("hash")
    `);

    // Create index on provider
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_provider" ON "posts" ("provider")
    `);

    // Create index on source
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_source" ON "posts" ("source")
    `);

    // Create index on title
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_title" ON "posts" ("title")
    `);

    // Note: Content is stored in meta.content, indexed via GIN on meta

    // Note: GIN index on meta JSONB is created via seeder, not migration

    // Create indexes on foreign keys
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_user_id" ON "posts" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_posts_dataset_id" ON "posts" ("dataset_id")
    `);

    // Add foreign key constraints (optional - only if tables exist)
    // Check if users table exists before adding foreign key
    const usersTableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);

    if (usersTableExists[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "posts" 
        ADD CONSTRAINT "FK_posts_user" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      `);
    }

    // Check if datasets table exists before adding foreign key
    const datasetsTableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'datasets'
      )
    `);

    if (datasetsTableExists[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "posts" 
        ADD CONSTRAINT "FK_posts_dataset" 
        FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE SET NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "posts" 
      DROP CONSTRAINT IF EXISTS "FK_posts_dataset"
    `);

    await queryRunner.query(`
      ALTER TABLE "posts" 
      DROP CONSTRAINT IF EXISTS "FK_posts_user"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_dataset_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_user_id"
    `);

    // Note: GIN index on meta is managed by seeder, not migration
    // If it exists, it should be dropped manually: DROP INDEX IF EXISTS "idx_posts_meta"

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_title"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_source"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_provider"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_posts_hash"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "posts"
    `);
  }
}
