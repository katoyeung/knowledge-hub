# Comprehensive E2E Tests - Setup & Usage Guide

## ✅ Issues Fixed

All compilation and configuration issues have been resolved:

1. ✅ **Jest Configuration**: Fixed `moduleNameMapping` error (changed to `moduleNameMapping`)
2. ✅ **FormData Import**: Removed unused FormData import that was causing compilation errors
3. ✅ **Embedding Dimensions**: Removed reference to non-existent `dimensions` property
4. ✅ **Module Path Mapping**: Added proper `moduleNameMapper` for `@modules/*` and `@common/*` paths
5. ✅ **Test Filtering**: Configured Jest to only run comprehensive flow tests

## 📁 Files Created

- `test/comprehensive-flow.e2e-spec.ts` - Main comprehensive e2e test file
- `test/jest-e2e-comprehensive.json` - Jest configuration for comprehensive tests
- `test/jest-e2e-setup.ts` - Jest setup file
- `test/run-comprehensive-tests.sh` - Shell script to run all tests
- `test/example-run.sh` - Example usage script
- `test/README-comprehensive-e2e.md` - Comprehensive documentation

## 🚀 Quick Start

### 1. Create Test Database

```bash
# Create test database
createdb -U postgres knowledge_hub_test

# OR using psql
psql -U postgres -c "CREATE DATABASE knowledge_hub_test;"

# Run migrations on test database
export DB_DATABASE=knowledge_hub_test
npm run typeorm:migration:run
```

### 2. Start Backend

```bash
# In terminal 1 - start the backend
npm run dev
```

### 3. Run Comprehensive Tests

```bash
# In terminal 2 - run the tests
npm run test:comprehensive
```

## 📊 Test Coverage

The comprehensive e2e tests cover:

### ✅ Complete Embedding Flow

- Dataset creation with embedding configuration
- Document upload via file upload
- Document processing (chunking + embedding)
- Database validation of chunks and embeddings
- Vector search functionality
- Chat with documents integration

### ✅ Parent-Child Chunking

- Hierarchical chunk structure
- Parent-child relationship validation
- Search with parent-child chunks

### ✅ Multiple Embedding Models

- BGE-M3 (local) model
- Ollama Qwen3 model (if available)
- Model performance comparison
- Dimension consistency validation

## 🎯 Available Commands

```bash
# Run comprehensive tests
npm run test:comprehensive

# Run with watch mode (auto-rerun on changes)
npm run test:comprehensive:watch

# Run with debug mode (more detailed output)
npm run test:comprehensive:debug

# Run the comprehensive test runner script
./test/run-comprehensive-tests.sh
```

## 📝 Environment Variables

```bash
# Database configuration
export DB_HOST=localhost
export DB_PORT=5432
export DB_USERNAME=root
export DB_PASSWORD=root
export DB_DATABASE=knowledge_hub_test

# Backend URL
export BACKEND_URL=http://localhost:3001
```

## 🔍 What's Different from Unit Tests?

| Aspect              | Unit Tests                   | Comprehensive E2E Tests          |
| ------------------- | ---------------------------- | -------------------------------- |
| **Scope**           | Individual functions/methods | Complete application workflow    |
| **Database**        | Mocked repositories          | Real database operations         |
| **API Calls**       | Mocked services              | Real HTTP requests to backend    |
| **File Operations** | Mocked file system           | Real file uploads and processing |
| **Embeddings**      | Mocked embedding generation  | Real embedding model inference   |
| **Search**          | Mocked search results        | Real vector search queries       |
| **Purpose**         | Verify logic correctness     | Verify end-to-end integration    |

## 🛠️ Troubleshooting

### Test Database Doesn't Exist

```bash
# Error: database "knowledge_hub_test" does not exist

# Solution: Create the test database
createdb -U postgres knowledge_hub_test
export DB_DATABASE=knowledge_hub_test
npm run typeorm:migration:run
```

### Backend Not Running

```bash
# Error: connect ECONNREFUSED localhost:3001

# Solution: Start the backend
npm run dev
```

### Module Path Errors

```bash
# Error: Cannot find module '@modules/...'

# Solution: The moduleNameMapper in jest-e2e-comprehensive.json
# should handle this. If it persists, check tsconfig.json paths.
```

### Timeout Errors

```bash
# Error: Timeout - Async callback was not invoked within timeout

# Solution: The tests are set to 120s timeout. If still timing out:
# 1. Check backend is responding
# 2. Check database connectivity
# 3. Increase timeout in jest-e2e-comprehensive.json
```

## 📚 Additional Documentation

- **Full Documentation**: `test/README-comprehensive-e2e.md`
- **Example Usage**: `test/example-run.sh`
- **Test Runner**: `test/run-comprehensive-tests.sh`

## 🎉 Success Indicators

When tests run successfully, you'll see:

```
🚀 Starting comprehensive e2e tests...
Database: localhost:5432/knowledge_hub_test

📁 Creating test dataset...
✅ Dataset created: [uuid]

📄 Uploading test document...
✅ Document uploaded: [uuid]

🔪 Processing document...
✅ Document processing started

⏳ Waiting for processing to complete...

🔍 Verifying chunks...
✅ Found 15 chunks
✅ Chunks contain expected content

🧠 Verifying embeddings...
✅ Found 15 chunks with embeddings
✅ Embeddings have correct properties

🔍 Testing search...
✅ Search returned 3 results
✅ Search results contain relevant content

💬 Testing chat...
✅ Chat response received

🧪 Testing embedding test module...
✅ Embedding test module works correctly

🎉 Complete flow test passed!

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

## 🔄 CI/CD Integration

The comprehensive tests are ready for CI/CD integration. See `test/README-comprehensive-e2e.md` for GitHub Actions examples.

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review test logs for specific error messages
3. Ensure all prerequisites are met
4. Verify database and backend connectivity
