import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGraphTables1734567890000 implements MigrationInterface {
  name = 'CreateGraphTables1734567890000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create graph_nodes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "graph_nodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dataset_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "segment_id" uuid,
        "node_type" varchar(50) NOT NULL,
        "label" varchar(255) NOT NULL,
        "properties" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_graph_nodes" PRIMARY KEY ("id")
      )
    `);

    // Create graph_edges table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "graph_edges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dataset_id" uuid NOT NULL,
        "source_node_id" uuid NOT NULL,
        "target_node_id" uuid NOT NULL,
        "edge_type" varchar(50) NOT NULL,
        "weight" decimal(10,4) DEFAULT 1.0,
        "properties" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_graph_edges" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "graph_nodes" 
      ADD CONSTRAINT "FK_graph_nodes_dataset" 
      FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_nodes" 
      ADD CONSTRAINT "FK_graph_nodes_document" 
      FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_nodes" 
      ADD CONSTRAINT "FK_graph_nodes_segment" 
      FOREIGN KEY ("segment_id") REFERENCES "document_segments"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_nodes" 
      ADD CONSTRAINT "FK_graph_nodes_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_edges" 
      ADD CONSTRAINT "FK_graph_edges_dataset" 
      FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_edges" 
      ADD CONSTRAINT "FK_graph_edges_source_node" 
      FOREIGN KEY ("source_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_edges" 
      ADD CONSTRAINT "FK_graph_edges_target_node" 
      FOREIGN KEY ("target_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "graph_edges" 
      ADD CONSTRAINT "FK_graph_edges_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_dataset_id" ON "graph_nodes" ("dataset_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_document_id" ON "graph_nodes" ("document_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_node_type" ON "graph_nodes" ("node_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_label" ON "graph_nodes" ("label")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_user_id" ON "graph_nodes" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_dataset_id" ON "graph_edges" ("dataset_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_source_node_id" ON "graph_edges" ("source_node_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_target_node_id" ON "graph_edges" ("target_node_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_edge_type" ON "graph_edges" ("edge_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_user_id" ON "graph_edges" ("user_id")
    `);

    // Create composite unique index to prevent duplicate edges
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_graph_edges_unique" 
      ON "graph_edges" ("source_node_id", "target_node_id", "edge_type")
    `);

    // Create GIN index for JSONB properties
    await queryRunner.query(`
      CREATE INDEX "IDX_graph_nodes_properties" ON "graph_nodes" USING GIN ("properties")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_graph_edges_properties" ON "graph_edges" USING GIN ("properties")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_properties"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_properties"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_unique"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_edge_type"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_target_node_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_source_node_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_edges_dataset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_label"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_node_type"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_document_id"`);
    await queryRunner.query(`DROP INDEX "IDX_graph_nodes_dataset_id"`);

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "graph_edges" DROP CONSTRAINT "FK_graph_edges_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_edges" DROP CONSTRAINT "FK_graph_edges_target_node"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_edges" DROP CONSTRAINT "FK_graph_edges_source_node"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_edges" DROP CONSTRAINT "FK_graph_edges_dataset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_nodes" DROP CONSTRAINT "FK_graph_nodes_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_nodes" DROP CONSTRAINT "FK_graph_nodes_segment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_nodes" DROP CONSTRAINT "FK_graph_nodes_document"`,
    );
    await queryRunner.query(
      `ALTER TABLE "graph_nodes" DROP CONSTRAINT "FK_graph_nodes_dataset"`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE "graph_edges"`);
    await queryRunner.query(`DROP TABLE "graph_nodes"`);
  }
}
