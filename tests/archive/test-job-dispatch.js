const { Client } = require("pg");
const axios = require("axios");

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

async function checkQueueJobs() {
  console.log("\n🔍 Checking queue jobs...");

  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs"
    );
    const jobCount = parseInt(result.rows[0].count);
    console.log(`📊 Jobs in queue: ${jobCount}`);

    if (jobCount > 0) {
      const jobs = await client.query(`
        SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on, data
        FROM bull_jobs 
        ORDER BY created_at DESC 
        LIMIT 3
      `);

      console.log("📋 Recent jobs:");
      jobs.rows.forEach((job, i) => {
        console.log(`  ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`);
        console.log(
          `     Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
        );
        console.log(`     Created: ${job.created_at}`);
        if (job.data) {
          console.log(`     Data: ${JSON.stringify(job.data, null, 2)}`);
        }
        if (job.processed_on) console.log(`     Started: ${job.processed_on}`);
        if (job.finished_on) console.log(`     Finished: ${job.finished_on}`);
      });
    }

    return jobCount;
  } catch (error) {
    console.error("❌ Error checking queue jobs:", error.message);
    return 0;
  }
}

async function checkDocumentStatus() {
  console.log("\n🔍 Checking document status...");

  try {
    const result = await client.query(`
      SELECT id, name, indexing_status, processing_metadata, error, updated_at
      FROM documents 
      WHERE id = 'e6b8a7aa-b4c5-4afb-b63b-868218177389'
    `);

    if (result.rows.length > 0) {
      const doc = result.rows[0];
      console.log(`📄 Document: ${doc.name}`);
      console.log(`📈 Status: ${doc.indexing_status}`);
      console.log(`🕒 Updated: ${doc.updated_at}`);

      if (doc.processing_metadata) {
        const metadata =
          typeof doc.processing_metadata === "string"
            ? JSON.parse(doc.processing_metadata)
            : doc.processing_metadata;
        console.log(
          `📋 Processing metadata:`,
          JSON.stringify(metadata, null, 2)
        );
      }

      if (doc.error) {
        console.log(`❌ Error: ${doc.error}`);
      }
    } else {
      console.log("❌ Document not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("❌ Error checking document:", error.message);
    return null;
  }
}

async function triggerGraphExtraction() {
  console.log("\n🚀 Triggering graph extraction...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/e6b8a7aa-b4c5-4afb-b63b-868218177389/extract`,
      { syncMode: false },
      { headers, timeout: 10000 }
    );

    console.log("✅ Graph extraction API call successful");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error(
      "❌ Graph extraction API failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function monitorJobCreation() {
  console.log("\n⏳ Monitoring job creation...");

  const startTime = Date.now();
  const maxWaitTime = 10000; // 10 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const jobCount = await checkQueueJobs();

    if (jobCount > 0) {
      console.log("✅ Job created in queue!");
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("⏰ Timeout waiting for job creation");
  return false;
}

async function testJobDispatch() {
  try {
    console.log("🧪 Job Dispatch Test");
    console.log("=".repeat(50));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Check initial state
    console.log("\n📊 Initial state:");
    await checkQueueJobs();
    await checkDocumentStatus();

    // Trigger graph extraction
    console.log("\n" + "=".repeat(50));
    console.log("🧪 TESTING: Job Dispatch");
    console.log("=".repeat(50));

    const apiSuccess = await triggerGraphExtraction();
    if (!apiSuccess) {
      throw new Error("Graph extraction API call failed");
    }

    // Monitor job creation
    const jobCreated = await monitorJobCreation();

    // Check final state
    console.log("\n📊 Final state:");
    await checkQueueJobs();
    await checkDocumentStatus();

    console.log("\n" + "=".repeat(50));
    console.log("📊 JOB DISPATCH TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`✅ API call successful: ${apiSuccess}`);
    console.log(`✅ Job created in queue: ${jobCreated}`);

    if (jobCreated) {
      console.log("\n✅ Job dispatch is working correctly!");
      console.log(
        "💡 The queue system should now process jobs and send notifications."
      );
    } else {
      console.log("\n❌ Job dispatch is not working.");
      console.log("💡 Check backend logs for errors in job dispatch logic.");
    }
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
  testJobDispatch().catch(console.error);
}

module.exports = { testJobDispatch };
