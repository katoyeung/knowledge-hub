import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceGraphEntitiesAndAliases1735200000000
  implements MigrationInterface
{
  name = 'EnhanceGraphEntitiesAndAliases1735200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if tables exist
    const graphEntitiesExists = await queryRunner.hasTable('graph_entities');
    const entityAliasesExists = await queryRunner.hasTable('entity_aliases');

    if (!graphEntitiesExists || !entityAliasesExists) {
      return;
    }

    // ===== Enhance graph_entities table =====

    // Add entity_id column (optional URI-based global identifier)
    const hasEntityId = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'graph_entities' 
      AND column_name = 'entity_id'
    `);

    if (hasEntityId.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "graph_entities" 
        ADD COLUMN "entity_id" varchar(500) NULL
      `);

      // Create unique index on entity_id (only for non-null values)
      await queryRunner.query(`
        CREATE UNIQUE INDEX "IDX_graph_entities_entity_id" 
        ON "graph_entities" ("entity_id") 
        WHERE "entity_id" IS NOT NULL
      `);
    }

    // Add equivalent_entities column (JSONB for cross-database references)
    const hasEquivalentEntities = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'graph_entities' 
      AND column_name = 'equivalent_entities'
    `);

    if (hasEquivalentEntities.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "graph_entities" 
        ADD COLUMN "equivalent_entities" jsonb NULL
      `);
    }

    // Add provenance column (JSONB for source tracking)
    const hasProvenance = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'graph_entities' 
      AND column_name = 'provenance'
    `);

    if (hasProvenance.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "graph_entities" 
        ADD COLUMN "provenance" jsonb NULL
      `);
    }

    // Note: metadata column already exists as JSONB, so we don't need to modify it
    // The new fields (industry, country, website, etc.) can be stored in the existing metadata JSONB

    // ===== Enhance entity_aliases table =====

    // Add language column (ISO 639-1 language code)
    const hasLanguage = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'entity_aliases' 
      AND column_name = 'language'
    `);

    if (hasLanguage.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "entity_aliases" 
        ADD COLUMN "language" varchar(10) NULL
      `);

      // Create index for language-based queries
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_entity_aliases_language" 
        ON "entity_aliases" ("language")
      `);
    }

    // Add script column (ISO 15924 script code)
    const hasScript = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'entity_aliases' 
      AND column_name = 'script'
    `);

    if (hasScript.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "entity_aliases" 
        ADD COLUMN "script" varchar(10) NULL
      `);
    }

    // Add type column (abbreviation, translation, local_name, brand_name)
    const hasType = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'entity_aliases' 
      AND column_name = 'type'
    `);

    if (hasType.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "entity_aliases" 
        ADD COLUMN "type" varchar(20) NULL
      `);

      // Create index for type-based queries
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_entity_aliases_type" 
        ON "entity_aliases" ("type")
      `);
    }

    // Create composite index for language + script queries (useful for multilingual search)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_entity_aliases_language_script" 
      ON "entity_aliases" ("language", "script")
      WHERE "language" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_entity_aliases_language_script"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_entity_aliases_type"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_entity_aliases_language"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_graph_entities_entity_id"
    `);

    // Drop columns from entity_aliases
    await queryRunner.query(`
      ALTER TABLE "entity_aliases" 
      DROP COLUMN IF EXISTS "type"
    `);

    await queryRunner.query(`
      ALTER TABLE "entity_aliases" 
      DROP COLUMN IF EXISTS "script"
    `);

    await queryRunner.query(`
      ALTER TABLE "entity_aliases" 
      DROP COLUMN IF EXISTS "language"
    `);

    // Drop columns from graph_entities
    await queryRunner.query(`
      ALTER TABLE "graph_entities" 
      DROP COLUMN IF EXISTS "provenance"
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_entities" 
      DROP COLUMN IF EXISTS "equivalent_entities"
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_entities" 
      DROP COLUMN IF EXISTS "entity_id"
    `);
  }
}
