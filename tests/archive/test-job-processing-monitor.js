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

async function getTestDocument() {
  console.log("\n🔍 Finding test document...");

  const result = await client.query(
    `SELECT d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata,
            COUNT(ds.id) as segment_count
     FROM documents d
     LEFT JOIN document_segments ds ON d.id = ds.document_id
     WHERE d.dataset_id = $1 AND d.indexing_status != 'completed'
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

async function checkInitialState() {
  console.log("\n📊 Checking initial state...");

  // Check graph data
  const nodeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
    [DATASET_ID]
  );
  const initialNodes = parseInt(nodeResult.rows[0].count);

  const edgeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
    [DATASET_ID]
  );
  const initialEdges = parseInt(edgeResult.rows[0].count);

  console.log(`📈 Initial nodes: ${initialNodes}`);
  console.log(`🔗 Initial edges: ${initialEdges}`);

  // Check queue jobs
  const queueResult = await client.query(
    "SELECT COUNT(*) as count FROM bull_jobs"
  );
  const initialJobs = parseInt(queueResult.rows[0].count);
  console.log(`📋 Initial queue jobs: ${initialJobs}`);

  return { initialNodes, initialEdges, initialJobs };
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

async function monitorJobProcessing(documentId, maxWaitTime = 120000) {
  console.log("\n⏳ Monitoring job processing...");

  const startTime = Date.now();
  let lastStatus = null;
  let lastMetadata = null;
  let lastNodes = 0;
  let lastEdges = 0;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check document status
      const docResult = await client.query(
        `SELECT indexing_status, processing_metadata, processing_started_at, 
                completed_at, error, updated_at
         FROM documents WHERE id = $1`,
        [documentId]
      );

      if (docResult.rows.length > 0) {
        const doc = docResult.rows[0];
        const status = doc.indexing_status;
        const metadata = doc.processing_metadata;

        // Check graph data
        const nodeResult = await client.query(
          "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
          [DATASET_ID]
        );
        const currentNodes = parseInt(nodeResult.rows[0].count);

        const edgeResult = await client.query(
          "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
          [DATASET_ID]
        );
        const currentEdges = parseInt(edgeResult.rows[0].count);

        // Check queue jobs
        const queueResult = await client.query(
          "SELECT COUNT(*) as count FROM bull_jobs"
        );
        const currentJobs = parseInt(queueResult.rows[0].count);

        // Log changes
        if (
          status !== lastStatus ||
          JSON.stringify(metadata) !== JSON.stringify(lastMetadata) ||
          currentNodes !== lastNodes ||
          currentEdges !== lastEdges ||
          currentJobs !== lastNodes
        ) {
          console.log(
            `\n📊 Status Update at ${new Date().toLocaleTimeString()}:`
          );
          console.log(`   Document Status: ${status}`);
          console.log(
            `   Graph Nodes: ${currentNodes} (+${currentNodes - lastNodes})`
          );
          console.log(
            `   Graph Edges: ${currentEdges} (+${currentEdges - lastEdges})`
          );
          console.log(`   Queue Jobs: ${currentJobs}`);

          if (metadata) {
            console.log(
              `   Processing Metadata:`,
              JSON.stringify(metadata, null, 4)
            );
          }

          if (doc.processing_started_at) {
            console.log(`   Processing Started: ${doc.processing_started_at}`);
          }
          if (doc.completed_at) {
            console.log(`   Completed: ${doc.completed_at}`);
          }
          if (doc.error) {
            console.log(`   Error: ${doc.error}`);
          }

          lastStatus = status;
          lastMetadata = metadata;
          lastNodes = currentNodes;
          lastEdges = currentEdges;
        }

        if (status === "completed") {
          console.log("\n✅ Job completed successfully!");
          return {
            completed: true,
            finalNodes: currentNodes,
            finalEdges: currentEdges,
          };
        } else if (status === "error" || status === "failed") {
          console.log("\n❌ Job failed!");
          return { completed: false, error: doc.error };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error("Error monitoring job:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("\n⏰ Timeout waiting for job completion");
  return { completed: false, timeout: true };
}

async function checkQueueJobs() {
  console.log("\n🔍 Checking queue jobs...");

  try {
    const result = await client.query(`
      SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on, data
      FROM bull_jobs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    if (result.rows.length > 0) {
      console.log("📋 Queue jobs:");
      result.rows.forEach((job, i) => {
        console.log(`  ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`);
        console.log(
          `     Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
        );
        console.log(`     Created: ${job.created_at}`);
        if (job.processed_on)
          console.log(`     Started: ${new Date(job.processed_on)}`);
        if (job.finished_on)
          console.log(`     Finished: ${new Date(job.finished_on)}`);
        if (job.data)
          console.log(`     Data: ${JSON.stringify(job.data, null, 4)}`);
      });
    } else {
      console.log("⚠️  No jobs found in queue");
    }

    return result.rows.length;
  } catch (error) {
    console.error("❌ Error checking queue jobs:", error.message);
    return 0;
  }
}

async function analyzeResults(initial, final) {
  console.log("\n🔍 Analyzing results...");

  const nodesCreated = final.finalNodes - initial.initialNodes;
  const edgesCreated = final.finalEdges - initial.initialEdges;

  console.log(`📈 Nodes created: ${nodesCreated}`);
  console.log(`🔗 Edges created: ${edgesCreated}`);

  if (nodesCreated > 0 || edgesCreated > 0) {
    console.log("✅ Graph extraction was successful!");

    // Show sample results
    const sampleNodes = await client.query(
      `SELECT label, node_type, properties, created_at
       FROM graph_nodes 
       WHERE dataset_id = $1 
       ORDER BY created_at DESC 
       LIMIT 3`,
      [DATASET_ID]
    );

    console.log("\n📋 Sample nodes created:");
    sampleNodes.rows.forEach((node, i) => {
      console.log(`  ${i + 1}. ${node.label} (${node.node_type})`);
      console.log(`     Created: ${node.created_at}`);
      if (node.properties) {
        const props =
          typeof node.properties === "string"
            ? JSON.parse(node.properties)
            : node.properties;
        console.log(`     Properties: ${JSON.stringify(props, null, 4)}`);
      }
    });
  } else {
    console.log("⚠️  No graph data was created");
  }
}

async function testJobProcessingMonitor() {
  try {
    console.log("🧪 Job Processing Monitor Test");
    console.log("=".repeat(60));

    await connectDatabase();

    // Get test document
    const document = await getTestDocument();

    // Check initial state
    const initial = await checkInitialState();

    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Job Processing with Real-time Monitoring");
    console.log("=".repeat(60));

    // Trigger graph extraction
    const extractionResult = await triggerGraphExtraction(document.id);

    // Monitor job processing
    const result = await monitorJobProcessing(document.id);

    // Check final queue jobs
    await checkQueueJobs();

    // Analyze results
    if (result.completed) {
      await analyzeResults(initial, result);
    } else {
      console.log("\n❌ Job did not complete successfully");
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      if (result.timeout) {
        console.log("Job timed out");
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Job processing monitor test completed!");
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
  testJobProcessingMonitor().catch(console.error);
}

module.exports = { testJobProcessingMonitor };
