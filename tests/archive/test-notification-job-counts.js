const { Client } = require("pg");
const axios = require("axios");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function testNotificationJobCounts() {
  console.log("🚀 Testing Notification System with Job Counts...\n");

  await client.connect();

  // 1. Connect to notification stream
  console.log("📡 Connecting to notification stream...");

  const EventSource = require("eventsource");
  const eventSource = new EventSource(
    "http://localhost:3001/notifications/stream"
  );

  eventSource.onopen = () => {
    console.log("✅ Connected to notification stream");
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log(`📨 Notification: ${data.type}`);

      if (data.type === "DOCUMENT_PROCESSING_UPDATE") {
        console.log(`   Document: ${data.data.documentId}`);
        console.log(`   Status: ${data.data.status}`);
        if (data.data.progress) {
          console.log(`   Progress: ${data.data.progress}%`);
        }
        if (data.data.segmentsProcessed) {
          console.log(
            `   Segments: ${data.data.segmentsProcessed}/${data.data.totalSegments}`
          );
        }
      }
    } catch (error) {
      console.log(`📨 Raw notification: ${event.data}`);
    }
  };

  eventSource.onerror = (error) => {
    console.error("❌ Notification stream error:", error);
  };

  // 2. Wait a moment for connection
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 3. Trigger graph extraction via API
  console.log("\n🎯 Triggering graph extraction...");

  try {
    // First, let's try to get a token or use a test endpoint
    const response = await axios.post(
      "http://localhost:3001/api/graph/datasets/f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b/extract",
      {
        extractionConfig: {
          maxNodes: 10,
          maxEdges: 20,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          // Add auth header if needed
          Authorization: "Bearer test-token",
        },
        timeout: 10000,
      }
    );

    console.log("✅ Graph extraction triggered:", response.data);
  } catch (error) {
    console.log("❌ API call failed:", error.response?.data || error.message);

    // Fallback: trigger via database
    console.log("🔄 Fallback: Triggering via database...");
    await client.query(
      `
      UPDATE documents 
      SET indexing_status = 'graph_extraction_processing',
          processing_metadata = $1
      WHERE dataset_id = $2 AND name LIKE '%Threads%'
    `,
      [
        JSON.stringify({
          graphExtraction: {
            enabled: true,
            startedAt: new Date().toISOString(),
            segmentsProcessed: 0,
            totalSegments: 459,
          },
        }),
        "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b",
      ]
    );

    console.log("✅ Database trigger completed");
  }

  // 4. Monitor for 30 seconds
  console.log("\n⏱️  Monitoring for 30 seconds...");

  let monitorCount = 0;
  const monitor = setInterval(async () => {
    try {
      monitorCount++;

      // Check job counts
      const jobStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM bull_jobs
      `);

      // Check document status
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

      // Stop after 30 seconds
      if (monitorCount >= 15) {
        console.log("\n⏰ Monitoring complete");
        clearInterval(monitor);
        eventSource.close();
        await client.end();
        return;
      }
    } catch (error) {
      console.error("❌ Monitor error:", error.message);
    }
  }, 2000);
}

testNotificationJobCounts().catch(console.error);
