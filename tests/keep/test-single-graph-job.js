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

// Test configuration
const TEST_CONFIG = {
  syncMode: false, // Use async mode to test queue job
  // Will use dataset's graph settings
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
    `SELECT d.id, d.name, d.indexing_status, d.dataset_id,
            COUNT(ds.id) as segment_count
     FROM documents d
     LEFT JOIN document_segments ds ON d.id = ds.document_id
     WHERE d.dataset_id = $1
     GROUP BY d.id, d.name, d.indexing_status, d.dataset_id
     ORDER BY segment_count DESC
     LIMIT 1`,
    [DATASET_ID]
  );

  if (result.rows.length === 0) {
    throw new Error("No documents found in dataset");
  }

  const document = result.rows[0];
  console.log(`📄 Selected document: ${document.name} (${document.id})`);
  console.log(`📊 Segments: ${document.segment_count}`);
  console.log(`📈 Status: ${document.indexing_status}`);

  return document;
}

async function getDocumentSegments(documentId) {
  console.log("\n🔍 Getting document segments...");

  const result = await client.query(
    `SELECT id, content, position, created_at
     FROM document_segments 
     WHERE document_id = $1
     ORDER BY position
     LIMIT 3`, // Test with first 3 segments
    [documentId]
  );

  console.log(`📋 Found ${result.rows.length} segments to test`);
  result.rows.forEach((segment, index) => {
    console.log(
      `  ${index + 1}. Segment ${segment.position}: ${segment.content.substring(0, 100)}...`
    );
  });

  return result.rows;
}

async function checkInitialGraphData(datasetId) {
  console.log("\n📊 Checking initial graph data...");

  const nodeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
    [datasetId]
  );
  const initialNodeCount = parseInt(nodeResult.rows[0].count);

  const edgeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
    [datasetId]
  );
  const initialEdgeCount = parseInt(edgeResult.rows[0].count);

  console.log(`📈 Initial nodes: ${initialNodeCount}`);
  console.log(`🔗 Initial edges: ${initialEdgeCount}`);

  return { initialNodeCount, initialEdgeCount };
}

