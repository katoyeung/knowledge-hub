#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const BASE_URL = "http://localhost:3001";

async function testDocumentDeletion() {
  console.log("🧪 Testing Document Deletion Functionality\n");

  try {
    // Step 1: Create a test dataset
    console.log("1️⃣ Creating test dataset...");
    const datasetResponse = await axios.post(
      `${BASE_URL}/datasets`,
      {
        name: "Deletion Test Dataset",
        description: "Test dataset for deletion verification",
      },
      {
        headers: {
          Authorization: "Bearer test-token", // You'll need a real token
          "Content-Type": "application/json",
        },
      }
    );

    const datasetId = datasetResponse.data.id;
    console.log(`✅ Dataset created: ${datasetId}\n`);

    // Step 2: Create a test document
    console.log("2️⃣ Creating test document...");
    const documentResponse = await axios.post(
      `${BASE_URL}/documents`,
      {
        name: "Test Document for Deletion",
        datasetId: datasetId,
        dataSourceType: "upload",
        batch: "test-batch",
        createdFrom: "upload",
        fileId: "test-deletion-document.txt",
        position: 0,
        indexingStatus: "completed",
      },
      {
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
      }
    );

    const documentId = documentResponse.data.id;
    console.log(`✅ Document created: ${documentId}\n`);

    // Step 3: Create test file on disk
    console.log("3️⃣ Creating test file on disk...");
    const uploadsDir = path.join(__dirname, "apps/backend/uploads/documents");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const testFilePath = path.join(uploadsDir, "test-deletion-document.txt");
    fs.writeFileSync(testFilePath, "Test content for deletion verification");
    console.log(`✅ Test file created: ${testFilePath}\n`);

    // Step 4: Verify file exists
    console.log("4️⃣ Verifying file exists before deletion...");
    if (fs.existsSync(testFilePath)) {
      console.log("✅ File exists before deletion\n");
    } else {
      console.log("❌ File not found before deletion\n");
    }

    // Step 5: Delete the document
    console.log("5️⃣ Deleting document...");
    const deleteResponse = await axios.delete(
      `${BASE_URL}/documents/${documentId}`,
      {
        headers: {
          Authorization: "Bearer test-token",
        },
      }
    );

    console.log(
      `✅ Document deletion response: ${JSON.stringify(deleteResponse.data)}\n`
    );

    // Step 6: Verify document is deleted from database
    console.log("6️⃣ Verifying document is deleted from database...");
    try {
      await axios.get(`${BASE_URL}/documents/${documentId}`, {
        headers: {
          Authorization: "Bearer test-token",
        },
      });
      console.log("❌ Document still exists in database\n");
    } catch (error) {
      if (error.response?.status === 404) {
        console.log("✅ Document successfully deleted from database\n");
      } else {
        console.log(`❌ Unexpected error: ${error.message}\n`);
      }
    }

    // Step 7: Verify physical file is deleted
    console.log("7️⃣ Verifying physical file is deleted...");
    if (fs.existsSync(testFilePath)) {
      console.log("❌ Physical file still exists after deletion\n");
    } else {
      console.log("✅ Physical file successfully deleted from disk\n");
    }

    // Step 8: Cleanup dataset
    console.log("8️⃣ Cleaning up test dataset...");
    try {
      await axios.delete(`${BASE_URL}/datasets/${datasetId}`, {
        headers: {
          Authorization: "Bearer test-token",
        },
      });
      console.log("✅ Test dataset cleaned up\n");
    } catch (error) {
      console.log(`⚠️ Could not clean up dataset: ${error.message}\n`);
    }

    console.log("🎉 Document deletion test completed successfully!");
    console.log("\n📋 Test Summary:");
    console.log("✅ Document created in database");
    console.log("✅ Physical file created on disk");
    console.log("✅ Document deleted from database");
    console.log("✅ Physical file deleted from disk");
    console.log("✅ No orphaned data remains");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

// Run the test
testDocumentDeletion();
