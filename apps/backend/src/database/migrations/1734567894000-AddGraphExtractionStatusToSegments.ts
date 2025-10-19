import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGraphExtractionStatusToSegments1734567894000
  implements MigrationInterface
{
  name = 'AddGraphExtractionStatusToSegments1734567894000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_segments" 
      ADD COLUMN "graph_extraction_status" varchar(255) NOT NULL DEFAULT 'waiting'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_segments" 
      DROP COLUMN "graph_extraction_status"
    `);
  }
}
