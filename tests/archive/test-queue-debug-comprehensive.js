const axios = require("axios");
const { Client } = require("pg");

const API_BASE = "http://localhost:3001";
const DATASET_ID = "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b";
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwNTk0OTY5LCJleHAiOjE3NjMxODY5Njl9.S8K2K19GGW-d6la4JmZ-t7FxDpfuouxiW4KCL_3FmDk";

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

async function connectDatabase() {
  try {
    await client.connect();
    console.log("✅ Connected to database");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    throw error;
  }
}

async function checkBackendHealth() {
  console.log("\n🔍 Checking backend health...");

  try {
    const response = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    console.log("✅ Backend is running:", response.status);
    return true;
  } catch (error) {
    console.error("❌ Backend is not running:", error.message);
    return false;
  }
}

async function getTestDocument() {
  console.log("\n🔍 Finding test document...");

  const result = await client.query(
    `SELECT d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata,
            COUNT(ds.id) as segment_count
     FROM documents d
     LEFT JOIN document_segments ds ON d.id = ds.document_id
     WHERE d.dataset_id = $1
     GROUP BY d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata
     HAVING COUNT(ds.id) > 0
     ORDER BY segment_count DESC
     LIMIT 1`,
    [DATASET_ID]
  );

  if (result.rows.length === 0) {
    throw new Error("No documents with segments found");
  }

  const document = result.rows[0];
  console.log(`📄 Document: ${document.name} (${document.id})`);
  console.log(`📊 Segments: ${document.segment_count}`);
  console.log(`📈 Status: ${document.indexing_status}`);
  console.log(
    `📋 Processing Metadata:`,
    JSON.stringify(document.processing_metadata, null, 2)
  );

  return document;
}

