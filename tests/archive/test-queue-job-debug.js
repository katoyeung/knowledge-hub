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

async function getTestData() {
  console.log("\n🔍 Getting test data...");

  // Get a document with segments
  const docResult = await client.query(
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

  if (docResult.rows.length === 0) {
    throw new Error("No documents with segments found");
  }

  const document = docResult.rows[0];
  console.log(`📄 Document: ${document.name} (${document.id})`);
  console.log(`📊 Segments: ${document.segment_count}`);

  // Get first few segments
  const segmentResult = await client.query(
    `SELECT id, content, position
     FROM document_segments 
     WHERE document_id = $1
     ORDER BY position
     LIMIT 2`,
    [document.id]
  );

  console.log(`📋 Testing with ${segmentResult.rows.length} segments`);
  segmentResult.rows.forEach((seg, i) => {
    console.log(
      `  ${i + 1}. [${seg.position}] ${seg.content.substring(0, 80)}...`
    );
  });

  return {
    document,
    segments: segmentResult.rows,
  };
}

async function checkGraphDataBefore() {
  console.log("\n📊 Graph data BEFORE extraction:");

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

async function testDirectServiceCall(documentId, segmentIds) {
  console.log("\n🧪 TEST: Direct Service Call (Synchronous)");
  console.log("-".repeat(50));

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/segments/extract`,
      {
        segmentIds,
        syncMode: false,
      },
      { headers }
    );

    console.log("✅ Direct call successful");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Direct call failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function testQueueJob(documentId) {
  console.log("\n🧪 TEST: Queue Job (Asynchronous)");
  console.log("-".repeat(50));

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      {
        syncMode: false,
      },
      { headers }
    );

    console.log("✅ Queue job dispatched");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Queue job failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorQueueJob(documentId) {
  console.log("\n⏳ Monitoring queue job...");

  const maxWait = 30000; // 30 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const result = await client.query(
      "SELECT indexing_status FROM documents WHERE id = $1",
      [documentId]
    );

    if (result.rows.length > 0) {
      const status = result.rows[0].indexing_status;
      console.log(`📊 Document status: ${status}`);

      if (status === "completed") {
        console.log("✅ Queue job completed!");
        return true;
      } else if (status === "error" || status === "failed") {
        console.log("❌ Queue job failed!");
        return false;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("⏰ Queue job timeout");
  return false;
}

async function checkGraphDataAfter() {
  console.log("\n📊 Graph data AFTER extraction:");

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

async function analyzeResults(before, after) {
  console.log("\n🔍 Analysis:");
  console.log("-".repeat(30));

  const nodesCreated = after.nodeCount - before.nodeCount;
  const edgesCreated = after.edgeCount - before.edgeCount;

  console.log(`📈 Nodes created: ${nodesCreated}`);
  console.log(`🔗 Edges created: ${edgesCreated}`);

  if (nodesCreated > 0 || edgesCreated > 0) {
    console.log("✅ Graph extraction successful!");

    // Show sample results
    const sampleNodes = await client.query(
      `SELECT label, type, properties 
       FROM graph_nodes 
       WHERE dataset_id = $1 
       ORDER BY created_at DESC 
       LIMIT 3`,
      [DATASET_ID]
    );

    console.log("\n📋 Sample nodes:");
    sampleNodes.rows.forEach((node, i) => {
      console.log(`  ${i + 1}. ${node.label} (${node.type})`);
      if (node.properties) {
        const props =
          typeof node.properties === "string"
            ? JSON.parse(node.properties)
            : node.properties;
        console.log(`     Properties: ${JSON.stringify(props, null, 6)}`);
      }
    });
  } else {
    console.log("⚠️  No graph data created");
  }
}

async function debugQueueJob() {
  try {
    console.log("🐛 Queue Job Debug Test");
    console.log("=".repeat(50));

    await connectDatabase();

    // Get test data
    const { document, segments } = await getTestData();

    // Check initial state
    const before = await checkGraphDataBefore();

    console.log("\n" + "=".repeat(50));
    console.log("🧪 COMPARING: Direct vs Queue Job");
    console.log("=".repeat(50));

    // Test 1: Direct service call
    const segmentIds = segments.map((s) => s.id);
    const directResult = await testDirectServiceCall(document.id, segmentIds);

    // Check results after direct call
    const afterDirect = await checkGraphDataAfter();
    const directAnalysis = {
      nodesCreated: afterDirect.nodeCount - before.nodeCount,
      edgesCreated: afterDirect.edgeCount - before.edgeCount,
    };

    console.log("\n📊 Direct call analysis:");
    console.log(`📈 Nodes created: ${directAnalysis.nodesCreated}`);
    console.log(`🔗 Edges created: ${directAnalysis.edgesCreated}`);

    // Test 2: Queue job
    const queueResult = await testQueueJob(document.id);

    // Monitor queue job
    const jobCompleted = await monitorQueueJob(document.id);

    if (jobCompleted) {
      // Check final results
      const afterQueue = await checkGraphDataAfter();
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
    await analyzeResults(before, await checkGraphDataAfter());

    console.log("\n" + "=".repeat(50));
    console.log("✅ Debug test completed!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Debug test failed:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the test
if (require.main === module) {
  debugQueueJob().catch(console.error);
}

module.exports = { debugQueueJob };
