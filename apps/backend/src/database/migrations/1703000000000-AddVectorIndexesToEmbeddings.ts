import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorIndexesToEmbeddings1703000000000 implements MigrationInterface {
  name = 'AddVectorIndexesToEmbeddings1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, ensure the pgvector extension is enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Check if embeddings table has data to determine optimal lists parameter
    const embeddingCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM embeddings WHERE embedding IS NOT NULL`
    );
    
    const count = parseInt(embeddingCount[0].count);
    
    // Get dimension info from actual embeddings data
    let dimensions = 1024; // Default dimension
    if (count > 0) {
      try {
        const sampleEmbedding = await queryRunner.query(
          `SELECT vector_dims(embedding) as dimensions FROM embeddings WHERE embedding IS NOT NULL LIMIT 1`
        );
        if (sampleEmbedding.length > 0 && sampleEmbedding[0].dimensions) {
          dimensions = parseInt(sampleEmbedding[0].dimensions);
        }
      } catch (error) {
        // If vector_dims fails, try alternative approach
        console.log(`Could not get dimensions from vector_dims, using default: ${dimensions}`);
      }
    }

    console.log(`Found ${count} embeddings with ${dimensions} dimensions`);

    // If the embedding column doesn't have explicit dimensions, alter it
    try {
      await queryRunner.query(`ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(${dimensions})`);
      console.log(`Set embedding column to vector(${dimensions})`);
    } catch (error) {
      console.log(`Embedding column already has proper type or error:`, error.message);
    }
    
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

    console.log(`Creating IVFFlat index with lists=${listsParam} (based on ${count} embeddings)`);

    // IVFFlat Index - Better for larger datasets, requires training
    // Uses L2 distance by default (Euclidean)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_ivfflat 
      ON embeddings 
      USING ivfflat (embedding vector_l2_ops) 
      WITH (lists = ${listsParam})
    `);

    // HNSW Index - Better for real-time queries, no training needed
    // More memory usage but faster approximate searches
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_hnsw 
      ON embeddings 
      USING hnsw (embedding vector_l2_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    // Optional: Cosine similarity index (if you use cosine distance)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_cosine 
      ON embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

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
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_model_embedding_exists`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_model_name`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_embedding_cosine`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_embedding_hnsw`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_embedding_ivfflat`);
  }
} 