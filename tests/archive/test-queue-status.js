const axios = require("axios");
const { Client } = require("pg");

const API_BASE = "http://localhost:3001";
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

async function checkBackendHealth() {
  console.log("\n🔍 Checking backend health...");

  try {
    const response = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    console.log("✅ Backend is running:", response.status);
    return true;
  } catch (error) {
    console.error("❌ Backend is not running:", error.message);
    return false;
  }
}

async function checkRedisStatus() {
  console.log("\n🔍 Checking Redis status...");

  try {
    // Try to check if Redis is accessible through the backend
    const response = await axios.get(`${API_BASE}/api/queue/status`, {
      headers,
    });
    console.log("✅ Redis status:", response.data);
    return true;
  } catch (error) {
    console.error(
      "❌ Redis check failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function checkJobRegistry() {
  console.log("\n🔍 Checking job registry...");

  try {
    const response = await axios.get(`${API_BASE}/api/queue/jobs`, { headers });
    console.log("✅ Registered jobs:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Job registry check failed:",
      error.response?.data || error.message
    );
    return null;
  }
}

async function checkQueueJobs() {
  console.log("\n🔍 Checking queue jobs in database...");

  try {
    // Check if bull_jobs table exists and has data
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'bull_jobs'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log("⚠️  bull_jobs table does not exist");
      return 0;
    }

    const queueResult = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs"
    );
    const totalJobs = parseInt(queueResult.rows[0].count);
    console.log(`📊 Total jobs in queue: ${totalJobs}`);

    if (totalJobs > 0) {
      const statusResult = await client.query(`
        SELECT status, COUNT(*) as count 
        FROM bull_jobs 
        GROUP BY status 
        ORDER BY count DESC
      `);

      console.log("📋 Job status distribution:");
      statusResult.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.status}: ${row.count} jobs`);
      });

      // Get recent jobs
      const recentJobs = await client.query(`
        SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on
        FROM bull_jobs 
        ORDER BY created_at DESC 
        LIMIT 5
      `);

      console.log("\n📋 Recent jobs:");
      recentJobs.rows.forEach((job, i) => {
        console.log(`  ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`);
        console.log(
          `     Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
        );
        console.log(`     Created: ${job.created_at}`);
        if (job.processed_on) console.log(`     Started: ${job.processed_on}`);
        if (job.finished_on) console.log(`     Finished: ${job.finished_on}`);
      });
    }

    return totalJobs;
  } catch (error) {
    console.error("❌ Error checking queue jobs:", error.message);
    return 0;
  }
}

async function checkDocumentStatus() {
  console.log("\n🔍 Checking document statuses...");

  try {
    const result = await client.query(`
      SELECT indexing_status, COUNT(*) as count 
      FROM documents 
      GROUP BY indexing_status 
      ORDER BY count DESC
    `);

    console.log("📋 Document status distribution:");
    result.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.indexing_status}: ${row.count} documents`);
    });

    // Get documents stuck in waiting status
    const waitingDocs = await client.query(`
      SELECT id, name, indexing_status, created_at, updated_at, processing_metadata
      FROM documents 
      WHERE indexing_status = 'waiting' 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    if (waitingDocs.rows.length > 0) {
      console.log("\n⚠️  Documents stuck in 'waiting' status:");
      waitingDocs.rows.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.name} (${doc.id})`);
        console.log(`     Created: ${doc.created_at}`);
        console.log(`     Updated: ${doc.updated_at}`);
        console.log(
          `     Metadata: ${JSON.stringify(doc.processing_metadata, null, 2)}`
        );
      });
    }
  } catch (error) {
    console.error("❌ Error checking document status:", error.message);
  }
}

async function checkGraphData() {
  console.log("\n📊 Checking graph data...");

  try {
    const nodeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_nodes"
    );
    const nodeCount = parseInt(nodeResult.rows[0].count);

    const edgeResult = await client.query(
      "SELECT COUNT(*) as count FROM graph_edges"
    );
    const edgeCount = parseInt(edgeResult.rows[0].count);

    console.log(`📈 Total nodes: ${nodeCount}`);
    console.log(`🔗 Total edges: ${edgeCount}`);

    // Get recent graph data
    const recentNodes = await client.query(`
      SELECT label, node_type, created_at
      FROM graph_nodes 
      ORDER BY created_at DESC 
      LIMIT 3
    `);

    if (recentNodes.rows.length > 0) {
      console.log("\n📋 Recent nodes:");
      recentNodes.rows.forEach((node, i) => {
        console.log(
          `  ${i + 1}. ${node.label} (${node.node_type}) - ${node.created_at}`
        );
      });
    }
  } catch (error) {
    console.error("❌ Error checking graph data:", error.message);
  }
}

async function testQueueStatus() {
  try {
    console.log("🔍 Queue Status Check");
    console.log("=".repeat(50));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Check Redis status
    await checkRedisStatus();

    // Check job registry
    await checkJobRegistry();

    // Check queue jobs
    await checkQueueJobs();

    // Check document statuses
    await checkDocumentStatus();

    // Check graph data
    await checkGraphData();

    console.log("\n" + "=".repeat(50));
    console.log("✅ Queue status check completed!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Status check failed:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the test
if (require.main === module) {
  testQueueStatus().catch(console.error);
}

module.exports = { testQueueStatus };
