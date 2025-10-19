const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

const DATASET_ID = "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b";

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

async function checkDatasetSettings() {
  console.log("\n🔍 Checking dataset settings...");

  const result = await client.query(
    "SELECT settings FROM datasets WHERE id = $1",
    [DATASET_ID]
  );

  if (result.rows.length === 0) {
    throw new Error("Dataset not found");
  }

  const settings = result.rows[0].settings;
  console.log("📋 Dataset settings:", JSON.stringify(settings, null, 2));

  return settings;
}

async function checkAISettings() {
  console.log("\n🤖 Checking AI provider settings...");

  // Check if there are any AI providers
  const providerResult = await client.query(
    "SELECT id, name, type, is_active FROM ai_providers WHERE is_active = true LIMIT 5"
  );

  console.log(`📊 Active AI providers: ${providerResult.rows.length}`);
  providerResult.rows.forEach((provider, i) => {
    console.log(
      `  ${i + 1}. ${provider.name} (${provider.type}) - ${provider.id}`
    );
  });

  // Check prompts
  const promptResult = await client.query(
    "SELECT id, name, type FROM prompts WHERE is_active = true LIMIT 5"
  );

  console.log(`📝 Active prompts: ${promptResult.rows.length}`);
  promptResult.rows.forEach((prompt, i) => {
    console.log(`  ${i + 1}. ${prompt.name} (${prompt.type}) - ${prompt.id}`);
  });

  return {
    providers: providerResult.rows,
    prompts: promptResult.rows,
  };
}

async function simulateGraphExtraction(segments) {
  console.log("\n🧪 Simulating graph extraction process...");

  // This simulates what the GraphExtractionService.extractFromSegments would do
  console.log("📋 Processing segments:");

  let totalNodes = 0;
  let totalEdges = 0;

  for (const segment of segments) {
    console.log(`\n  Processing segment ${segment.position}:`);
    console.log(`    Content length: ${segment.content.length} chars`);
    console.log(`    Word count: ${segment.word_count}`);
    console.log(`    Tokens: ${segment.tokens}`);

    // Simulate extraction results
    const simulatedNodes = Math.floor(Math.random() * 3) + 1; // 1-3 nodes
    const simulatedEdges = Math.floor(Math.random() * 2) + 1; // 1-2 edges

    console.log(
      `    Simulated extraction: ${simulatedNodes} nodes, ${simulatedEdges} edges`
    );

    totalNodes += simulatedNodes;
    totalEdges += simulatedEdges;
  }

  console.log(
    `\n📊 Total simulated results: ${totalNodes} nodes, ${totalEdges} edges`
  );

  return { nodesCreated: totalNodes, edgesCreated: totalEdges };
}

async function checkQueueJobs() {
  console.log("\n⏳ Checking queue jobs...");

  // Check if there are any pending jobs in the database
  // Note: This depends on how your queue system stores jobs
  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs WHERE status = 'waiting' OR status = 'active'"
    );
    const pendingJobs = parseInt(result.rows[0].count);
    console.log(`📊 Pending queue jobs: ${pendingJobs}`);
  } catch (error) {
    console.log("⚠️  Could not check queue jobs (table might not exist)");
  }
}

async function analyzeGraphStructure() {
  console.log("\n🔍 Analyzing existing graph structure...");

  // Get sample nodes
  const nodeResult = await client.query(
    `SELECT node_type, COUNT(*) as count 
     FROM graph_nodes 
     WHERE dataset_id = $1 
     GROUP BY node_type 
     ORDER BY count DESC`,
    [DATASET_ID]
  );

  console.log("📋 Node types distribution:");
  nodeResult.rows.forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.node_type}: ${row.count} nodes`);
  });

  // Get sample edges
  const edgeResult = await client.query(
    `SELECT edge_type, COUNT(*) as count 
     FROM graph_edges 
     WHERE dataset_id = $1 
     GROUP BY edge_type 
     ORDER BY count DESC`,
    [DATASET_ID]
  );

  console.log("\n🔗 Edge types distribution:");
  edgeResult.rows.forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.edge_type}: ${row.count} edges`);
  });

  // Get recent nodes
  const recentNodes = await client.query(
    `SELECT label, node_type, properties, created_at
     FROM graph_nodes 
     WHERE dataset_id = $1 
     ORDER BY created_at DESC 
     LIMIT 3`,
    [DATASET_ID]
  );

  console.log("\n📋 Recent nodes:");
  recentNodes.rows.forEach((node, i) => {
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
}

async function testGraphJobDirect() {
  try {
    console.log("🧪 Graph Job Direct Test");
    console.log("=".repeat(50));

    await connectDatabase();

    // Get test document
    const document = await getTestDocument();

    // Get test segments
    const segments = await getTestSegments(document.id, 2);

    // Check current graph data
    const graphData = await checkGraphData();

    // Check dataset settings
    const settings = await checkDatasetSettings();

    // Check AI settings
    const aiSettings = await checkAISettings();

    // Check queue jobs
    await checkQueueJobs();

    // Analyze existing graph structure
    await analyzeGraphStructure();

    // Simulate extraction process
    const simulation = await simulateGraphExtraction(segments);

    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`📄 Document: ${document.name}`);
    console.log(`📊 Segments tested: ${segments.length}`);
    console.log(`📈 Current nodes: ${graphData.nodeCount}`);
    console.log(`🔗 Current edges: ${graphData.edgeCount}`);
    console.log(`🤖 AI providers: ${aiSettings.providers.length}`);
    console.log(`📝 Prompts: ${aiSettings.prompts.length}`);
    console.log(
      `🧪 Simulated extraction: ${simulation.nodesCreated} nodes, ${simulation.edgesCreated} edges`
    );

    console.log("\n✅ Test completed successfully!");
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
  testGraphJobDirect().catch(console.error);
}

module.exports = { testGraphJobDirect };
