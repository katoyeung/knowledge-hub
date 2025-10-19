const { Client } = require("pg");
const axios = require("axios");
const EventSource = require("eventsource");

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

async function testNotificationStream() {
  console.log("\n🔍 Testing notification stream...");

  return new Promise((resolve, reject) => {
    const clientId = `test-${Date.now()}`;
    const url = `${API_BASE}/notifications/stream?clientId=${clientId}`;

    console.log(`📡 Connecting to: ${url}`);

    const eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    });

    let connected = false;
    let messageCount = 0;
    const maxWaitTime = 10000; // 10 seconds
    const startTime = Date.now();

    const timeout = setTimeout(() => {
      eventSource.close();
      if (!connected) {
        reject(new Error("Timeout waiting for connection"));
      } else {
        resolve({ connected, messageCount });
      }
    }, maxWaitTime);

    eventSource.onopen = () => {
      console.log("✅ Connected to notification stream");
      connected = true;
      clearTimeout(timeout);
      resolve({ connected, messageCount });
    };

    eventSource.onmessage = (event) => {
      messageCount++;
      console.log(`📨 Received message ${messageCount}:`, event.data);

      try {
        const message = JSON.parse(event.data);
        console.log(`📋 Message type: ${message.type}`);
        console.log(`📋 Message data:`, JSON.stringify(message.data, null, 2));
      } catch (error) {
        console.log("📋 Raw message:", event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ EventSource error:", error);
      eventSource.close();
      reject(error);
    };

    // Close after a short time to test connection
    setTimeout(() => {
      eventSource.close();
      if (connected) {
        resolve({ connected, messageCount });
      }
    }, 3000);
  });
}

async function triggerGraphExtractionWithNotifications(documentId) {
  console.log(
    "\n🚀 Triggering graph extraction with notification monitoring..."
  );

  return new Promise((resolve, reject) => {
    const clientId = `extraction-test-${Date.now()}`;
    const url = `${API_BASE}/notifications/stream?clientId=${clientId}`;

    console.log(`📡 Connecting to notification stream: ${url}`);

    const eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    });

    let connected = false;
    let notifications = [];
    const maxWaitTime = 60000; // 60 seconds
    const startTime = Date.now();

    const timeout = setTimeout(() => {
      eventSource.close();
      resolve({ connected, notifications, timeout: true });
    }, maxWaitTime);

    eventSource.onopen = () => {
      console.log("✅ Connected to notification stream");
      connected = true;

      // Trigger graph extraction after connection
      setTimeout(async () => {
        try {
          console.log("🚀 Triggering graph extraction...");
          const response = await axios.post(
            `${API_BASE}/api/graph/documents/${documentId}/extract`,
            {
              syncMode: false,
            },
            { headers, timeout: 30000 }
          );
          console.log("✅ Graph extraction triggered");
          console.log("📊 Response:", JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(
            "❌ Graph extraction failed:",
            error.response?.data || error.message
          );
          eventSource.close();
          reject(error);
        }
      }, 1000);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        notifications.push({
          timestamp: new Date().toISOString(),
          type: message.type,
          data: message.data,
        });

        console.log(`📨 Notification ${notifications.length}:`);
        console.log(`   Type: ${message.type}`);
        console.log(`   Data:`, JSON.stringify(message.data, null, 4));

        // Check if processing is complete
        if (
          message.type === "DOCUMENT_PROCESSING_UPDATE" &&
          message.data.status === "completed"
        ) {
          console.log("✅ Document processing completed!");
          eventSource.close();
          clearTimeout(timeout);
          resolve({ connected, notifications, completed: true });
        } else if (
          message.type === "DOCUMENT_PROCESSING_UPDATE" &&
          message.data.status === "error"
        ) {
          console.log("❌ Document processing failed!");
          eventSource.close();
          clearTimeout(timeout);
          resolve({ connected, notifications, error: message.data.error });
        }
      } catch (error) {
        console.log("📋 Raw message:", event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ EventSource error:", error);
      eventSource.close();
      clearTimeout(timeout);
      reject(error);
    };
  });
}

async function monitorDocumentStatus(documentId) {
  console.log("\n⏳ Monitoring document status...");

  const startTime = Date.now();
  const maxWaitTime = 60000; // 60 seconds

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
        console.log(`📊 Document status: ${doc.indexing_status}`);

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

        if (doc.indexing_status === "completed") {
          console.log("✅ Document processing completed!");
          return { completed: true, status: doc.indexing_status };
        } else if (doc.indexing_status === "error") {
          console.log("❌ Document processing failed!");
          return {
            completed: false,
            error: doc.error,
            status: doc.indexing_status,
          };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("❌ Error monitoring document:", error.message);
      break;
    }
  }

  console.log("⏰ Timeout waiting for document processing");
  return { completed: false, timeout: true };
}

async function testNotificationSystem() {
  try {
    console.log("🧪 Notification System Test");
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
      throw new Error("Notification endpoint is not accessible");
    }

    // Test notification stream connection
    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Notification Stream Connection");
    console.log("=".repeat(60));

    const streamTest = await testNotificationStream();
    console.log(`📊 Stream test result:`, streamTest);

    // Get test document
    const document = await getTestDocument();

    // Test full notification flow with graph extraction
    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Full Notification Flow with Graph Extraction");
    console.log("=".repeat(60));

    const notificationResult = await triggerGraphExtractionWithNotifications(
      document.id
    );
    console.log(`📊 Notification result:`, {
      connected: notificationResult.connected,
      notificationCount: notificationResult.notifications.length,
      completed: notificationResult.completed,
      error: notificationResult.error,
      timeout: notificationResult.timeout,
    });

    // Monitor document status as backup
    console.log("\n" + "=".repeat(60));
    console.log("🧪 TESTING: Document Status Monitoring");
    console.log("=".repeat(60));

    const statusResult = await monitorDocumentStatus(document.id);
    console.log(`📊 Status result:`, statusResult);

    console.log("\n" + "=".repeat(60));
    console.log("📊 NOTIFICATION SYSTEM TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Backend running: ${backendRunning}`);
    console.log(`✅ Notification endpoint: ${endpointOk}`);
    console.log(`✅ Stream connection: ${streamTest.connected}`);
    console.log(`📊 Stream messages: ${streamTest.messageCount}`);
    console.log(
      `📊 Extraction notifications: ${notificationResult.notifications.length}`
    );
    console.log(`✅ Processing completed: ${statusResult.completed}`);

    if (notificationResult.notifications.length > 0) {
      console.log("\n📋 Notification Details:");
      notificationResult.notifications.forEach((notif, i) => {
        console.log(`  ${i + 1}. [${notif.timestamp}] ${notif.type}`);
        console.log(`     Data:`, JSON.stringify(notif.data, null, 4));
      });
    }

    if (streamTest.connected && notificationResult.notifications.length > 0) {
      console.log("\n✅ Notification system is working correctly!");
      console.log("💡 The frontend should receive real-time updates.");
    } else {
      console.log("\n⚠️  Notification system may have issues.");
      console.log("💡 Check backend logs and frontend console for errors.");
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
  testNotificationSystem().catch(console.error);
}

module.exports = { testNotificationSystem };
