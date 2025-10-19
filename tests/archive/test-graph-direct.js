const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

const DATASET_ID = "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b";

async function testGraphSystemDirect() {
  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Check existing graph data
    console.log("\n📊 Checking existing graph data...");

    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const nodeCount = parseInt(nodeResult.rows[0].count);
    console.log(`📈 Graph nodes for dataset: ${nodeCount}`);

    const edgeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const edgeCount = parseInt(edgeResult.rows[0].count);
    console.log(`🔗 Graph edges for dataset: ${edgeCount}`);

    // Check documents
    const docResult = await client.query(
      "SELECT id, name, indexing_status FROM documents WHERE dataset_id = $1",
      [DATASET_ID]
    );
    console.log(`📄 Documents in dataset: ${docResult.rows.length}`);
    docResult.rows.forEach((doc) => {
      console.log(
        `  - ${doc.name} (${doc.id}) - Status: ${doc.indexing_status}`
      );
    });

    // Check document segments
    const segmentResult = await client.query(
      `
      SELECT COUNT(*) as count 
      FROM document_segments ds
      JOIN documents d ON ds.document_id = d.id
      WHERE d.dataset_id = $1
    `,
      [DATASET_ID]
    );
    const segmentCount = parseInt(segmentResult.rows[0].count);
    console.log(`📝 Document segments: ${segmentCount}`);

    // Check AI providers
    console.log("\n🤖 Checking AI providers...");
    const providerResult = await client.query(
      "SELECT id, name, type FROM ai_providers WHERE name ILIKE '%crumplete%'"
    );
    console.log(`📋 Crumplete AI providers: ${providerResult.rows.length}`);
    providerResult.rows.forEach((provider) => {
      console.log(
        `  - ${provider.name} (${provider.id}) - Type: ${provider.type}`
      );
    });

    // Check prompts
    console.log("\n📝 Checking prompts...");
    const promptResult = await client.query(
      "SELECT id, name, is_active FROM prompts WHERE name ILIKE '%graph%' OR name ILIKE '%social%'"
    );
    console.log(`📋 Graph-related prompts: ${promptResult.rows.length}`);
    promptResult.rows.forEach((prompt) => {
      console.log(
        `  - ${prompt.name} (${prompt.id}) - Active: ${prompt.is_active}`
      );
    });

    // Check if there are any recent graph extraction jobs
    console.log("\n🔍 Checking recent graph extraction activity...");
    const jobResult = await client
      .query(
        `
      SELECT 
        j.id,
        j.name,
        j.data,
        j.processedOn,
        j.finishedOn,
        j.failedReason
      FROM bull_jobs j
      WHERE j.name = 'graph-extraction'
      ORDER BY j.createdOn DESC
      LIMIT 5
    `
      )
      .catch(() => ({ rows: [] })); // Handle case where table doesn't exist
    console.log(`📋 Recent graph extraction jobs: ${jobResult.rows.length}`);
    jobResult.rows.forEach((job) => {
      console.log(`  - Job ${job.id}: ${job.name}`);
      console.log(`    - Created: ${job.createdOn}`);
      console.log(`    - Processed: ${job.processedOn || "Not processed"}`);
      console.log(`    - Finished: ${job.finishedOn || "Not finished"}`);
      console.log(`    - Failed: ${job.failedReason || "No failure"}`);
      if (job.data) {
        const data =
          typeof job.data === "string" ? JSON.parse(job.data) : job.data;
        console.log(`    - Document ID: ${data.documentId}`);
        console.log(`    - Dataset ID: ${data.datasetId}`);
        console.log(
          `    - AI Provider: ${data.extractionConfig?.aiProviderId}`
        );
        console.log(`    - Model: ${data.extractionConfig?.model}`);
      }
    });

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 DIRECT TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Dataset ID: ${DATASET_ID}`);
    console.log(`📈 Existing nodes: ${nodeCount}`);
    console.log(`🔗 Existing edges: ${edgeCount}`);
    console.log(`📄 Documents: ${docResult.rows.length}`);
    console.log(`📝 Segments: ${segmentCount}`);
    console.log(`🤖 Crumplete AI providers: ${providerResult.rows.length}`);
    console.log(`📝 Graph prompts: ${promptResult.rows.length}`);
    console.log(`🔍 Recent jobs: ${jobResult.rows.length}`);

    if (nodeCount > 0 || edgeCount > 0) {
      console.log("\n🎉 SUCCESS: Graph data exists in the database!");
    } else {
      console.log("\n⚠️ WARNING: No graph data found in database");
    }
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the test
testGraphSystemDirect();
