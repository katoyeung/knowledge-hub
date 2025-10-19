const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function checkDocumentStatus() {
  try {
    await client.connect();
    console.log("Connected to database");

    // Check document status
    const docResult = await client.query(`
      SELECT id, name, indexing_status, completed_at, created_at, updated_at
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log("Document status:", docResult.rows);

    // Check if there are any errors in the processing metadata
    const docWithMetadata = await client.query(`
      SELECT id, name, processing_metadata
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
    `);
    console.log("Document with metadata:", docWithMetadata.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

checkDocumentStatus();
