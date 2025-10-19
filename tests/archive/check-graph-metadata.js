const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function checkGraphMetadata() {
  try {
    await client.connect();
    console.log("Connected to database");

    // Check graph extraction metadata
    const docResult = await client.query(`
      SELECT id, name, processing_metadata->'graphExtraction' as graph_extraction
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log(
      "Graph extraction metadata:",
      JSON.stringify(docResult.rows, null, 2)
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

checkGraphMetadata();
