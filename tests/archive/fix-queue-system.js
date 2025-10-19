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

async function checkRedisConnection() {
  console.log("\n🔍 Checking Redis connection...");

  try {
    const redis = require("redis");
    const redisClient = redis.createClient({
      host: "localhost",
      port: 6379,
    });

    await redisClient.connect();
    const pong = await redisClient.ping();
    console.log("✅ Redis is running:", pong);
    await redisClient.disconnect();
    return true;
  } catch (error) {
    console.error("❌ Redis connection failed:", error.message);
    console.log("💡 Please ensure Redis is running: redis-server");
    return false;
  }
}

async function createBullJobsTable() {
  console.log("\n🔧 Creating bull_jobs table...");

  try {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS bull_jobs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        data JSONB,
        opts JSONB,
        progress INTEGER DEFAULT 0,
        delay BIGINT DEFAULT 0,
        timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        attempts_made INTEGER DEFAULT 0,
        processed_on BIGINT,
        finished_on BIGINT,
        failed_reason TEXT,
        stacktrace TEXT,
        returnvalue JSONB,
        status VARCHAR(50) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await client.query(createTableSQL);
    console.log("✅ bull_jobs table created successfully");

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bull_jobs_status ON bull_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_bull_jobs_name ON bull_jobs(name);
      CREATE INDEX IF NOT EXISTS idx_bull_jobs_timestamp ON bull_jobs(timestamp);
    `);
    console.log("✅ Indexes created successfully");

    return true;
  } catch (error) {
    console.error("❌ Failed to create bull_jobs table:", error.message);
    return false;
  }
}

async function checkQueueSystem() {
  console.log("\n🔍 Checking queue system configuration...");

  try {
    // Check if Bull queue is properly configured
    const response = await axios.get(`${API_BASE}/health`, { headers });
    console.log("✅ Backend health check passed");

    // Try to trigger a simple job to test the queue
    console.log("🧪 Testing queue system with a simple job...");

    const testResponse = await axios.post(
      `${API_BASE}/api/graph/datasets/f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b/extract`,
      {
        syncMode: false,
        aiProviderId: "29779ca1-cd3a-4ab5-9959-09f59cf918d5",
        model: "llama4:scout",
      },
      { headers, timeout: 10000 }
    );

    console.log("✅ Queue job dispatched successfully");
    console.log("📊 Response:", JSON.stringify(testResponse.data, null, 2));

    return true;
  } catch (error) {
    console.error(
      "❌ Queue system test failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function checkWaitingDocuments() {
  console.log("\n🔍 Checking waiting documents...");

  try {
    const result = await client.query(`
      SELECT id, name, indexing_status, created_at, updated_at
      FROM documents 
      WHERE indexing_status = 'waiting' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`📊 Found ${result.rows.length} documents in 'waiting' status`);

    if (result.rows.length > 0) {
      console.log("📋 Waiting documents:");
      result.rows.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.name} (${doc.id})`);
        console.log(`     Created: ${doc.created_at}`);
        console.log(`     Updated: ${doc.updated_at}`);
      });

      // Try to process the first waiting document
      const firstDoc = result.rows[0];
      console.log(`\n🚀 Attempting to process document: ${firstDoc.name}`);

      try {
        const processResponse = await axios.post(
          `${API_BASE}/api/documents/${firstDoc.id}/process`,
          {},
          { headers, timeout: 30000 }
        );

        console.log("✅ Document processing triggered");
        console.log(
          "📊 Response:",
          JSON.stringify(processResponse.data, null, 2)
        );
      } catch (processError) {
        console.error(
          "❌ Failed to process document:",
          processError.response?.data || processError.message
        );
      }
    }

    return result.rows.length;
  } catch (error) {
    console.error("❌ Error checking waiting documents:", error.message);
    return 0;
  }
}

async function monitorQueueJobs() {
  console.log("\n⏳ Monitoring queue jobs...");

  try {
    // Wait a bit for jobs to be created
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const result = await client.query(`
      SELECT id, name, status, progress, attempts_made, created_at, processed_on, finished_on
      FROM bull_jobs 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    if (result.rows.length > 0) {
      console.log("📋 Recent queue jobs:");
      result.rows.forEach((job, i) => {
        console.log(`  ${i + 1}. ${job.name} (${job.status}) - ID: ${job.id}`);
        console.log(
          `     Progress: ${job.progress}%, Attempts: ${job.attempts_made}`
        );
        console.log(`     Created: ${job.created_at}`);
        if (job.processed_on)
          console.log(`     Started: ${new Date(job.processed_on)}`);
        if (job.finished_on)
          console.log(`     Finished: ${new Date(job.finished_on)}`);
      });
    } else {
      console.log("⚠️  No jobs found in queue");
    }

    return result.rows.length;
  } catch (error) {
    console.error("❌ Error monitoring queue jobs:", error.message);
    return 0;
  }
}

async function fixQueueSystem() {
  try {
    console.log("🔧 Queue System Fix");
    console.log("=".repeat(50));

    await connectDatabase();

    // Check Redis connection
    const redisOk = await checkRedisConnection();
    if (!redisOk) {
      console.log("\n❌ Redis is not running. Please start Redis first:");
      console.log("   brew services start redis");
      console.log("   or");
      console.log("   redis-server");
      return;
    }

    // Create bull_jobs table
    const tableCreated = await createBullJobsTable();
    if (!tableCreated) {
      console.log("\n❌ Failed to create bull_jobs table");
      return;
    }

    // Check queue system
    const queueOk = await checkQueueSystem();
    if (!queueOk) {
      console.log("\n❌ Queue system is not working properly");
      return;
    }

    // Check waiting documents
    const waitingCount = await checkWaitingDocuments();

    // Monitor queue jobs
    const jobCount = await monitorQueueJobs();

    console.log("\n" + "=".repeat(50));
    console.log("📊 SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Redis: ${redisOk ? "Running" : "Not running"}`);
    console.log(`✅ Bull jobs table: ${tableCreated ? "Created" : "Failed"}`);
    console.log(`✅ Queue system: ${queueOk ? "Working" : "Not working"}`);
    console.log(`📊 Waiting documents: ${waitingCount}`);
    console.log(`📊 Queue jobs: ${jobCount}`);

    if (redisOk && tableCreated && queueOk) {
      console.log("\n✅ Queue system is now properly configured!");
      console.log(
        "💡 You can now run graph extraction jobs and they should be processed."
      );
    } else {
      console.log(
        "\n❌ Queue system still has issues. Please check the errors above."
      );
    }
  } catch (error) {
    console.error("\n❌ Fix failed:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the fix
if (require.main === module) {
  fixQueueSystem().catch(console.error);
}

module.exports = { fixQueueSystem };
