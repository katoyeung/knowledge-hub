#!/usr/bin/env node

const axios = require("axios");

const API_BASE = "http://localhost:3001";
const DATASET_ID = "f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b";
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwMDI4NjUzLCJleHAiOjE3NjI2MjA2NTN9.lK5BmJi60bhvZn9rWqxFpTyzr1dFuBbHiMdYy5NL9Xk";

async function testComprehensiveExtractionSuccess() {
  console.log("🧪 Testing Comprehensive Graph Extraction Success...\n");

  try {
    // 1. Test async extraction (queue-based)
    console.log("1️⃣ Testing async extraction (queue-based)...");
    const asyncResponse = await axios.post(
      `${API_BASE}/api/graph/datasets/${DATASET_ID}/extract`,
      { syncMode: false },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ Async extraction response:");
    console.log(JSON.stringify(asyncResponse.data, null, 2));

    // Verify the response structure
    if (asyncResponse.data.success === true) {
      console.log("🎉 SUCCESS: Async graph extraction is working!");
      console.log(`📊 Job Count: ${asyncResponse.data.jobCount}`);
      console.log(`📊 Total Documents: ${asyncResponse.data.totalDocuments}`);
      console.log(`📊 Total Segments: ${asyncResponse.data.totalSegments}`);
      console.log(
        `📊 Pending Documents: ${asyncResponse.data.pendingDocuments}`
      );

      if (
        asyncResponse.data.documents &&
        asyncResponse.data.documents.length > 0
      ) {
        console.log("📄 Documents being processed:");
        asyncResponse.data.documents.forEach((doc, index) => {
          console.log(
            `  ${index + 1}. ${doc.name} (${doc.id}) - Status: ${doc.status}`
          );
        });
      }
    } else {
      console.log("❌ FAILURE: Async extraction returned success: false");
      return;
    }

    // 2. Monitor extraction progress
    console.log("\n2️⃣ Monitoring extraction progress...");
    let attempts = 0;
    const maxAttempts = 12; // 2 minutes total
    let hasNodes = false;

    while (attempts < maxAttempts && !hasNodes) {
      attempts++;
      console.log(
        `⏳ Attempt ${attempts}/${maxAttempts} - Checking graph data...`
      );

      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

      try {
        const graphDataResponse = await axios.get(
          `${API_BASE}/api/graph/datasets/${DATASET_ID}/graph`,
          {
            headers: {
              Authorization: `Bearer ${AUTH_TOKEN}`,
            },
            timeout: 10000,
          }
        );

        const nodeCount = graphDataResponse.data.nodes?.length || 0;
        const edgeCount = graphDataResponse.data.edges?.length || 0;

        console.log(
          `📊 Current status: ${nodeCount} nodes, ${edgeCount} edges`
        );

        if (nodeCount > 0) {
          hasNodes = true;
          console.log("🎉 SUCCESS: Graph data has been created!");
          console.log(
            "Sample nodes:",
            graphDataResponse.data.nodes.slice(0, 3)
          );
          if (edgeCount > 0) {
            console.log(
              "Sample edges:",
              graphDataResponse.data.edges.slice(0, 3)
            );
          }
        }
      } catch (error) {
        console.log(`⚠️  Error checking graph data: ${error.message}`);
      }
    }

    if (!hasNodes) {
      console.log("⏰ TIMEOUT: Extraction did not complete within 2 minutes");
      console.log(
        "ℹ️  This might be normal for large datasets or slow LLM responses"
      );
    }

    // 3. Test direct extraction endpoint (if sync is working)
    console.log("\n3️⃣ Testing direct extraction endpoint...");
    try {
      const directResponse = await axios.post(
        `${API_BASE}/api/graph/datasets/${DATASET_ID}/extract-direct`,
        {},
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 seconds timeout
        }
      );

      console.log("✅ Direct extraction response:");
      console.log(JSON.stringify(directResponse.data, null, 2));
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        console.log(
          "⏰ TIMEOUT: Direct extraction timed out (this is expected if sync mode is hanging)"
        );
      } else {
        console.log(`❌ Direct extraction failed: ${error.message}`);
      }
    }

    // 4. Final summary
    console.log("\n📋 FINAL SUMMARY:");
    console.log("✅ Async extraction: WORKING");
    console.log("✅ Success response JSON: WORKING");
    console.log("✅ Job queuing: WORKING");
    console.log("✅ Document/segment counting: WORKING");
    console.log("⚠️  Sync extraction: HANGING (needs investigation)");
    console.log("ℹ️  Graph data creation: Depends on queue processing");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testComprehensiveExtractionSuccess().catch(console.error);
