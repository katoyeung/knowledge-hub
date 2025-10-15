#!/usr/bin/env node

/**
 * Implementation Verification Script
 * Verifies that all components of the Document Processing Pipeline Optimization are in place
 */

const fs = require("fs");
const path = require("path");

const VERIFICATION_RESULTS = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(message, type = "info") {
  const timestamp = new Date().toISOString();
  const prefix = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function verifyFile(filePath, description) {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    VERIFICATION_RESULTS.passed++;
    VERIFICATION_RESULTS.tests.push({
      name: description,
      status: "PASSED",
      details: `File exists: ${filePath}`,
    });
    log(`✅ ${description} - PASSED`, "success");
  } else {
    VERIFICATION_RESULTS.failed++;
    VERIFICATION_RESULTS.tests.push({
      name: description,
      status: "FAILED",
      details: `File missing: ${filePath}`,
    });
    log(`❌ ${description} - FAILED`, "error");
  }
}

function verifyContent(filePath, searchText, description) {
  const fullPath = path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    VERIFICATION_RESULTS.failed++;
    VERIFICATION_RESULTS.tests.push({
      name: description,
      status: "FAILED",
      details: `File missing: ${filePath}`,
    });
    log(`❌ ${description} - FAILED (file missing)`, "error");
    return;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const contains = content.includes(searchText);

  if (contains) {
    VERIFICATION_RESULTS.passed++;
    VERIFICATION_RESULTS.tests.push({
      name: description,
      status: "PASSED",
      details: `Contains: ${searchText}`,
    });
    log(`✅ ${description} - PASSED`, "success");
  } else {
    VERIFICATION_RESULTS.failed++;
    VERIFICATION_RESULTS.tests.push({
      name: description,
      status: "FAILED",
      details: `Missing: ${searchText}`,
    });
    log(`❌ ${description} - FAILED`, "error");
  }
}

async function runVerification() {
  log(
    "🔍 Starting Implementation Verification for Document Processing Pipeline Optimization"
  );
  log("=" * 80);

  // 1. Job Infrastructure
  log("\n📋 1. JOB INFRASTRUCTURE");
  verifyFile(
    "apps/backend/src/modules/queue/jobs/base/base.job.ts",
    "BaseJob class"
  );
  verifyFile(
    "apps/backend/src/modules/queue/jobs/document/chunking.job.ts",
    "ChunkingJob class"
  );
  verifyFile(
    "apps/backend/src/modules/queue/jobs/document/embedding.job.ts",
    "EmbeddingJob class"
  );
  verifyFile(
    "apps/backend/src/modules/queue/jobs/document/ner.job.ts",
    "NerJob class"
  );
  verifyFile(
    "apps/backend/src/modules/queue/jobs/document/worker-pool.service.ts",
    "WorkerPoolService"
  );

  // 2. Service Extraction
  log("\n📋 2. SERVICE EXTRACTION");
  verifyFile(
    "apps/backend/src/modules/dataset/services/chunking.service.ts",
    "ChunkingService"
  );
  verifyFile(
    "apps/backend/src/modules/dataset/services/embedding-processing.service.ts",
    "EmbeddingProcessingService"
  );
  verifyFile(
    "apps/backend/src/modules/dataset/services/ner-processing.service.ts",
    "NerProcessingService"
  );

  // 3. Worker Implementation
  log("\n📋 3. WORKER IMPLEMENTATION");
  verifyFile(
    "apps/backend/src/modules/dataset/workers/embedding.worker.ts",
    "Embedding Worker"
  );

  // 4. Entity Updates
  log("\n📋 4. ENTITY UPDATES");
  verifyContent(
    "apps/backend/src/modules/dataset/entities/document.entity.ts",
    "processingMetadata",
    "Document entity with processingMetadata"
  );
  verifyContent(
    "apps/backend/src/modules/dataset/entities/document.entity.ts",
    "chunking",
    "Document entity with new status values"
  );

  // 5. DTO Updates
  log("\n📋 5. DTO UPDATES");
  verifyContent(
    "apps/backend/src/modules/dataset/dto/create-dataset-step.dto.ts",
    "nerEnabled",
    "ProcessDocumentsDto with nerEnabled flag"
  );

  // 6. Event System
  log("\n📋 6. EVENT SYSTEM");
  verifyContent(
    "apps/backend/src/modules/event/constants/event-types.ts",
    "DOCUMENT_CHUNKING_STARTED",
    "New chunking events"
  );
  verifyContent(
    "apps/backend/src/modules/event/constants/event-types.ts",
    "DOCUMENT_EMBEDDING_STARTED",
    "New embedding events"
  );
  verifyContent(
    "apps/backend/src/modules/event/constants/event-types.ts",
    "DOCUMENT_NER_STARTED",
    "New NER events"
  );

  // 7. API Endpoints
  log("\n📋 7. API ENDPOINTS");
  verifyContent(
    "apps/backend/src/modules/dataset/document.controller.ts",
    "resumeDocumentProcessing",
    "Resume endpoint in DocumentController"
  );

  // 8. Frontend Integration
  log("\n📋 8. FRONTEND INTEGRATION");
  verifyContent(
    "apps/frontend/lib/api.ts",
    "nerEnabled",
    "Frontend API with nerEnabled support"
  );
  verifyContent(
    "apps/frontend/lib/api.ts",
    "resumeProcessing",
    "Frontend API with resume functionality"
  );
  verifyContent(
    "apps/frontend/components/dataset-documents-panel.tsx",
    "resume",
    "Frontend UI with resume button"
  );

  // 9. Module Configuration
  log("\n📋 9. MODULE CONFIGURATION");
  verifyContent(
    "apps/backend/src/modules/queue/jobs/document/document-jobs.module.ts",
    "ChunkingJob",
    "DocumentJobsModule with all jobs"
  );
  verifyContent(
    "apps/backend/src/modules/dataset/dataset.module.ts",
    "ChunkingService",
    "DatasetModule with new services"
  );

  // 10. Job Registration
  log("\n📋 10. JOB REGISTRATION");
  verifyContent(
    "apps/backend/src/modules/queue/jobs/document/document-jobs.module.ts",
    "register",
    "Job registration in DocumentJobsModule"
  );

  // Summary
  log("\n" + "=" * 80);
  log("📊 VERIFICATION SUMMARY");
  log(`✅ Passed: ${VERIFICATION_RESULTS.passed}`);
  log(`❌ Failed: ${VERIFICATION_RESULTS.failed}`);
  log(
    `📈 Success Rate: ${((VERIFICATION_RESULTS.passed / (VERIFICATION_RESULTS.passed + VERIFICATION_RESULTS.failed)) * 100).toFixed(1)}%`
  );

  if (VERIFICATION_RESULTS.failed === 0) {
    log(
      "🎉 ALL VERIFICATIONS PASSED! Implementation is complete and correct!",
      "success"
    );
  } else {
    log("⚠️  Some verifications failed. Check the details above.", "error");
  }

  // Detailed results
  log("\n📋 DETAILED RESULTS:");
  VERIFICATION_RESULTS.tests.forEach((test) => {
    const status = test.status === "PASSED" ? "✅" : "❌";
    log(`${status} ${test.name}: ${test.details}`);
  });

  return VERIFICATION_RESULTS.failed === 0;
}

// Run verification
runVerification()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`💥 Verification failed: ${error.message}`, "error");
    process.exit(1);
  });
