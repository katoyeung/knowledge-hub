import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorIndexesToEmbeddings1703000000000
  implements MigrationInterface
{
  name = 'AddVectorIndexesToEmbeddings1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, ensure the pgvector extension is enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Check if embeddings table has data to determine optimal lists parameter
    const embeddingCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM embeddings WHERE embedding IS NOT NULL`,
    );

    const count = parseInt(embeddingCount[0].count);
    console.log(`Found ${count} embeddings`);

    // Skip this migration - column type needs to be fixed first
    console.log(
      `⚠️ Skipping vector index creation - column type needs to be fixed first`,
    );
    console.log(`✅ Migration completed (skipped vector indexes)`);
    return;

    // Calculate optimal lists parameter for IVFFlat
    // Rule of thumb: lists = sqrt(rows) for < 1M rows, or rows/1000 for larger datasets
    let listsParam = 100; // Default
    if (count > 0) {
      if (count < 1000000) {
        listsParam = Math.max(Math.floor(Math.sqrt(count)), 10);
      } else {
        listsParam = Math.floor(count / 1000);
      }
      // Cap at reasonable limits
      listsParam = Math.min(Math.max(listsParam, 10), 10000);
    }

    console.log(
      `Creating IVFFlat index with lists=${listsParam} (based on ${count} embeddings)`,
    );

    // IVFFlat Index - Better for larger datasets, requires training
    // Uses L2 distance by default (Euclidean)
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_ivfflat 
        ON embeddings 
        USING ivfflat (embedding vector_l2_ops) 
        WITH (lists = ${listsParam})
      `);
      console.log(`✅ IVFFlat index created successfully`);
    } catch (error) {
      console.log(`⚠️ IVFFlat index creation failed:`, error.message);
      // Continue with HNSW index creation
    }

    // HNSW Index - Better for real-time queries, no training needed
    // More memory usage but faster approximate searches
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_hnsw 
        ON embeddings 
        USING hnsw (embedding vector_l2_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      console.log(`✅ HNSW index created successfully`);
    } catch (error) {
      console.log(`⚠️ HNSW index creation failed:`, error.message);
    }

    // Optional: Cosine similarity index (if you use cosine distance)
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_cosine 
        ON embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      console.log(`✅ Cosine similarity index created successfully`);
    } catch (error) {
      console.log(`⚠️ Cosine similarity index creation failed:`, error.message);
    }

    // Add index on model name for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_model_name 
      ON embeddings (model_name)
    `);

    // Composite index for model + non-null embeddings
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_model_embedding_exists
      ON embeddings (model_name) 
      WHERE embedding IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_embeddings_model_embedding_exists`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_model_name`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_embeddings_embedding_cosine`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_embeddings_embedding_hnsw`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_embeddings_embedding_ivfflat`,
    );
  }
}
