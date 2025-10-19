const axios = require("axios");

async function testJobRegistration() {
  try {
    console.log("🔍 Testing job registration...");

    // First, let's check if the backend is running
    const healthResponse = await axios.get("http://localhost:3001/health");
    console.log("Backend health:", healthResponse.status);

    // Try to trigger a job and see what happens
    console.log("Dispatching graph extraction job...");
    const response = await axios.post(
      "http://localhost:3001/api/graph/datasets/f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b/extract",
      {
        aiProviderId: "29779ca1-cd3a-4ab5-9959-09f59cf918d5",
        model: "llama4:scout",
        extractNodes: true,
        extractEdges: true,
        nodeTypes: ["author", "brand", "topic", "hashtag"],
        edgeTypes: ["mentions", "interacts_with", "discusses"],
      },
      {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwNTk0OTY5LCJleHAiOjE3NjMxODY5Njl9.S8K2K19GGW-d6la4JmZ-t7FxDpfuouxiW4KCL_3FmDk",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Job dispatched:", response.data);

    // Wait a bit and check for any processing
    console.log("Waiting 20 seconds for processing...");
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // Check database
    const { Client } = require("pg");
    const client = new Client({
      host: "localhost",
      port: 5432,
      database: "knowledge_hub",
      user: "root",
      password: "root",
    });

    await client.connect();

    // Check graph nodes
    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes"
    );
    console.log("Graph nodes count:", nodeResult.rows[0].count);

    // Check if any documents have been updated
    const docResult = await client.query(`
      SELECT id, name, indexing_status, completed_at 
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log("Document status:", docResult.rows);

    await client.end();
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testJobRegistration();
