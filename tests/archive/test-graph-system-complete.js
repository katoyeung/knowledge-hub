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

async function verifyDatasetSettings() {
  console.log("\n🔍 Verifying dataset settings...");

  try {
    // Check dataset via API
    const datasetResponse = await axios.get(
      `${API_BASE}/datasets/${DATASET_ID}`,
      {
        headers,
      }
    );

    const dataset = datasetResponse.data;
    console.log("📊 Dataset found:", dataset.name);
    console.log(
      "📋 Dataset settings:",
      JSON.stringify(dataset.settings, null, 2)
    );

    // Check chat settings
    const chatSettings = dataset.settings?.chat_settings;
    if (chatSettings) {
      console.log("💬 Chat settings found:");
      console.log("  - Provider:", chatSettings.provider);
      console.log("  - Model:", chatSettings.model);
      console.log("  - Temperature:", chatSettings.temperature);
    } else {
      console.log("⚠️ No chat settings found in dataset");
    }

    return { dataset, chatSettings };
  } catch (error) {
    console.error(
      "❌ Error fetching dataset:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function findCrumpleteAiProvider() {
  console.log("\n🤖 Finding Crumplete AI provider...");

  try {
    const providersResponse = await axios.get(`${API_BASE}/ai-providers`, {
      headers,
    });

    const providers = providersResponse.data.data || providersResponse.data;
    console.log(`📋 Found ${providers.length} AI providers`);

    // Look for Crumplete AI
    const crumpleteProvider = providers.find(
      (p) =>
        p.name?.toLowerCase().includes("crumplete") ||
        p.providerType?.toLowerCase().includes("crumplete")
    );

    if (crumpleteProvider) {
      console.log("✅ Crumplete AI provider found:");
      console.log("  - ID:", crumpleteProvider.id);
      console.log("  - Name:", crumpleteProvider.name);
      console.log("  - Type:", crumpleteProvider.providerType);
      console.log("  - Models:", crumpleteProvider.models);

      // Check if llama4:scout model is available
      const hasModel = crumpleteProvider.models?.some(
        (m) =>
          (typeof m === "string" &&
            (m.includes("llama4:scout") ||
              m.includes("llama4") ||
              m.includes("scout"))) ||
          (typeof m === "object" &&
            m.id &&
            (m.id.includes("llama4:scout") ||
              m.id.includes("llama4") ||
              m.id.includes("scout")))
      );

      if (hasModel) {
        console.log("✅ llama4:scout model found in provider");
      } else {
        console.log(
          "⚠️ llama4:scout model not found, available models:",
          crumpleteProvider.models
        );
      }

      return crumpleteProvider;
    } else {
      console.log("❌ Crumplete AI provider not found");
      console.log(
        "Available providers:",
        providers.map((p) => ({ name: p.name, type: p.providerType }))
      );
      return null;
    }
  } catch (error) {
    console.error(
      "❌ Error fetching AI providers:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function findGraphExtractionPrompt() {
  console.log("\n📝 Finding graph extraction prompt...");

  try {
    const promptsResponse = await axios.get(`${API_BASE}/prompts`, {
      headers,
    });

    const prompts = promptsResponse.data.data || promptsResponse.data;
    console.log(`📋 Found ${prompts.length} prompts`);

    // Look for graph extraction prompt
    const graphPrompt = prompts.find(
      (p) =>
        p.name?.toLowerCase().includes("graph extraction") ||
        p.name?.toLowerCase().includes("social media analysis")
    );

    if (graphPrompt) {
      console.log("✅ Graph extraction prompt found:");
      console.log("  - ID:", graphPrompt.id);
      console.log("  - Name:", graphPrompt.name);
      console.log("  - Active:", graphPrompt.isActive);
      return graphPrompt;
    } else {
      console.log("❌ Graph extraction prompt not found");
      console.log(
        "Available prompts:",
        prompts.map((p) => ({ name: p.name, active: p.isActive }))
      );
      return null;
    }
  } catch (error) {
    console.error(
      "❌ Error fetching prompts:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function checkExistingGraphData() {
  console.log("\n📊 Checking existing graph data...");

  try {
    // Check graph nodes
    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const nodeCount = parseInt(nodeResult.rows[0].count);
    console.log(`📈 Graph nodes for dataset: ${nodeCount}`);

    // Check graph edges
    const edgeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const edgeCount = parseInt(edgeResult.rows[0].count);
    console.log(`🔗 Graph edges for dataset: ${edgeCount}`);

    // Check documents in dataset
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

    return {
      nodeCount,
      edgeCount,
      docCount: docResult.rows.length,
      segmentCount,
    };
  } catch (error) {
    console.error("❌ Error checking graph data:", error.message);
    throw error;
  }
}

async function triggerGraphExtraction(aiProviderId, promptId) {
  console.log("\n🚀 Triggering graph extraction...");

  try {
    const extractionConfig = {
      aiProviderId: aiProviderId,
      promptId: promptId,
      model: "llama4:scout",
      temperature: 0.7,
      extractNodes: true,
      extractEdges: true,
      enableDeduplication: true,
      nodeTypes: [
        "author",
        "brand",
        "topic",
        "hashtag",
        "influencer",
        "organization",
      ],
      edgeTypes: [
        "mentions",
        "interacts_with",
        "discusses",
        "sentiment",
        "related_to",
      ],
    };

    console.log(
      "📋 Extraction config:",
      JSON.stringify(extractionConfig, null, 2)
    );

    const response = await axios.post(
      `${API_BASE}/api/graph/datasets/${DATASET_ID}/extract`,
      extractionConfig,
      { headers }
    );

    console.log("✅ Graph extraction triggered successfully:");
    console.log("  - Success:", response.data.success);
    console.log("  - Message:", response.data.message);
    console.log("  - Job Count:", response.data.jobCount);

    return response.data;
  } catch (error) {
    console.error(
      "❌ Error triggering graph extraction:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorJobProgress() {
  console.log("\n⏳ Monitoring job progress...");

  const maxWaitTime = 300000; // 5 minutes
  const checkInterval = 10000; // 10 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check document status
      const docResult = await client.query(
        "SELECT id, name, indexing_status, error FROM documents WHERE dataset_id = $1",
        [DATASET_ID]
      );

      const allCompleted = docResult.rows.every(
        (doc) =>
          doc.indexing_status === "completed" || doc.indexing_status === "error"
      );

      console.log(`📊 Document statuses:`);
      docResult.rows.forEach((doc) => {
        const status =
          doc.indexing_status === "error"
            ? `❌ ${doc.indexing_status}`
            : doc.indexing_status === "completed"
              ? `✅ ${doc.indexing_status}`
              : `⏳ ${doc.indexing_status}`;
        console.log(`  - ${doc.name}: ${status}`);
        if (doc.error) {
          console.log(`    Error: ${doc.error}`);
        }
      });

      if (allCompleted) {
        console.log("✅ All documents processing completed");
        break;
      }

      console.log(
        `⏳ Waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`
      );
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.error("❌ Error monitoring progress:", error.message);
      break;
    }
  }

  if (Date.now() - startTime >= maxWaitTime) {
    console.log("⏰ Timeout reached while monitoring progress");
  }
}

async function validateResults() {
  console.log("\n📊 Validating graph extraction results...");

  try {
    // Check final graph data
    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const finalNodeCount = parseInt(nodeResult.rows[0].count);

    const edgeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_edges WHERE dataset_id = $1",
      [DATASET_ID]
    );
    const finalEdgeCount = parseInt(edgeResult.rows[0].count);

    console.log(`📈 Final graph nodes: ${finalNodeCount}`);
    console.log(`🔗 Final graph edges: ${finalEdgeCount}`);

    // Get sample nodes
    const sampleNodes = await client.query(
      `
      SELECT node_type, label, properties, created_at 
      FROM graph_nodes 
      WHERE dataset_id = $1 
      ORDER BY created_at DESC 
      LIMIT 5
    `,
      [DATASET_ID]
    );

    console.log("📋 Sample nodes:");
    sampleNodes.rows.forEach((node) => {
      console.log(`  - ${node.node_type}: ${node.label}`);
      if (node.properties) {
        console.log(`    Properties: ${JSON.stringify(node.properties)}`);
      }
    });

    // Get sample edges
    const sampleEdges = await client.query(
      `
      SELECT ge.edge_type, gn1.label as source_label, gn2.label as target_label, ge.weight
      FROM graph_edges ge
      JOIN graph_nodes gn1 ON ge.source_node_id = gn1.id
      JOIN graph_nodes gn2 ON ge.target_node_id = gn2.id
      WHERE ge.dataset_id = $1
      ORDER BY ge.created_at DESC
      LIMIT 5
    `,
      [DATASET_ID]
    );

    console.log("🔗 Sample edges:");
    sampleEdges.rows.forEach((edge) => {
      console.log(
        `  - ${edge.source_label} --[${edge.edge_type}]--> ${edge.target_label} (weight: ${edge.weight})`
      );
    });

    // Check document processing metadata
    const docMetadata = await client.query(
      `
      SELECT name, processing_metadata 
      FROM documents 
      WHERE dataset_id = $1
    `,
      [DATASET_ID]
    );

    console.log("📄 Document processing metadata:");
    docMetadata.rows.forEach((doc) => {
      if (doc.processing_metadata?.graphExtraction) {
        const meta = doc.processing_metadata.graphExtraction;
        console.log(`  - ${doc.name}:`);
        console.log(`    - Nodes created: ${meta.nodesCreated}`);
        console.log(`    - Edges created: ${meta.edgesCreated}`);
        console.log(`    - Segments processed: ${meta.segmentsProcessed}`);
        console.log(`    - Completed at: ${meta.completedAt}`);
      }
    });

    return { finalNodeCount, finalEdgeCount };
  } catch (error) {
    console.error("❌ Error validating results:", error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log("🚀 Starting Graph System Complete Test");
    console.log("=".repeat(50));

    // Connect to database
    await connectDatabase();

    // Step 1: Verify dataset settings
    const { dataset, chatSettings } = await verifyDatasetSettings();

    // Step 2: Find Crumplete AI provider
    const crumpleteProvider = await findCrumpleteAiProvider();
    if (!crumpleteProvider) {
      throw new Error("Crumplete AI provider not found");
    }

    // Step 3: Find graph extraction prompt
    const graphPrompt = await findGraphExtractionPrompt();
    if (!graphPrompt) {
      throw new Error("Graph extraction prompt not found");
    }

    // Step 4: Check existing graph data
    const initialData = await checkExistingGraphData();

    // Step 5: Trigger graph extraction
    const extractionResult = await triggerGraphExtraction(
      crumpleteProvider.id,
      graphPrompt.id
    );

    // Step 6: Monitor job progress
    await monitorJobProgress();

    // Step 7: Validate results
    const finalData = await validateResults();

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Dataset: ${dataset.name}`);
    console.log(
      `✅ AI Provider: ${crumpleteProvider.name} (${crumpleteProvider.providerType})`
    );
    console.log(`✅ Model: llama4:scout`);
    console.log(`✅ Prompt: ${graphPrompt.name}`);
    console.log(
      `📈 Nodes created: ${finalData.finalNodeCount - initialData.nodeCount}`
    );
    console.log(
      `🔗 Edges created: ${finalData.finalEdgeCount - initialData.edgeCount}`
    );
    console.log(`📄 Documents processed: ${initialData.docCount}`);
    console.log(`📝 Segments processed: ${initialData.segmentCount}`);

    if (
      finalData.finalNodeCount > initialData.nodeCount ||
      finalData.finalEdgeCount > initialData.edgeCount
    ) {
      console.log("\n🎉 SUCCESS: Graph system is working properly!");
    } else {
      console.log("\n⚠️ WARNING: No new graph data was created");
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
main();
