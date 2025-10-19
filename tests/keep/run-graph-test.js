#!/usr/bin/env node

const { testRealGraphJob } = require("./test-real-graph-job");

console.log("🧪 Graph Job Test Runner");
console.log("=".repeat(50));

// Check if backend is already running
const axios = require("axios");

async function checkBackendStatus() {
  try {
    await axios.get("http://localhost:3001/health", { timeout: 2000 });
    console.log("✅ Backend is already running");
    return true;
  } catch (error) {
    console.log("⚠️  Backend is not running, will start it");
    return false;
  }
}

async function main() {
  try {
    const backendRunning = await checkBackendStatus();

    if (backendRunning) {
      console.log("🚀 Running test with existing backend...");
    } else {
      console.log("🚀 Starting backend and running test...");
    }

    await testRealGraphJob();
  } catch (error) {
    console.error("❌ Test runner failed:", error.message);
    process.exit(1);
  }
}

main();
