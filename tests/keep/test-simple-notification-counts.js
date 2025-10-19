const { Client } = require("pg");
const { spawn } = require("child_process");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function testSimpleNotificationCounts() {
  console.log("🚀 Testing Simple Notification Job Counts...\n");

  await client.connect();

  // 1. Start monitoring job counts
  console.log("📊 Starting job count monitor...");

  let monitorCount = 0;
  const monitor = setInterval(async () => {
    try {
      monitorCount++;

      // Get job counts
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

      // Stop after 20 seconds
      if (monitorCount >= 10) {
        console.log("\n⏰ Monitoring complete");
        clearInterval(monitor);
        await client.end();
        return;
      }
    } catch (error) {
      console.error("❌ Monitor error:", error.message);
    }
  }, 2000);

  // 2. Test notification endpoint
  console.log("📡 Testing notification endpoint...");

  const curl = spawn(
    "curl",
    ["-N", "http://localhost:3001/notifications/stream"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  curl.stdout.on("data", (data) => {
    const message = data.toString();
    console.log(`📨 Notification: ${message.trim()}`);
  });

  curl.stderr.on("data", (data) => {
    console.log(`📨 Notification Error: ${data.toString()}`);
  });

  // 3. Trigger graph extraction after 2 seconds
  setTimeout(async () => {
    console.log("\n🎯 Triggering graph extraction...");

    try {
      // Update document status to trigger processing
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

      console.log("✅ Graph extraction triggered");

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(async () => {
        progress += 10;

        await client.query(
          `
          UPDATE documents 
          SET processing_metadata = $1
          WHERE dataset_id = $2 AND name LIKE '%Threads%'
        `,
          [
            JSON.stringify({
              graphExtraction: {
                enabled: true,
                startedAt: new Date().toISOString(),
                segmentsProcessed: Math.floor((459 * progress) / 100),
                totalSegments: 459,
                nodesCreated: Math.floor((190 * progress) / 100),
                edgesCreated: Math.floor((167 * progress) / 100),
              },
            }),
            "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b",
          ]
        );

        if (progress >= 100) {
          clearInterval(progressInterval);

          // Mark as completed
          await client.query(
            `
            UPDATE documents 
            SET indexing_status = 'completed',
                processing_metadata = $1
            WHERE dataset_id = $2 AND name LIKE '%Threads%'
          `,
            [
              JSON.stringify({
                graphExtraction: {
                  enabled: true,
                  startedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  segmentsProcessed: 459,
                  totalSegments: 459,
                  nodesCreated: 190,
                  edgesCreated: 167,
                },
              }),
              "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b",
            ]
          );
        }
      }, 1000);
    } catch (error) {
      console.error("❌ Failed to trigger extraction:", error.message);
    }
  }, 2000);

  // 4. Clean up after 25 seconds
  setTimeout(() => {
    curl.kill();
    clearInterval(monitor);
    client.end();
  }, 25000);
}

testSimpleNotificationCounts().catch(console.error);
