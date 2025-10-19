import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGraphSettingsToUserAndDataset1734567893000
  implements MigrationInterface
{
  name = 'AddGraphSettingsToUserAndDataset1734567893000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add graph_settings to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "settings" 
      SET DEFAULT '{"graph_settings": {}}'::jsonb
    `);

    // Update existing users to have empty graph_settings
    await queryRunner.query(`
      UPDATE "users" 
      SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"graph_settings": {}}'::jsonb
      WHERE "settings" IS NULL OR NOT ("settings" ? 'graph_settings')
    `);

    // Migrate existing graphExtractionConfig to graph_settings in datasets
    await queryRunner.query(`
      UPDATE "datasets" 
      SET "settings" = COALESCE("settings", '{}'::jsonb) || 
        CASE 
          WHEN "settings" ? 'graphExtractionConfig' THEN
            jsonb_build_object(
              'graph_settings', 
              jsonb_build_object(
                'aiProviderId', ("settings"->>'graphExtractionConfig')::jsonb->>'aiProviderId',
                'model', ("settings"->>'graphExtractionConfig')::jsonb->>'model',
                'promptId', ("settings"->>'graphExtractionConfig')::jsonb->>'promptId',
                'temperature', ("settings"->>'graphExtractionConfig')::jsonb->>'temperature'
              )
            )
          ELSE
            '{"graph_settings": {}}'::jsonb
        END
      WHERE "settings" IS NULL OR NOT ("settings" ? 'graph_settings')
    `);

    // Remove old graphExtractionConfig from datasets
    await queryRunner.query(`
      UPDATE "datasets" 
      SET "settings" = "settings" - 'graphExtractionConfig'
      WHERE "settings" ? 'graphExtractionConfig'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migrate graph_settings back to graphExtractionConfig in datasets
    await queryRunner.query(`
      UPDATE "datasets" 
      SET "settings" = COALESCE("settings", '{}'::jsonb) || 
        CASE 
          WHEN "settings" ? 'graph_settings' THEN
            jsonb_build_object(
              'graphExtractionConfig', 
              jsonb_build_object(
                'aiProviderId', ("settings"->>'graph_settings')::jsonb->>'aiProviderId',
                'model', ("settings"->>'graph_settings')::jsonb->>'model',
                'promptId', ("settings"->>'graph_settings')::jsonb->>'promptId',
                'temperature', ("settings"->>'graph_settings')::jsonb->>'temperature'
              )
            )
          ELSE
            '{}'::jsonb
        END
      WHERE "settings" ? 'graph_settings'
    `);

    // Remove graph_settings from datasets
    await queryRunner.query(`
      UPDATE "datasets" 
      SET "settings" = "settings" - 'graph_settings'
      WHERE "settings" ? 'graph_settings'
    `);

    // Remove graph_settings from users
    await queryRunner.query(`
      UPDATE "users" 
      SET "settings" = "settings" - 'graph_settings'
      WHERE "settings" ? 'graph_settings'
    `);

    // Reset users settings default
    await queryRunner.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "settings" 
      SET DEFAULT '{}'::jsonb
    `);
  }
}

