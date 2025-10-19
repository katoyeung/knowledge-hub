const { Client } = require("pg");
const axios = require("axios");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function testJobSystem() {
  console.log("🔍 Testing Job System...\n");

  await client.connect();

  // 1. Check current job count
  const jobCount = await client.query(
    "SELECT COUNT(*) as count FROM bull_jobs"
  );
  console.log("📊 Current jobs in queue:", jobCount.rows[0].count);

  // 2. Check document status
  const docStatus = await client.query(
    `
    SELECT name, indexing_status, processing_metadata 
    FROM documents 
    WHERE dataset_id = $1 
    ORDER BY created_at DESC 
    LIMIT 3
  `,
    ["f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"]
  );

  console.log("📄 Document statuses:");
  docStatus.rows.forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.name} - ${doc.indexing_status}`);
    if (doc.processing_metadata) {
      console.log(`     Metadata: ${JSON.stringify(doc.processing_metadata)}`);
    }
  });

  // 3. Check if we have any segments to process
  const segmentCount = await client.query(
    `
    SELECT COUNT(*) as count 
    FROM document_segments 
    WHERE document_id IN (
      SELECT id FROM documents WHERE dataset_id = $1
    )
  `,
    ["f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"]
  );

  console.log(
    `\n📝 Segments available for processing: ${segmentCount.rows[0].count}`
  );

  // 4. Check recent jobs
  if (parseInt(jobCount.rows[0].count) > 0) {
    const recentJobs = await client.query(`
      SELECT id, name, status, progress, created_at, processed_on, failed_reason
      FROM bull_jobs 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    console.log("\n🔄 Recent jobs:");
    recentJobs.rows.forEach((job, i) => {
      const status = job.status || "unknown";
      const progress = job.progress || 0;
      const createdAt = new Date(job.created_at).toLocaleTimeString();
      const processedOn = job.processed_on
        ? new Date(job.processed_on).toLocaleTimeString()
        : "Not processed";

      console.log(`  ${i + 1}. ${job.name} (${status})`);
      console.log(
        `     Progress: ${progress}% | Created: ${createdAt} | Processed: ${processedOn}`
      );
      if (job.failed_reason) {
        console.log(`     Error: ${job.failed_reason}`);
      }
    });
  }

  // 5. Check if backend is responding
  try {
    const healthCheck = await axios.get("http://localhost:3001/health/all", {
      timeout: 5000,
    });
    console.log("\n✅ Backend is running");
  } catch (error) {
    console.log("\n❌ Backend is not responding:", error.message);
  }

  await client.end();
}

testJobSystem().catch(console.error);
