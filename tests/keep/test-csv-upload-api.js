#!/usr/bin/env node

const fs = require("fs");
const FormData = require("form-data");
const fetch = require("node-fetch");

async function testCsvUpload() {
  console.log("🧪 Testing CSV Upload API...\n");

  try {
    // Test 1: Get CSV templates (this will fail due to auth, but we can see the response structure)
    console.log("1️⃣ Testing CSV templates endpoint...");
    const templatesResponse = await fetch(
      "http://localhost:3001/csv-connector/templates"
    );
    console.log("   Status:", templatesResponse.status);
    console.log("   Response:", await templatesResponse.text());
    console.log("");

    // Test 2: Test CSV validation endpoint
    console.log("2️⃣ Testing CSV validation endpoint...");
    const csvPath =
      "/Users/kato/dev/fasta/hkcss/knowledge-hub/test-documents/test-social-media-data.csv";

    if (!fs.existsSync(csvPath)) {
      console.log("❌ Test CSV file not found at:", csvPath);
      return;
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(csvPath));
    formData.append("templateName", "social_media_post");

    const validateResponse = await fetch(
      "http://localhost:3001/csv-connector/validate",
      {
        method: "POST",
        body: formData,
      }
    );

    console.log("   Status:", validateResponse.status);
    console.log("   Response:", await validateResponse.text());
    console.log("");

    // Test 3: Test document upload endpoint
    console.log("3️⃣ Testing document upload endpoint...");
    const uploadFormData = new FormData();
    uploadFormData.append("files", fs.createReadStream(csvPath));
    uploadFormData.append("datasetId", "test-dataset-id");
    uploadFormData.append("docType", "csv");
    uploadFormData.append("csvConnectorType", "social_media_post");

    const uploadResponse = await fetch(
      "http://localhost:3001/documents/upload",
      {
        method: "POST",
        body: uploadFormData,
      }
    );

    console.log("   Status:", uploadResponse.status);
    console.log("   Response:", await uploadResponse.text());
    console.log("");
  } catch (error) {
    console.error("❌ Error during testing:", error.message);
  }
}

// Check if required modules are available
try {
  require("form-data");
  require("node-fetch");
  testCsvUpload();
} catch (error) {
  console.log("📦 Installing required dependencies...");
  const { execSync } = require("child_process");
  execSync("npm install form-data node-fetch", { stdio: "inherit" });
  console.log("✅ Dependencies installed, running test...");
  testCsvUpload();
}
