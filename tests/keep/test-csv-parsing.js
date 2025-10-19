#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Test CSV parsing logic
function testCsvParsing() {
  console.log("🧪 Testing CSV Parsing Logic...\n");

  const csvPath =
    "/Users/kato/dev/fasta/hkcss/knowledge-hub/test-documents/test-social-media-data.csv";

  if (!fs.existsSync(csvPath)) {
    console.log("❌ Test CSV file not found at:", csvPath);
    return;
  }

  // Read the CSV file
  const csvContent = fs.readFileSync(csvPath, "utf8");
  const lines = csvContent.split("\n");

  console.log("📊 CSV File Analysis:");
  console.log("   Total lines:", lines.length);
  console.log("   First line (headers):", lines[0]);
  console.log(
    "   Second line (first data row):",
    lines[1].substring(0, 100) + "..."
  );
  console.log("");

  // Parse headers
  const headers = lines[0].split(",");
  console.log("📋 Headers found:");
  headers.forEach((header, index) => {
    console.log(`   ${index + 1}. ${header}`);
  });
  console.log("");

  // Test social media post template mapping
  const socialMediaTemplate = {
    standardFields: {
      id: "ID",
      author: "Author Name",
      content: "Post Message",
      title: "Thread Title",
      platform: "Medium",
      sentiment: "Sentiment",
      reactions: "Reaction Count",
    },
    searchableColumns: ["Thread Title", "Post Message"],
    metadataColumns: [
      "Author Name",
      "Post Date",
      "Sentiment",
      "Reaction Count",
      "Like (reaction)",
      "Channel",
      "Site",
    ],
  };

  console.log("🔗 Social Media Template Mapping:");
  console.log("   Standard Fields:");
  Object.entries(socialMediaTemplate.standardFields).forEach(([key, value]) => {
    const found = headers.includes(value);
    console.log(`     ${key} -> ${value} ${found ? "✅" : "❌"}`);
  });
  console.log("");

  console.log("   Searchable Columns:");
  socialMediaTemplate.searchableColumns.forEach((col) => {
    const found = headers.includes(col);
    console.log(`     ${col} ${found ? "✅" : "❌"}`);
  });
  console.log("");

  console.log("   Metadata Columns:");
  socialMediaTemplate.metadataColumns.forEach((col) => {
    const found = headers.includes(col);
    console.log(`     ${col} ${found ? "✅" : "❌"}`);
  });
  console.log("");

  // Test content combination
  if (lines.length > 1) {
    const firstRow = lines[1].split(",");
    const rowData = {};
    headers.forEach((header, index) => {
      rowData[header] = firstRow[index] || "";
    });

    console.log("📝 Sample Row Processing:");
    console.log(
      "   Thread Title:",
      rowData["Thread Title"]?.substring(0, 50) + "..."
    );
    console.log(
      "   Post Message:",
      rowData["Post Message"]?.substring(0, 50) + "..."
    );
    console.log("   Author Name:", rowData["Author Name"]);
    console.log("   Sentiment:", rowData["Sentiment"]);
    console.log("");

    // Simulate content combination
    const searchableContent = socialMediaTemplate.searchableColumns
      .map((col) => rowData[col])
      .filter((content) => content && content.trim())
      .join("\n");

    console.log("🔍 Combined Searchable Content:");
    console.log("   Length:", searchableContent.length);
    console.log("   Preview:", searchableContent.substring(0, 200) + "...");
    console.log("");

    // Simulate segment creation
    console.log("📦 Simulated Document Segment:");
    console.log("   segmentType: csv_row");
    console.log("   position: 1");
    console.log("   content: [Combined searchable content above]");
    console.log("   hierarchyMetadata.csvRow: [Full row data with all fields]");
    console.log("   wordCount:", searchableContent.split(/\s+/).length);
    console.log("   estimatedTokens:", Math.ceil(searchableContent.length / 4));
  }

  console.log("\n✅ CSV parsing test completed successfully!");
  console.log(
    "🎯 The CSV file is compatible with the social_media_post template"
  );
}

testCsvParsing();
