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

async function findRunningJobs() {
  console.log("\n🔍 Finding running jobs...");

  try {
    // Find documents in processing states
    const result = await client.query(`
      SELECT id, name, indexing_status, processing_metadata, error, updated_at
      FROM documents 
      WHERE indexing_status IN ('graph_extraction_processing', 'processing', 'chunking', 'embedding', 'ner_processing')
      ORDER BY updated_at DESC
    `);

    console.log(
      `📊 Found ${result.rows.length} documents in processing states`
    );

    if (result.rows.length > 0) {
      console.log("📋 Processing documents:");
      result.rows.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.name} (${doc.id})`);
        console.log(`     Status: ${doc.indexing_status}`);
        console.log(`     Updated: ${doc.updated_at}`);
        if (doc.error) {
          console.log(`     Error: ${doc.error}`);
        }
        if (doc.processing_metadata) {
          const metadata =
            typeof doc.processing_metadata === "string"
              ? JSON.parse(doc.processing_metadata)
              : doc.processing_metadata;
          console.log(
            `     Current Stage: ${metadata.currentStage || "unknown"}`
          );
        }
      });
    }

    return result.rows;
  } catch (error) {
    console.error("❌ Error finding running jobs:", error.message);
    return [];
  }
}

async function clearQueueJobs() {
  console.log("\n🧹 Clearing queue jobs...");

  try {
    // Check if bull_jobs table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'bull_jobs'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log("⚠️  bull_jobs table does not exist, nothing to clear");
      return 0;
    }

    // Get current job count
    const countResult = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs"
    );
    const totalJobs = parseInt(countResult.rows[0].count);
    console.log(`📊 Total jobs in queue: ${totalJobs}`);

    if (totalJobs > 0) {
      // Get job status distribution
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

      // Clear all jobs
      const deleteResult = await client.query("DELETE FROM bull_jobs");
      console.log(`✅ Cleared ${deleteResult.rowCount} jobs from queue`);
    } else {
      console.log("✅ No jobs to clear");
    }

    return totalJobs;
  } catch (error) {
    console.error("❌ Error clearing queue jobs:", error.message);
    return 0;
  }
}

async function resetDocumentStatuses(documents) {
  console.log("\n🔄 Resetting document statuses...");

  if (documents.length === 0) {
    console.log("✅ No documents to reset");
    return 0;
  }

  let resetCount = 0;

  for (const doc of documents) {
    try {
      console.log(`\n🔄 Resetting document: ${doc.name} (${doc.id})`);

      // Reset document status to waiting
      await client.query(
        `UPDATE documents 
         SET indexing_status = 'waiting', 
             processing_metadata = NULL,
             error = NULL,
             processing_started_at = NULL,
             completed_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [doc.id]
      );

      console.log(`✅ Reset ${doc.name} to 'waiting' status`);
      resetCount++;
    } catch (error) {
      console.error(`❌ Failed to reset document ${doc.name}:`, error.message);
    }
  }

  console.log(`\n✅ Reset ${resetCount} documents to 'waiting' status`);
  return resetCount;
}

async function clearRedisCache() {
  console.log("\n🧹 Clearing Redis cache...");

  try {
    const redis = require("redis");
    const redisClient = redis.createClient({
      host: "localhost",
      port: 6379,
    });

    await redisClient.connect();

    // Get Redis info
    const info = await redisClient.info();
    console.log("📊 Redis info retrieved");

    // Clear all keys (be careful with this in production!)
    const keys = await redisClient.keys("*");
    if (keys.length > 0) {
      console.log(`📊 Found ${keys.length} keys in Redis`);

      // Clear Bull queue keys specifically
      const bullKeys = keys.filter(
        (key) => key.includes("bull") || key.includes("queue")
      );
      if (bullKeys.length > 0) {
        await redisClient.del(bullKeys);
        console.log(`✅ Cleared ${bullKeys.length} Bull queue keys`);
      }

      // Clear other cache keys if needed
      const cacheKeys = keys.filter(
        (key) => key.includes("cache") || key.includes("session")
      );
      if (cacheKeys.length > 0) {
        await redisClient.del(cacheKeys);
        console.log(`✅ Cleared ${cacheKeys.length} cache keys`);
      }
    } else {
      console.log("✅ No keys found in Redis");
    }

    await redisClient.disconnect();
    console.log("✅ Redis cache cleared");
    return true;
  } catch (error) {
    console.error("❌ Error clearing Redis cache:", error.message);
    return false;
  }
}

async function verifyCleanup() {
  console.log("\n🔍 Verifying cleanup...");

  try {
    // Check document statuses
    const docResult = await client.query(`
      SELECT indexing_status, COUNT(*) as count 
      FROM documents 
      GROUP BY indexing_status 
      ORDER BY count DESC
    `);

    console.log("📋 Document status distribution after cleanup:");
    docResult.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.indexing_status}: ${row.count} documents`);
    });

    // Check queue jobs
    const queueResult = await client.query(
      "SELECT COUNT(*) as count FROM bull_jobs"
    );
    const queueJobs = parseInt(queueResult.rows[0].count);
    console.log(`📊 Queue jobs remaining: ${queueJobs}`);

    // Check for any stuck processing documents
    const stuckDocs = await client.query(`
      SELECT COUNT(*) as count 
      FROM documents 
      WHERE indexing_status IN ('graph_extraction_processing', 'processing', 'chunking', 'embedding', 'ner_processing')
    `);
    const stuckCount = parseInt(stuckDocs.rows[0].count);
    console.log(`📊 Stuck processing documents: ${stuckCount}`);

    return {
      queueJobs,
      stuckCount,
      totalDocs: docResult.rows.reduce(
        (sum, row) => sum + parseInt(row.count),
        0
      ),
    };
  } catch (error) {
    console.error("❌ Error verifying cleanup:", error.message);
    return null;
  }
}

async function clearRunningJobs() {
  try {
    console.log("🧹 Clear Running Jobs");
    console.log("=".repeat(50));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      console.log(
        "⚠️  Backend is not running, but we can still clear database records"
      );
    }

    // Find running jobs
    const runningDocs = await findRunningJobs();

    // Clear queue jobs
    const clearedJobs = await clearQueueJobs();

    // Reset document statuses
    const resetDocs = await resetDocumentStatuses(runningDocs);

    // Clear Redis cache
    const redisCleared = await clearRedisCache();

    // Verify cleanup
    const verification = await verifyCleanup();

    console.log("\n" + "=".repeat(50));
    console.log("📊 CLEANUP SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`📊 Running documents found: ${runningDocs.length}`);
    console.log(`🧹 Queue jobs cleared: ${clearedJobs}`);
    console.log(`🔄 Documents reset: ${resetDocs}`);
    console.log(`🧹 Redis cleared: ${redisCleared}`);

    if (verification) {
      console.log(`📊 Queue jobs remaining: ${verification.queueJobs}`);
      console.log(`📊 Stuck documents: ${verification.stuckCount}`);
      console.log(`📊 Total documents: ${verification.totalDocs}`);
    }

    if (
      verification &&
      verification.queueJobs === 0 &&
      verification.stuckCount === 0
    ) {
      console.log("\n✅ All running jobs have been cleared successfully!");
      console.log("💡 You can now start fresh graph extraction jobs.");
    } else {
      console.log(
        "\n⚠️  Some jobs may still be running. Please check the status above."
      );
    }
  } catch (error) {
    console.error("\n❌ Clear jobs failed:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the cleanup
if (require.main === module) {
  clearRunningJobs().catch(console.error);
}

module.exports = { clearRunningJobs };
