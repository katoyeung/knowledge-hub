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
    const response = await axios.get(`${API_BASE}/notifications/stream`, {
      headers,
      timeout: 5000,
    });
    console.log("✅ Notification endpoint accessible:", response.status);
    return true;
  } catch (error) {
    console.error(
      "❌ Notification endpoint failed:",
      error.response?.status || error.message
    );
    return false;
  }
}

async function getTestDocument() {
  console.log("\n🔍 Finding test document...");

  const result = await client.query(
    `SELECT d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata,
            COUNT(ds.id) as segment_count
     FROM documents d
     LEFT JOIN document_segments ds ON d.id = ds.document_id
     WHERE d.dataset_id = 'f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b'
     AND d.indexing_status = 'waiting'
     GROUP BY d.id, d.name, d.indexing_status, d.dataset_id, d.processing_metadata
     ORDER BY d.created_at DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new Error("No test document found in 'waiting' status");
  }

  const document = result.rows[0];
  console.log(`📄 Test document: ${document.name} (${document.id})`);
  console.log(`📊 Segments: ${document.segment_count}`);
  console.log(`📈 Status: ${document.indexing_status}`);

  return document;
}

async function triggerGraphExtraction(documentId) {
  console.log("\n🚀 Triggering graph extraction...");

  try {
    const response = await axios.post(
      `${API_BASE}/api/graph/documents/${documentId}/extract`,
      {
        syncMode: false,
      },
      { headers, timeout: 30000 }
    );
    console.log("✅ Graph extraction triggered");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(
      "❌ Graph extraction failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function monitorDocumentStatus(documentId, maxWaitTime = 60000) {
  console.log("\n⏳ Monitoring document status...");

  const startTime = Date.now();
  let lastStatus = null;
  let lastMetadata = null;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await client.query(
        `SELECT id, name, indexing_status, processing_metadata, error, updated_at
         FROM documents 
         WHERE id = $1`,
        [documentId]
      );

      if (result.rows.length > 0) {
        const doc = result.rows[0];
        const status = doc.indexing_status;
        const metadata = doc.processing_metadata;

        if (
          status !== lastStatus ||
          JSON.stringify(metadata) !== JSON.stringify(lastMetadata)
        ) {
          console.log(
            `\n📊 Status Update at ${new Date().toLocaleTimeString()}:`
          );
          console.log(`   Document Status: ${status}`);

          if (metadata) {
            const parsedMetadata =
              typeof metadata === "string" ? JSON.parse(metadata) : metadata;
            console.log(
              `   Processing Metadata:`,
              JSON.stringify(parsedMetadata, null, 4)
            );
          }

          if (doc.error) {
            console.log(`   Error: ${doc.error}`);
          }

          lastStatus = status;
          lastMetadata = metadata;
        }

        if (status === "completed") {
          console.log("\n✅ Document processing completed!");
          return { completed: true, status };
        } else if (status === "error") {
          console.log("\n❌ Document processing failed!");
          return { completed: false, error: doc.error, status };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("❌ Error monitoring document:", error.message);
      break;
    }
  }

  console.log("\n⏰ Timeout waiting for document processing");
  return { completed: false, timeout: true };
}

async function checkNotificationServiceInBackend() {
  console.log("\n🔍 Checking notification service in backend...");

  try {
    // Check if notification service is properly configured
    const response = await axios.get(`${API_BASE}/api/queue/status`, {
      headers,
    });
    console.log("✅ Queue status accessible:", response.status);

    // Check if we can get job registry
    const jobResponse = await axios.get(`${API_BASE}/api/queue/jobs`, {
      headers,
    });
    console.log("✅ Job registry accessible:", jobResponse.status);
    console.log("📋 Registered jobs:", jobResponse.data);

    return true;
  } catch (error) {
    console.error(
      "❌ Backend services check failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function testNotificationSystem() {
  try {
    console.log("🧪 Simple Notification System Test");
    console.log("=".repeat(60));

    await connectDatabase();

    // Check backend health
    const backendRunning = await checkBackendHealth();
    if (!backendRunning) {
      throw new Error("Backend is not running. Please start it first.");
    }

    // Test notification endpoint
    const endpointOk = await testNotificationEndpoint();
    if (!endpointOk) {
      console.log(
        "⚠️  Notification endpoint not accessible, but continuing..."
      );
    }

    // Check backend services
    const servicesOk = await checkNotificationServiceInBackend();
    if (!servicesOk) {
      console.log(
        "⚠️  Some backend services not accessible, but continuing..."
      );
    }

    // Get test document
    const document = await getTestDocument();

    // Trigger graph extraction
    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Graph Extraction with Status Monitoring");
    console.log("=".repeat(60));

    const extractionResult = await triggerGraphExtraction(document.id);

    // Monitor document status
    const statusResult = await monitorDocumentStatus(document.id);

    console.log("\n" + "=".repeat(60));
    console.log("📊 NOTIFICATION SYSTEM TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`✅ Notification endpoint: ${endpointOk}`);
    console.log(`✅ Backend services: ${servicesOk}`);
    console.log(`✅ Processing completed: ${statusResult.completed}`);
    console.log(`📊 Final status: ${statusResult.status || "unknown"}`);

    if (statusResult.completed) {
      console.log("\n✅ Graph extraction completed successfully!");
      console.log(
        "💡 The notification system should be working if the frontend is connected."
      );
    } else if (statusResult.error) {
      console.log("\n❌ Graph extraction failed:", statusResult.error);
    } else {
      console.log(
        "\n⚠️  Graph extraction may still be processing or timed out."
      );
    }

    console.log("\n💡 To test frontend notifications:");
    console.log("   1. Open the frontend in a browser");
    console.log(
      "   2. Check the browser console for notification connection logs"
    );
    console.log("   3. Look for 'Connected to notification stream' messages");
    console.log(
      "   4. Trigger a graph extraction and watch for real-time updates"
    );
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
  testNotificationSystem().catch(console.error);
}

module.exports = { testNotificationSystem };
