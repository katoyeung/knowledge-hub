# Graph Job Testing Suite

This directory contains comprehensive tests for the graph extraction job system to verify that both direct service calls and queue jobs produce identical results.

## Test Files

### 1. `test-graph-job-direct.js`

**Purpose**: Direct database analysis without backend server

- Connects directly to the database
- Analyzes existing graph data structure
- Checks dataset and AI provider settings
- Simulates graph extraction process
- **Use when**: Backend server is not available or you want quick analysis

### 2. `test-queue-job-debug.js`

**Purpose**: Compare direct vs queue job execution

- Tests both synchronous segment extraction and asynchronous queue jobs
- Monitors job progress and completion
- Compares results between both methods
- **Use when**: Backend is running and you want to test both execution paths

### 3. `test-real-graph-job.js`

**Purpose**: Full integration test with backend server

- Starts backend server automatically
- Runs comprehensive tests comparing direct vs queue execution
- Monitors job progress in real-time
- Analyzes actual graph extraction results
- **Use when**: You want complete end-to-end testing

### 4. `test-single-graph-job.js`

**Purpose**: Comprehensive single job testing

- Tests both segment extraction and document extraction
- Monitors job progress
- Analyzes graph results in detail
- **Use when**: You want detailed analysis of a single job execution

## Quick Start

### Option 1: Quick Database Analysis (No Backend Required)

```bash
node test-graph-job-direct.js
```

### Option 2: Full Integration Test (Starts Backend Automatically)

```bash
node run-graph-test.js
```

### Option 3: Manual Testing (Backend Must Be Running)

```bash
# Terminal 1: Start backend
cd apps/backend
npm run start:dev

# Terminal 2: Run test
node test-queue-job-debug.js
```

## Test Configuration

The tests use the following configuration:

- **Dataset ID**: `f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b`
- **Auth Token**: Pre-configured for admin user
- **Database**: PostgreSQL on localhost:5432
- **API Base**: http://localhost:3001

## What the Tests Verify

### 1. **Service Call Consistency**

- Both "extract graph" action and "segment extract" action call the same `GraphExtractionService.extractFromSegments()` method
- Same parameters are passed to the service
- Same extraction logic is executed

### 2. **Result Consistency**

- Both methods produce identical graph nodes and edges
- Same node types and properties
- Same edge types and relationships
- Same confidence scores and metadata

### 3. **Execution Differences**

- **Direct Call**: Synchronous, immediate execution
- **Queue Job**: Asynchronous, background processing via Bull queue
- **Scope**: Direct processes specific segments, Queue processes all document segments

### 4. **Data Integrity**

- Graph data is properly stored in database
- Node and edge relationships are correctly established
- Properties and metadata are preserved
- No duplicate or corrupted data

## Expected Results

When both methods work correctly, you should see:

```
🔍 COMPARISON:
Direct call: X nodes, Y edges
Queue job: X nodes, Y edges
✅ Both methods produced identical results!
```

## Troubleshooting

### Backend Connection Issues

- Ensure PostgreSQL is running on localhost:5432
- Check database credentials in test files
- Verify the dataset ID exists in your database

### Queue Job Issues

- Ensure Redis is running (required for Bull queue)
- Check queue job status in database
- Monitor backend logs for job processing errors

### Graph Extraction Issues

- Verify AI provider settings in dataset
- Check prompt configuration
- Ensure sufficient API credits/access

## Test Output Example

```
🧪 Real Graph Job Test
============================================================
✅ Connected to database
📄 Document: Threads-Table 1.csv (e6b8a7aa-b4c5-4afb-b63b-868218177389)
📊 Segments: 459
📈 Status: graph_extraction_processing

🚀 Starting backend server...
✅ Backend server started
✅ Backend is ready

============================================================
🧪 TESTING: Direct vs Queue Job
============================================================

🧪 TEST 1: Direct Segment Extraction (Synchronous)
------------------------------------------------------------
✅ Direct segment extraction successful
📊 Response: {
  "success": true,
  "message": "Graph extraction completed: 3 nodes, 2 edges created",
  "nodesCreated": 3,
  "edgesCreated": 2
}

📊 Direct call analysis:
📈 Nodes created: 3
🔗 Edges created: 2

🧪 TEST 2: Document Extraction (Queue Job)
------------------------------------------------------------
✅ Document extraction job dispatched
📊 Response: {
  "success": true,
  "message": "Graph extraction job started for document",
  "documentId": "e6b8a7aa-b4c5-4afb-b63b-868218177389"
}

⏳ Monitoring job progress...
📊 Document status: graph_extraction_processing
📊 Document status: completed
✅ Job completed successfully!

📊 Queue job analysis:
📈 Additional nodes created: 3
🔗 Additional edges created: 2

🔍 COMPARISON:
Direct call: 3 nodes, 2 edges
Queue job: 3 nodes, 2 edges
✅ Both methods produced identical results!

🔍 Analysis:
----------------------------------------
📈 Nodes created: 6
🔗 Edges created: 4
✅ Graph extraction successful!

📋 Sample nodes created:
  1. 榮華月餅 (product)
     Created: Sat Oct 18 2025 10:15:23 GMT+0800 (Hong Kong Standard Time)
     Properties: {
      "confidence": 0.8,
      "normalized_name": "榮華月餅"
    }

============================================================
✅ Real graph job test completed!
============================================================
```

## Notes

- Tests automatically clean up after completion
- Backend server is started and stopped automatically
- Database connections are properly closed
- Process signals (SIGINT, SIGTERM) are handled gracefully
