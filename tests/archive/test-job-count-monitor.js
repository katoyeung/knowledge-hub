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

async function getJobCount() {
  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs"
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error("❌ Error getting job count:", error.message);
    return 0;
  }
}

async function getJobDetails() {
  try {
    const result = await client.query(`
      SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on, data
      FROM bull_jobs 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    return result.rows;
  } catch (error) {
    console.error("❌ Error getting job details:", error.message);
    return [];
  }
}

async function getDocumentStatus(documentId) {
  try {
    const result = await client.query(
      `
      SELECT id, name, indexing_status, processing_metadata, error, updated_at
      FROM documents 
      WHERE id = $1
    `,
      [documentId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  } catch (error) {
    console.error("❌ Error getting document status:", error.message);
    return null;
  }
}

async function triggerGraphExtraction(documentId) {
  console.log("\n🚀 Triggering graph extraction...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      { syncMode: false },
      { headers, timeout: 10000 }
    );

    console.log("✅ Graph extraction triggered");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error(
      "❌ Graph extraction failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function monitorJobProgress(documentId, maxWaitTime = 120000) {
  console.log("\n⏳ Monitoring job progress with real-time counts...");
  console.log("=".repeat(80));

  const startTime = Date.now();
  let lastJobCount = 0;
  let lastDocumentStatus = null;
  let lastProcessingMetadata = null;
  let jobCreated = false;
  let jobProcessed = false;

  console.log("📊 Real-time Job Progress Monitor");
  console.log("=".repeat(80));
  console.log("Time\t\tJobs\tStatus\t\tProgress\tDetails");
  console.log("-".repeat(80));

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const currentTime = new Date().toLocaleTimeString();

      // Get job count
      const jobCount = await getJobCount();

      // Get job details
      const jobs = await getJobDetails();

      // Get document status
      const document = await getDocumentStatus(documentId);

      // Check if job was created
      if (jobCount > lastJobCount) {
        jobCreated = true;
        console.log(
          `\n🎉 JOB CREATED! Count increased from ${lastJobCount} to ${jobCount}`
        );
      }

      // Check if job is being processed
      const activeJobs = jobs.filter(
        (job) => job.status === "active" || job.status === "waiting"
      );
      const completedJobs = jobs.filter((job) => job.status === "completed");
      const failedJobs = jobs.filter((job) => job.status === "failed");

      // Check document status changes
      const currentStatus = document ? document.indexing_status : "unknown";
      const currentMetadata = document ? document.processing_metadata : null;

      if (
        currentStatus !== lastDocumentStatus ||
        JSON.stringify(currentMetadata) !==
          JSON.stringify(lastProcessingMetadata)
      ) {
        console.log(`\n📄 DOCUMENT STATUS UPDATE:`);
        console.log(`   Status: ${currentStatus}`);
        console.log(`   Updated: ${document ? document.updated_at : "N/A"}`);

        if (currentMetadata) {
          const metadata =
            typeof currentMetadata === "string"
              ? JSON.parse(currentMetadata)
              : currentMetadata;
          console.log(
            `   Processing Metadata:`,
            JSON.stringify(metadata, null, 4)
          );
        }

        if (document && document.error) {
          console.log(`   Error: ${document.error}`);
        }

        lastDocumentStatus = currentStatus;
        lastProcessingMetadata = currentMetadata;
      }

      // Show job details if there are jobs
      if (jobs.length > 0) {
        console.log(`\n📋 JOB DETAILS (${currentTime}):`);
        jobs.forEach((job, i) => {
          console.log(
            `   ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`
          );
          console.log(
            `      Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
          );
          console.log(`      Created: ${job.created_at}`);
          if (job.processed_on)
            console.log(`      Started: ${job.processed_on}`);
          if (job.finished_on)
            console.log(`      Finished: ${job.finished_on}`);
          if (job.data) {
            console.log(`      Data: ${JSON.stringify(job.data, null, 6)}`);
          }
        });
      }

      // Show summary
      const statusLine = `${currentTime}\t${jobCount}\t${currentStatus}\t\t${activeJobs.length} active\t${completedJobs.length} completed, ${failedJobs.length} failed`;
      console.log(statusLine);

      // Check if job processing is complete
      if (currentStatus === "completed") {
        console.log("\n✅ JOB COMPLETED!");
        jobProcessed = true;
        break;
      } else if (currentStatus === "error") {
        console.log("\n❌ JOB FAILED!");
        if (document && document.error) {
          console.log(`   Error: ${document.error}`);
        }
        break;
      }

      lastJobCount = jobCount;

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("❌ Error monitoring progress:", error.message);
      break;
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 FINAL SUMMARY");
  console.log("=".repeat(80));
  console.log(`✅ Job created: ${jobCreated}`);
  console.log(`✅ Job processed: ${jobProcessed}`);
  console.log(`📊 Final job count: ${await getJobCount()}`);
  console.log(`📊 Final document status: ${lastDocumentStatus}`);

  return { jobCreated, jobProcessed, finalJobCount: await getJobCount() };
}

async function testJobCountMonitor() {
  try {
    console.log("🧪 Job Count Monitor Test");
    console.log("=".repeat(80));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Get test document
    const documentResult = await client.query(`
      SELECT id, name, indexing_status, dataset_id
      FROM documents 
      WHERE dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
      AND indexing_status = 'waiting'
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (documentResult.rows.length === 0) {
      throw new Error("No test document found in 'waiting' status");
    }

    const document = documentResult.rows[0];
    console.log(`📄 Test document: ${document.name} (${document.id})`);
    console.log(`📈 Initial status: ${document.indexing_status}`);

    // Check initial job count
    const initialJobCount = await getJobCount();
    console.log(`📊 Initial job count: ${initialJobCount}`);

    // Trigger graph extraction
    const extractionSuccess = await triggerGraphExtraction(document.id);
    if (!extractionSuccess) {
      throw new Error("Failed to trigger graph extraction");
    }

    // Monitor job progress with real-time counts
    const result = await monitorJobProgress(document.id);

    console.log("\n" + "=".repeat(80));
    console.log("🎯 JOB COUNT MONITOR TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`✅ Extraction triggered: ${extractionSuccess}`);
    console.log(`✅ Job created: ${result.jobCreated}`);
    console.log(`✅ Job processed: ${result.jobProcessed}`);
    console.log(`📊 Final job count: ${result.finalJobCount}`);

    if (result.jobCreated && result.jobProcessed) {
      console.log("\n🎉 SUCCESS! Job count monitoring is working perfectly!");
      console.log("💡 The frontend will now show real-time progress updates.");
    } else if (result.jobCreated) {
      console.log("\n⚠️  Job was created but not processed yet.");
      console.log("💡 Check if the queue processor is running.");
    } else {
      console.log("\n❌ Job was not created. Check job dispatch logic.");
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
  testJobCountMonitor().catch(console.error);
}

module.exports = { testJobCountMonitor };
