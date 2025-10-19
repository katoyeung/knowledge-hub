import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOllamaTypeToAiProviders1734567892000
  implements MigrationInterface
{
  name = 'AddOllamaTypeToAiProviders1734567892000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if 'ollama' already exists in the enum
    const enumValues = await queryRunner.query(`
      SELECT unnest(enum_range(NULL::ai_providers_type_enum)) as value
    `);

    const hasOllama = enumValues.some((row: any) => row.value === 'ollama');

    if (hasOllama) {
      console.log('✅ Enum value "ollama" already exists, skipping...');
    } else {
      // Add 'ollama' to the enum values for the type column
      await queryRunner.query(`
        ALTER TYPE "ai_providers_type_enum" ADD VALUE 'ollama'
      `);
      console.log('✅ Added "ollama" to enum values');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For now, we'll leave the enum value in place
    console.log(
      '⚠️ Cannot remove enum value "ollama" - manual cleanup required if needed',
    );
  }
}
