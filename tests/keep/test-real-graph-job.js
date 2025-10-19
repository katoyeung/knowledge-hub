const axios = require("axios");
const { Client } = require("pg");
const { spawn } = require("child_process");
const path = require("path");

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

let backendProcess = null;

async function connectDatabase() {
  try {
    await client.connect();
    console.log("✅ Connected to database");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    throw error;
  }
}

async function startBackend() {
  console.log("🚀 Starting backend server...");

  return new Promise((resolve, reject) => {
    const backendPath = path.join(__dirname, "apps", "backend");

    backendProcess = spawn("npm", ["run", "start:dev"], {
      cwd: backendPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    });

    let resolved = false;

    backendProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[BACKEND] ${output.trim()}`);

      if (output.includes("Application is running on") && !resolved) {
        resolved = true;
        console.log("✅ Backend server started");
        resolve();
      }
    });

    backendProcess.stderr.on("data", (data) => {
      console.error(`[BACKEND ERROR] ${data.toString().trim()}`);
    });

    backendProcess.on("error", (error) => {
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });

    backendProcess.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Backend process exited with code ${code}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Backend startup timeout"));
      }
    }, 30000);
  });
}

async function stopBackend() {
  if (backendProcess) {
    console.log("🛑 Stopping backend server...");
    backendProcess.kill();
    backendProcess = null;
    console.log("✅ Backend server stopped");
  }
}

async function waitForBackend() {
  console.log("⏳ Waiting for backend to be ready...");

  const maxAttempts = 30;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${API_BASE}/health`, { timeout: 2000 });
      if (response.status === 200) {
        console.log("✅ Backend is ready");
        return true;
      }
    } catch (error) {
      // Backend not ready yet
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Backend failed to start within timeout");
}

async function getTestDocument() {
  console.log("\n🔍 Finding test document...");

  const result = await client.query(
    `SELECT d.id, d.name, d.indexing_status, d.dataset_id,
            COUNT(ds.id) as segment_count
     FROM documents d
     LEFT JOIN document_segments ds ON d.id = ds.document_id
     WHERE d.dataset_id = $1
     GROUP BY d.id, d.name, d.indexing_status, d.dataset_id
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

  return document;
}

async function getTestSegments(documentId, limit = 2) {
  console.log(`\n🔍 Getting ${limit} test segments...`);

  const result = await client.query(
    `SELECT id, content, position, word_count, tokens
     FROM document_segments 
     WHERE document_id = $1
     ORDER BY position
     LIMIT $2`,
    [documentId, limit]
  );

  console.log(`📋 Found ${result.rows.length} segments`);
  result.rows.forEach((seg, i) => {
    console.log(
      `  ${i + 1}. [${seg.position}] ${seg.word_count} words, ${seg.tokens} tokens`
    );
    console.log(`     Content: ${seg.content.substring(0, 100)}...`);
  });

  return result.rows;
}

async function checkGraphData() {
  console.log("\n📊 Current graph data:");

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

async function testDirectSegmentExtraction(documentId, segmentIds) {
  console.log("\n🧪 TEST 1: Direct Segment Extraction (Synchronous)");
  console.log("-".repeat(60));

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/segments/extract`,
      {
        segmentIds,
        syncMode: false,
      },
      { headers, timeout: 60000 }
    );

    console.log("✅ Direct segment extraction successful");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Direct segment extraction failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function testDocumentExtraction(documentId) {
  console.log("\n🧪 TEST 2: Document Extraction (Queue Job)");
  console.log("-".repeat(60));

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      {
        syncMode: false,
      },
      { headers, timeout: 60000 }
    );

    console.log("✅ Document extraction job dispatched");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Document extraction failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorJobProgress(documentId, maxWaitTime = 120000) {
  console.log("\n⏳ Monitoring job progress...");

  const startTime = Date.now();
  let lastStatus = null;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await client.query(
        "SELECT indexing_status FROM documents WHERE id = $1",
        [documentId]
      );

      if (result.rows.length > 0) {
        const status = result.rows[0].indexing_status;

        if (status !== lastStatus) {
          console.log(`📊 Document status: ${status}`);
          lastStatus = status;
        }

        if (status === "completed") {
          console.log("✅ Job completed successfully!");
          return true;
        } else if (status === "error" || status === "failed") {
          console.log("❌ Job failed!");
          return false;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error("Error monitoring job:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("⏰ Timeout waiting for job completion");
  return false;
}

async function analyzeResults(before, after) {
  console.log("\n🔍 Analysis:");
  console.log("-".repeat(40));

  const nodesCreated = after.nodeCount - before.nodeCount;
  const edgesCreated = after.edgeCount - before.edgeCount;

  console.log(`📈 Nodes created: ${nodesCreated}`);
  console.log(`🔗 Edges created: ${edgesCreated}`);

  if (nodesCreated > 0 || edgesCreated > 0) {
    console.log("✅ Graph extraction successful!");

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
        console.log(`     Properties: ${JSON.stringify(props, null, 6)}`);
      }
    });

    const sampleEdges = await client.query(
      `SELECT ge.id, ge.edge_type, ge.weight, ge.properties, ge.created_at,
              sn.label as source_label, tn.label as target_label
       FROM graph_edges ge
       JOIN graph_nodes sn ON ge.source_node_id = sn.id
       JOIN graph_nodes tn ON ge.target_node_id = tn.id
       WHERE ge.dataset_id = $1 
       ORDER BY ge.created_at DESC 
       LIMIT 3`,
      [DATASET_ID]
    );

    console.log("\n🔗 Sample edges created:");
    sampleEdges.rows.forEach((edge, i) => {
      console.log(
        `  ${i + 1}. ${edge.source_label} -> ${edge.target_label} (${edge.edge_type})`
      );
      console.log(`     Created: ${edge.created_at}`);
      if (edge.weight) console.log(`     Weight: ${edge.weight}`);
      if (edge.properties) {
        const props =
          typeof edge.properties === "string"
            ? JSON.parse(edge.properties)
            : edge.properties;
        console.log(`     Properties: ${JSON.stringify(props, null, 6)}`);
      }
    });
  } else {
    console.log("⚠️  No graph data created");
  }
}

async function testRealGraphJob() {
  try {
    console.log("🧪 Real Graph Job Test");
    console.log("=".repeat(60));

    await connectDatabase();

    // Get test data
    const document = await getTestDocument();
    const segments = await getTestSegments(document.id, 2);

    // Check initial state
    const before = await checkGraphData();

    // Start backend
    await startBackend();
    await waitForBackend();

    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Direct vs Queue Job");
    console.log("=".repeat(60));

    // Test 1: Direct segment extraction
    const segmentIds = segments.map((s) => s.id);
    const directResult = await testDirectSegmentExtraction(
      document.id,
      segmentIds
    );

    // Check results after direct call
    const afterDirect = await checkGraphData();
    const directAnalysis = {
      nodesCreated: afterDirect.nodeCount - before.nodeCount,
      edgesCreated: afterDirect.edgeCount - before.edgeCount,
    };

    console.log("\n📊 Direct call analysis:");
    console.log(`📈 Nodes created: ${directAnalysis.nodesCreated}`);
    console.log(`🔗 Edges created: ${directAnalysis.edgesCreated}`);

    // Test 2: Document extraction via queue job
    const queueResult = await testDocumentExtraction(document.id);

    // Monitor queue job
    const jobCompleted = await monitorJobProgress(document.id);

    if (jobCompleted) {
      // Check final results
      const afterQueue = await checkGraphData();
      const queueAnalysis = {
        nodesCreated: afterQueue.nodeCount - afterDirect.nodeCount,
        edgesCreated: afterQueue.edgeCount - afterDirect.edgeCount,
      };

      console.log("\n📊 Queue job analysis:");
      console.log(`📈 Additional nodes created: ${queueAnalysis.nodesCreated}`);
      console.log(`🔗 Additional edges created: ${queueAnalysis.edgesCreated}`);

      // Compare results
      console.log("\n🔍 COMPARISON:");
      console.log(
        `Direct call: ${directAnalysis.nodesCreated} nodes, ${directAnalysis.edgesCreated} edges`
      );
      console.log(
        `Queue job: ${queueAnalysis.nodesCreated} nodes, ${queueAnalysis.edgesCreated} edges`
      );

      if (
        directAnalysis.nodesCreated === queueAnalysis.nodesCreated &&
        directAnalysis.edgesCreated === queueAnalysis.edgesCreated
      ) {
        console.log("✅ Both methods produced identical results!");
      } else {
        console.log("⚠️  Methods produced different results");
      }
    }

    // Final analysis
    await analyzeResults(before, await checkGraphData());

    console.log("\n" + "=".repeat(60));
    console.log("✅ Real graph job test completed!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await stopBackend();
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, cleaning up...");
  await stopBackend();
  await client.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, cleaning up...");
  await stopBackend();
  await client.end();
  process.exit(0);
});

// Run the test
if (require.main === module) {
  testRealGraphJob().catch(console.error);
}

module.exports = { testRealGraphJob };
