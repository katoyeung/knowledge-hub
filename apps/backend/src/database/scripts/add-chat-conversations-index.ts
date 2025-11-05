import AppDataSource from '../../config/data-source';

async function addIndex() {
  const dataSource = AppDataSource;

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    console.log('Creating index on chat_conversations...');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_conversations_dataset_user_updated" 
      ON "chat_conversations" ("dataset_id", "user_id", "updated_at" DESC)
    `);

    console.log('✅ Index created successfully!');

    // Verify the index exists
    const indexExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'chat_conversations' 
        AND indexname = 'IDX_chat_conversations_dataset_user_updated'
      )
    `);

    if (indexExists[0].exists) {
      console.log('✅ Index verified and exists in database');
    } else {
      console.log('⚠️ Index may not have been created');
    }

    await queryRunner.release();
    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error creating index:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

addIndex();
