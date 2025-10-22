import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEntityDictionaryTables1734567894000
  implements MigrationInterface
{
  name = 'CreateEntityDictionaryTables1734567894000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create predefined_entities table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "predefined_entities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dataset_id" uuid NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "canonical_name" varchar(255) NOT NULL,
        "confidence_score" decimal(3,2) DEFAULT 0.8,
        "source" varchar(50) DEFAULT 'manual',
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_predefined_entities" PRIMARY KEY ("id")
      )
    `);

    // Create entity_aliases table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "entity_aliases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "predefined_entity_id" uuid NOT NULL,
        "alias" varchar(255) NOT NULL,
        "similarity_score" decimal(3,2) DEFAULT 1.0,
        "match_count" integer DEFAULT 0,
        "last_matched_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_entity_aliases" PRIMARY KEY ("id")
      )
    `);

    // Create entity_normalization_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "entity_normalization_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dataset_id" uuid NOT NULL,
        "original_entity" varchar(255) NOT NULL,
        "normalized_to" varchar(255) NOT NULL,
        "method" varchar(50) NOT NULL,
        "confidence" decimal(3,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_entity_normalization_logs" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "predefined_entities" 
      ADD CONSTRAINT "FK_predefined_entities_dataset" 
      FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "predefined_entities" 
      ADD CONSTRAINT "FK_predefined_entities_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "entity_aliases" 
      ADD CONSTRAINT "FK_entity_aliases_predefined_entity" 
      FOREIGN KEY ("predefined_entity_id") REFERENCES "predefined_entities"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "entity_normalization_logs" 
      ADD CONSTRAINT "FK_entity_normalization_logs_dataset" 
      FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_predefined_entities_dataset_id" ON "predefined_entities" ("dataset_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_predefined_entities_entity_type" ON "predefined_entities" ("entity_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_predefined_entities_canonical_name" ON "predefined_entities" ("canonical_name")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_aliases_predefined_entity_id" ON "entity_aliases" ("predefined_entity_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_aliases_alias" ON "entity_aliases" ("alias")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_normalization_logs_dataset_id" ON "entity_normalization_logs" ("dataset_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_entity_normalization_logs_original_entity" ON "entity_normalization_logs" ("original_entity")
    `);

    // Create unique constraints
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_predefined_entities_dataset_canonical_name" 
      ON "predefined_entities" ("dataset_id", "canonical_name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_entity_aliases_entity_alias" 
      ON "entity_aliases" ("predefined_entity_id", "alias")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_entity_aliases_entity_alias"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predefined_entities_dataset_canonical_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_entity_normalization_logs_original_entity"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_entity_normalization_logs_dataset_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_entity_aliases_alias"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_entity_aliases_predefined_entity_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predefined_entities_canonical_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predefined_entities_entity_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predefined_entities_dataset_id"`,
    );

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "entity_normalization_logs" DROP CONSTRAINT IF EXISTS "FK_entity_normalization_logs_dataset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "entity_aliases" DROP CONSTRAINT IF EXISTS "FK_entity_aliases_predefined_entity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "predefined_entities" DROP CONSTRAINT IF EXISTS "FK_predefined_entities_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "predefined_entities" DROP CONSTRAINT IF EXISTS "FK_predefined_entities_dataset"`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_normalization_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_aliases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "predefined_entities"`);
  }
}
