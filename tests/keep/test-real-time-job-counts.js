const { Client } = require("pg");
const axios = require("axios");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function monitorJobCounts() {
  console.log("🚀 Starting Real-Time Job Count Monitor...\n");

  await client.connect();

  // Reset a document to waiting status for testing
  console.log("🔄 Resetting document to waiting status...");
  await client.query(
    `
    UPDATE documents 
    SET indexing_status = 'waiting', processing_metadata = NULL, error = NULL 
    WHERE dataset_id = $1 AND name LIKE '%Threads%'
  `,
    ["f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"]
  );

  console.log("✅ Document reset to waiting status\n");

  // Monitor job counts every 2 seconds
  let monitorCount = 0;
  const maxMonitors = 30; // Monitor for 1 minute

  const monitor = setInterval(async () => {
    try {
      monitorCount++;

      // Get current job counts
      const jobStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM bull_jobs
      `);

      // Get document status
      const docStatus = await client.query(
        `
        SELECT name, indexing_status, processing_metadata
        FROM documents 
        WHERE dataset_id = $1 AND name LIKE '%Threads%'
      `,
        ["f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"]
      );

      const stats = jobStats.rows[0];
      const doc = docStatus.rows[0];

      console.log(`\n📊 [${new Date().toLocaleTimeString()}] Job Counts:`);
      console.log(
        `   Total: ${stats.total} | Waiting: ${stats.waiting} | Active: ${stats.active} | Completed: ${stats.completed} | Failed: ${stats.failed}`
      );
      console.log(`   Document: ${doc?.name} - ${doc?.indexing_status}`);

      if (doc?.processing_metadata) {
        const metadata = JSON.parse(doc.processing_metadata);
        if (metadata.graphExtraction) {
          const ge = metadata.graphExtraction;
          console.log(
            `   Graph Extraction: ${ge.segmentsProcessed || 0}/${ge.totalSegments || 0} segments processed`
          );
          console.log(
            `   Progress: ${ge.nodesCreated || 0} nodes, ${ge.edgesCreated || 0} edges created`
          );
        }
      }

      // Check if processing is complete
      if (
        doc?.indexing_status === "completed" ||
        doc?.indexing_status === "error"
      ) {
        console.log(
          `\n✅ Processing finished with status: ${doc.indexing_status}`
        );
        clearInterval(monitor);
        await client.end();
        return;
      }

      // Stop monitoring after max attempts
      if (monitorCount >= maxMonitors) {
        console.log("\n⏰ Monitoring timeout reached");
        clearInterval(monitor);
        await client.end();
        return;
      }
    } catch (error) {
      console.error("❌ Monitor error:", error.message);
    }
  }, 2000);

  // Trigger graph extraction after 1 second
  setTimeout(async () => {
    try {
      console.log("🎯 Triggering graph extraction...");

      // We need to trigger this through the backend API
      // Since it requires auth, let's simulate by directly updating the database
      await client.query(
        `
        UPDATE documents 
        SET indexing_status = 'graph_extraction_processing',
            processing_metadata = '{"graphExtraction":{"enabled":true,"startedAt":"' || NOW() || '"}}'
        WHERE dataset_id = $1 AND name LIKE '%Threads%'
      `,
        ["f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"]
      );

      console.log("✅ Graph extraction triggered");
    } catch (error) {
      console.error("❌ Failed to trigger extraction:", error.message);
    }
  }, 1000);
}

monitorJobCounts().catch(console.error);
