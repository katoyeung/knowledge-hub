const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function checkGraphData() {
  try {
    await client.connect();
    console.log("Connected to database");

    // Check graph nodes
    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes"
    );
    console.log("Graph nodes count:", nodeResult.rows[0].count);

    // Check graph edges
    const edgeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_edges"
    );
    console.log("Graph edges count:", edgeResult.rows[0].count);

    // Check recent nodes
    const recentNodes = await client.query(`
      SELECT id, node_type, label, created_at 
      FROM graph_nodes 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log("Recent nodes:", recentNodes.rows);

    // Check if there are any documents for our dataset
    const docResult = await client.query(`
      SELECT id, name, dataset_id 
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log("Documents for dataset:", docResult.rows);

    // Check document segments
    const segmentResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM document_segments ds
      JOIN documents d ON ds.document_id = d.id
      WHERE d.dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log("Document segments count:", segmentResult.rows[0].count);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

checkGraphData();
