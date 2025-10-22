import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintToPredefinedEntities1734567895000
  implements MigrationInterface
{
  name = 'AddUniqueConstraintToPredefinedEntities1734567895000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, remove any existing duplicates before adding the constraint
    await queryRunner.query(`
      DELETE FROM predefined_entities 
      WHERE id NOT IN (
        SELECT MIN(id::text)::uuid 
        FROM predefined_entities 
        GROUP BY dataset_id, canonical_name, entity_type
      )
    `);

    // Add unique constraint to prevent duplicates
    await queryRunner.query(`
      ALTER TABLE predefined_entities 
      ADD CONSTRAINT unique_entity_per_dataset 
      UNIQUE (dataset_id, canonical_name, entity_type)
    `);

    // Add index for better performance on lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_predefined_entities_lookup 
      ON predefined_entities (dataset_id, canonical_name, entity_type)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the unique constraint
    await queryRunner.query(`
      ALTER TABLE predefined_entities 
      DROP CONSTRAINT IF EXISTS unique_entity_per_dataset
    `);

    // Remove the index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_predefined_entities_lookup
    `);
  }
}
