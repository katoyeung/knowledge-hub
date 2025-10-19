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

async function testNotificationEndpoint() {
  console.log("\n🔍 Testing notification endpoint...");

  try {
    const response = await axios.get(
      `${API_BASE}/notifications/stream?clientId=test123`,
      {
        headers,
        timeout: 3000,
      }
    );
    console.log("✅ Notification endpoint accessible:", response.status);
    return true;
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      console.log("⚠️  Notification endpoint timeout (expected for SSE)");
      return true; // SSE endpoints typically timeout
    }
    console.error(
      "❌ Notification endpoint failed:",
      error.response?.status || error.message
    );
    return false;
  }
}

async function testQueueEndpoints() {
  console.log("\n🔍 Testing queue endpoints...");

  try {
    const statusResponse = await axios.get(`${API_BASE}/api/queue/status`, {
      headers,
    });
    console.log("✅ Queue status endpoint:", statusResponse.status);

    const jobsResponse = await axios.get(`${API_BASE}/api/queue/jobs`, {
      headers,
    });
    console.log("✅ Queue jobs endpoint:", jobsResponse.status);
    console.log("📋 Registered jobs:", jobsResponse.data.data.length);

    return true;
  } catch (error) {
    console.error(
      "❌ Queue endpoints failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function checkDocumentStatus() {
  console.log("\n🔍 Checking document status...");

  try {
    const result = await client.query(`
      SELECT d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata, d.error,
             COUNT(ds.id) as segment_count
      FROM documents d
      LEFT JOIN document_segments ds ON d.id = ds.document_id
      WHERE d.dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
      GROUP BY d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata, d.error
      ORDER BY d.created_at DESC
      LIMIT 3
    `);

    console.log(`📊 Found ${result.rows.length} documents in dataset`);

    result.rows.forEach((doc, i) => {
      console.log(
        `  ${i + 1}. ${doc.name} - ${doc.indexing_status} (${doc.segment_count} segments)`
      );
      if (doc.error) {
        console.log(`     Error: ${doc.error}`);
      }
    });

    return result.rows;
  } catch (error) {
    console.error("❌ Error checking documents:", error.message);
    return [];
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
        SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on
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

async function testGraphExtractionAPI() {
  console.log("\n🔍 Testing graph extraction API...");

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

async function testNotificationSystemStatus() {
  try {
    console.log("🧪 Notification System Status Check");
    console.log("=".repeat(60));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Test notification endpoint
    const notificationOk = await testNotificationEndpoint();

    // Test queue endpoints
    const queueOk = await testQueueEndpoints();

    // Check documents
    const documents = await checkDocumentStatus();

    // Check queue jobs
    const jobCount = await checkQueueJobs();

    // Test graph extraction API
    const apiOk = await testGraphExtractionAPI();

    console.log("\n" + "=".repeat(60));
    console.log("📊 NOTIFICATION SYSTEM STATUS SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`✅ Notification endpoint: ${notificationOk}`);
    console.log(`✅ Queue endpoints: ${queueOk}`);
    console.log(`📊 Documents in dataset: ${documents.length}`);
    console.log(`📊 Jobs in queue: ${jobCount}`);
    console.log(`✅ Graph extraction API: ${apiOk}`);

    console.log("\n" + "=".repeat(60));
    console.log("🎯 FRONTEND TESTING INSTRUCTIONS");
    console.log("=".repeat(60));

    if (backendRunning && notificationOk && queueOk) {
      console.log("✅ Backend notification system is working!");
      console.log("\n📋 To test frontend notifications:");
      console.log("1. Open the frontend in a browser (http://localhost:3000)");
      console.log("2. Open browser developer tools (F12)");
      console.log("3. Go to the Console tab");
      console.log("4. Look for these messages:");
      console.log("   - 'Connected to notification stream'");
      console.log("   - 'Notification service connected'");
      console.log("5. Navigate to a dataset with documents");
      console.log("6. Click 'Extract Graph' or 'Extract' on a document");
      console.log("7. Watch the console for real-time updates like:");
      console.log("   - 'Document processing update: {...}'");
      console.log("   - 'Graph extraction update: {...}'");
      console.log("8. The document status should update in real-time");

      console.log("\n🔧 If notifications are not working:");
      console.log("- Check browser console for CORS errors");
      console.log("- Verify the frontend is running on http://localhost:3000");
      console.log("- Check if the notification service is properly imported");
      console.log(
        "- Look for 'Failed to create EventSource connection' errors"
      );
    } else {
      console.log("❌ Backend notification system has issues:");
      if (!notificationOk) {
        console.log("- Notification endpoint is not accessible");
        console.log("- Check CORS configuration in backend");
        console.log("- Verify notification controller is properly set up");
      }
      if (!queueOk) {
        console.log("- Queue endpoints are not working");
        console.log("- Check if queue controller is properly registered");
      }
    }

    console.log("\n💡 The notification system uses Server-Sent Events (SSE)");
    console.log(
      "   which provides real-time updates from backend to frontend."
    );
    console.log(
      "   This should solve the 'Waiting to start processing...' issue."
    );
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
  testNotificationSystemStatus().catch(console.error);
}

module.exports = { testNotificationSystemStatus };