async function checkQueueJobs() {
  console.log("\n🔍 Checking queue jobs in database...");

  try {
    // Check if there are any jobs in the queue
    const queueResult = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs WHERE status = 'waiting' OR status = 'active'"
    );
    const waitingJobs = parseInt(queueResult.rows[0].count);
    console.log(`📊 Jobs in queue: ${waitingJobs}`);

    if (waitingJobs > 0) {
      const jobsResult = await client.query(
        `SELECT id, name, data, status, progress, attempts_made, created_at, processed_on, finished_on
         FROM bull_jobs 
         WHERE status = 'waiting' OR status = 'active'
         ORDER BY created_at DESC
         LIMIT 5`
      );

      console.log("📋 Recent queue jobs:");
      jobsResult.rows.forEach((job, i) => {
        console.log(`  ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`);
        console.log(
          `     Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
        );
        console.log(`     Created: ${job.created_at}`);
        if (job.processed_on) console.log(`     Started: ${job.processed_on}`);
        if (job.finished_on) console.log(`     Finished: ${job.finished_on}`);
        console.log(`     Data: ${JSON.stringify(job.data, null, 6)}`);
      });
    }

    return waitingJobs;
  } catch (error) {
    console.log(
      "⚠️  Could not check queue jobs (table might not exist):",
      error.message
    );
    return 0;
  }
}

async function checkRedisConnection() {
  console.log("\n🔍 Checking Redis connection...");

  try {
    const response = await axios.get(`${API_BASE}/api/queue/status`, {
      headers,
    });
    console.log("✅ Redis connection status:", response.data);
    return true;
  } catch (error) {
    console.error(
      "❌ Redis connection failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function checkJobRegistry() {
  console.log("\n🔍 Checking job registry...");

  try {
    const response = await axios.get(`${API_BASE}/api/queue/jobs`, { headers });
    console.log("✅ Registered jobs:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Could not get job registry:",
      error.response?.data || error.message
    );
    return null;
  }
}

async function triggerGraphExtraction(documentId) {
  console.log("\n🚀 Triggering graph extraction...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      {
        syncMode: false,
      },
      { headers, timeout: 30000 }
    );

    console.log("✅ Graph extraction triggered");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Graph extraction failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorDocumentStatus(documentId, maxWaitTime = 60000) {
  console.log("\n⏳ Monitoring document status...");

  const startTime = Date.now();
  let lastStatus = null;
  let lastMetadata = null;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await client.query(
        `SELECT indexing_status, processing_metadata, processing_started_at, 
                completed_at, error, updated_at
         FROM documents WHERE id = $1`,
        [documentId]
      );

      if (result.rows.length > 0) {
        const doc = result.rows[0];
        const status = doc.indexing_status;
        const metadata = doc.processing_metadata;

        if (
          status !== lastStatus ||
          JSON.stringify(metadata) !== JSON.stringify(lastMetadata)
        ) {
          console.log(`📊 Document status: ${status}`);
          console.log(
            `📋 Processing metadata:`,
            JSON.stringify(metadata, null, 2)
          );
          console.log(`⏰ Updated at: ${doc.updated_at}`);

          if (doc.processing_started_at) {
            console.log(`🚀 Processing started: ${doc.processing_started_at}`);
          }
          if (doc.completed_at) {
            console.log(`✅ Completed at: ${doc.completed_at}`);
          }
          if (doc.error) {
            console.log(`❌ Error: ${doc.error}`);
          }

          lastStatus = status;
          lastMetadata = metadata;
        }

        if (status === "completed") {
          console.log("✅ Job completed successfully!");
          return true;
        } else if (status === "error" || status === "failed") {
          console.log("❌ Job failed!");
          return false;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Error monitoring document:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("⏰ Timeout waiting for job completion");
  return false;
}

async function checkGraphData() {
  console.log("\n📊 Checking graph data...");

  const nodeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
    [DATASET_ID]
  );
  const nodeCount = parseInt(nodeResult.rows[0].count);

  const edgeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
    [DATASET_ID]
  );
  const edgeCount = parseInt(edgeResult.rows[0].count);

  console.log(`📈 Nodes: ${nodeCount}`);
  console.log(`🔗 Edges: ${edgeCount}`);

  return { nodeCount, edgeCount };
}

async function checkBackendLogs() {
  console.log("\n🔍 Checking backend logs...");

  try {
    const response = await axios.get(`${API_BASE}/api/queue/logs`, { headers });
    console.log("📋 Recent queue logs:", response.data);
  } catch (error) {
    console.log(
      "⚠️  Could not get logs:",
      error.response?.data || error.message
    );
  }
}

async function testQueueDebugComprehensive() {
  try {
    console.log("🐛 Comprehensive Queue Debug Test");
    console.log("=".repeat(60));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Check Redis connection
    await checkRedisConnection();

    // Check job registry
    await checkJobRegistry();

    // Check existing queue jobs
    await checkQueueJobs();

    // Get test document
    const document = await getTestDocument();

    // Check initial graph data
    const initialGraphData = await checkGraphData();

    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Queue Job Processing");
    console.log("=".repeat(60));

    // Trigger graph extraction
    const extractionResult = await triggerGraphExtraction(document.id);

    // Check queue jobs after triggering
    console.log("\n🔍 Checking queue jobs after triggering...");
    await checkQueueJobs();

    // Monitor document status
    const jobCompleted = await monitorDocumentStatus(document.id);

    // Check final graph data
    const finalGraphData = await checkGraphData();

    console.log("\n" + "=".repeat(60));
    console.log("📊 RESULTS SUMMARY");
    console.log("=".repeat(60));
    console.log(`📄 Document: ${document.name}`);
    console.log(`📈 Initial nodes: ${initialGraphData.nodeCount}`);
    console.log(`🔗 Initial edges: ${initialGraphData.edgeCount}`);
    console.log(`📈 Final nodes: ${finalGraphData.nodeCount}`);
    console.log(`🔗 Final edges: ${finalGraphData.edgeCount}`);
    console.log(
      `📈 Nodes created: ${finalGraphData.nodeCount - initialGraphData.nodeCount}`
    );
    console.log(
      `🔗 Edges created: ${finalGraphData.edgeCount - initialGraphData.edgeCount}`
    );
    console.log(`✅ Job completed: ${jobCompleted}`);

    // Check backend logs
    await checkBackendLogs();

    console.log("\n" + "=".repeat(60));
    console.log("✅ Comprehensive queue debug test completed!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the test
if (require.main === module) {
  testQueueDebugComprehensive().catch(console.error);
}

module.exports = { testQueueDebugComprehensive };