async function triggerSegmentExtraction(documentId, segmentIds) {
  console.log("\n🚀 Triggering segment extraction...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/segments/extract`,
      {
        segmentIds,
        ...TEST_CONFIG,
      },
      { headers }
    );

    console.log("✅ Segment extraction triggered successfully");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Failed to trigger segment extraction:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function triggerDocumentExtraction(documentId) {
  console.log("\n🚀 Triggering document extraction (queue job)...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      TEST_CONFIG,
      { headers }
    );

    console.log("✅ Document extraction triggered successfully");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error(
      "❌ Failed to trigger document extraction:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorJobProgress(documentId, maxWaitTime = 60000) {
  console.log("\n⏳ Monitoring job progress...");

  const startTime = Date.now();
  let lastStatus = null;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check document status
      const docResult = await client.query(
        "SELECT indexing_status FROM documents WHERE id = $1",
        [documentId]
      );

      if (docResult.rows.length > 0) {
        const status = docResult.rows[0].indexing_status;

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

      // Wait 2 seconds before next check
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Error monitoring job:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("⏰ Timeout waiting for job completion");
  return false;
}

async function checkFinalGraphData(datasetId, initialCounts) {
  console.log("\n📊 Checking final graph data...");

  const nodeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
    [datasetId]
  );
  const finalNodeCount = parseInt(nodeResult.rows[0].count);

  const edgeResult = await client.query(
    "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
    [datasetId]
  );
  const finalEdgeCount = parseInt(edgeResult.rows[0].count);

  const nodesCreated = finalNodeCount - initialCounts.initialNodeCount;
  const edgesCreated = finalEdgeCount - initialCounts.initialEdgeCount;

  console.log(`📈 Final nodes: ${finalNodeCount} (+${nodesCreated})`);
  console.log(`🔗 Final edges: ${finalEdgeCount} (+${edgesCreated})`);

  return { finalNodeCount, finalEdgeCount, nodesCreated, edgesCreated };
}

async function analyzeGraphResults(datasetId) {
  console.log("\n🔍 Analyzing graph results...");

  // Get sample nodes
  const nodeResult = await client.query(
    `SELECT id, label, type, properties, created_at
     FROM graph_nodes 
     WHERE dataset_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [datasetId]
  );

  console.log("📋 Sample nodes:");
  nodeResult.rows.forEach((node, index) => {
    console.log(`  ${index + 1}. ${node.label} (${node.type})`);
    if (node.properties) {
      const props =
        typeof node.properties === "string"
          ? JSON.parse(node.properties)
          : node.properties;
      console.log(`     Properties: ${JSON.stringify(props, null, 6)}`);
    }
  });

  // Get sample edges
  const edgeResult = await client.query(
    `SELECT id, source_node_id, target_node_id, type, weight, properties, created_at
     FROM graph_edges 
     WHERE dataset_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [datasetId]
  );

  console.log("\n🔗 Sample edges:");
  edgeResult.rows.forEach((edge, index) => {
    console.log(
      `  ${index + 1}. ${edge.source_node_id} -> ${edge.target_node_id} (${edge.type})`
    );
    if (edge.weight) console.log(`     Weight: ${edge.weight}`);
    if (edge.properties) {
      const props =
        typeof edge.properties === "string"
          ? JSON.parse(edge.properties)
          : edge.properties;
      console.log(`     Properties: ${JSON.stringify(props, null, 6)}`);
    }
  });
}

async function testSingleGraphJob() {
  try {
    console.log("🧪 Starting Single Graph Job Test");
    console.log("=".repeat(50));

    await connectDatabase();

    // Get test document
    const document = await getTestDocument();

    // Get segments for testing
    const segments = await getDocumentSegments(document.id);
    if (segments.length === 0) {
      throw new Error("No segments found for testing");
    }

    // Check initial state
    const initialCounts = await checkInitialGraphData(DATASET_ID);

    console.log("\n" + "=".repeat(50));
    console.log("🧪 TEST 1: Direct Segment Extraction (Synchronous)");
    console.log("=".repeat(50));

    // Test 1: Direct segment extraction
    const segmentIds = segments.slice(0, 1).map((s) => s.id); // Test with first segment
    const segmentResult = await triggerSegmentExtraction(
      document.id,
      segmentIds
    );

    console.log("\n📊 Segment extraction result:");
    console.log(`✅ Success: ${segmentResult.success}`);
    console.log(`📈 Nodes created: ${segmentResult.nodesCreated}`);
    console.log(`🔗 Edges created: ${segmentResult.edgesCreated}`);

    // Check results after segment extraction
    const afterSegmentCounts = await checkFinalGraphData(
      DATASET_ID,
      initialCounts
    );

    console.log("\n" + "=".repeat(50));
    console.log("🧪 TEST 2: Document Extraction (Queue Job)");
    console.log("=".repeat(50));

    // Test 2: Document extraction via queue job
    const documentResult = await triggerDocumentExtraction(document.id);

    console.log("\n📊 Document extraction result:");
    console.log(`✅ Success: ${documentResult.success}`);
    console.log(`📄 Document ID: ${documentResult.documentId}`);

    // Monitor job progress
    const jobCompleted = await monitorJobProgress(document.id);

    if (jobCompleted) {
      // Check final results
      const finalCounts = await checkFinalGraphData(
        DATASET_ID,
        afterSegmentCounts
      );

      console.log("\n📊 Queue job results:");
      console.log(`📈 Additional nodes created: ${finalCounts.nodesCreated}`);
      console.log(`🔗 Additional edges created: ${finalCounts.edgesCreated}`);
    }

    // Analyze the graph results
    await analyzeGraphResults(DATASET_ID);

    console.log("\n" + "=".repeat(50));
    console.log("✅ Test completed successfully!");
    console.log("=".repeat(50));
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
  testSingleGraphJob().catch(console.error);
}

module.exports = { testSingleGraphJob };
