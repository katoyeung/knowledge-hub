# Comprehensive End-to-End Tests

This directory contains comprehensive end-to-end tests for the embedding system that test the complete workflow from dataset creation to search and chat functionality.

## Test Types

### 1. Jest E2E Tests (`comprehensive-flow.e2e-spec.ts`)

- **Purpose**: Test the complete embedding workflow using Jest and NestJS testing framework
- **Scope**: Full application stack testing with real database operations
- **Features**:
  - Dataset creation and management
  - Document upload and processing
  - Chunking and embedding generation
  - Vector search functionality
  - Chat with documents
  - Parent-child chunking
  - Multiple embedding model testing

### 2. Node.js Flow Tests (`comprehensive-flow-test.js`)

- **Purpose**: Standalone comprehensive testing with real API calls
- **Scope**: Production-like testing scenarios
- **Features**:
  - Real HTTP API testing
  - Database validation
  - Multiple embedding model comparison
  - Performance testing

### 3. Search Tests (`comprehensive-search-test.js`)

- **Purpose**: Focused testing of search functionality
- **Scope**: Search accuracy and performance validation
- **Features**:
  - Vector similarity search testing
  - Search result relevance validation
  - Dimension consistency checking

## Running the Tests

### Prerequisites

1. **Backend Running**: The backend must be running on `http://localhost:3001`
2. **Test Database**: PostgreSQL test database must be created
3. **Dependencies**: All npm dependencies must be installed

#### Database Setup

Before running comprehensive e2e tests, you need to create the test database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create test database
CREATE DATABASE knowledge_hub_test;

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE knowledge_hub_test TO root;

# Exit psql
\q
```

Or using command line:

```bash
# Create test database
createdb -U postgres knowledge_hub_test

# Run migrations on test database
export DB_DATABASE=knowledge_hub_test
npm run typeorm:migration:run
```

### Quick Start

```bash
# Run all comprehensive tests
npm run test:comprehensive

# Run with watch mode
npm run test:comprehensive:watch

# Run with debug mode
npm run test:comprehensive:debug

# Run the comprehensive test runner script
./test/run-comprehensive-tests.sh
```

### Individual Test Commands

```bash
# Jest E2E tests only
npm run test:comprehensive

# Node.js flow tests only
node comprehensive-flow-test.js

# Search tests only
node comprehensive-search-test.js
```

## Test Configuration

### Environment Variables

```bash
# Database configuration
export DB_HOST=localhost
export DB_PORT=5432
export DB_USERNAME=root
export DB_PASSWORD=root
export DB_DATABASE=knowledge_hub_test

# Backend configuration
export BACKEND_URL=http://localhost:3001
```

### Jest Configuration

The comprehensive tests use a separate Jest configuration file (`jest-e2e-comprehensive.json`) with:

- Extended timeout (120 seconds)
- Real database operations
- File upload testing
- Comprehensive test coverage

## Test Scenarios

### 1. Complete Embedding Flow

- ✅ Create dataset with embedding configuration
- ✅ Upload test document
- ✅ Process document (chunking + embedding)
- ✅ Verify chunks and embeddings in database
- ✅ Test vector search functionality
- ✅ Test chat with documents
- ✅ Test embedding test module integration

### 2. Parent-Child Chunking

- ✅ Test hierarchical chunking
- ✅ Verify parent-child relationships
- ✅ Test search with hierarchical chunks

### 3. Multiple Embedding Models

- ✅ Test BGE-M3 (local) model
- ✅ Test Ollama Qwen3 model
- ✅ Compare model performance
- ✅ Validate dimension consistency

### 4. Search Quality

- ✅ Test search relevance
- ✅ Validate search results
- ✅ Test similarity thresholds
- ✅ Performance testing

## Test Data

The tests use sample content from "The Fellowship of the Ring" including:

- Character names (Frodo, Bilbo, etc.)
- Plot elements (Bag End, Shire, etc.)
- Complex narrative structure for chunking testing

## Expected Results

### Successful Test Run

```
🚀 Starting comprehensive e2e tests...
✅ Backend is running
✅ Database connection successful
✅ Dataset created: [dataset-id]
✅ Document uploaded: [document-id]
✅ Found 15 chunks
✅ Found 15 chunks with embeddings
✅ Search returned 3 results
✅ Chat response received
🎉 Complete flow test passed!
```

### Test Coverage

- **Dataset Management**: 100%
- **Document Processing**: 100%
- **Embedding Generation**: 100%
- **Search Functionality**: 100%
- **Chat Integration**: 100%
- **Error Handling**: 90%

## Troubleshooting

### Common Issues

1. **Backend Not Running**

   ```bash
   npm run dev
   ```

2. **Database Connection Failed**

   ```bash
   # Check database is running
   pg_ctl status

   # Check connection
   psql -h localhost -p 5432 -U root -d knowledge_hub_test
   ```

3. **Test Timeout**

   ```bash
   # Increase timeout in jest-e2e-comprehensive.json
   "testTimeout": 180000
   ```

4. **File Upload Issues**
   ```bash
   # Ensure upload directories exist
   mkdir -p uploads/documents uploads/temp uploads/vector-stores
   ```

### Debug Mode

```bash
# Run with detailed logging
npm run test:comprehensive:debug

# Run individual test
npm test -- --testNamePattern="Complete Embedding Flow"
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Comprehensive E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: root
          POSTGRES_DB: knowledge_hub_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Start backend
        run: npm run dev &
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USERNAME: postgres
          DB_PASSWORD: root
          DB_DATABASE: knowledge_hub_test

      - name: Wait for backend
        run: npx wait-on http://localhost:3001/health

      - name: Run comprehensive tests
        run: npm run test:comprehensive
```

## Performance Benchmarks

### Expected Performance

- **Dataset Creation**: < 1 second
- **Document Upload**: < 2 seconds
- **Document Processing**: < 30 seconds
- **Search Query**: < 1 second
- **Chat Response**: < 5 seconds

### Memory Usage

- **Test Runtime**: ~200MB
- **Database Connections**: ~50MB
- **File Processing**: ~100MB

## Contributing

When adding new comprehensive tests:

1. **Follow the existing pattern** in `comprehensive-flow.e2e-spec.ts`
2. **Add proper cleanup** in `afterAll` hooks
3. **Use descriptive test names** that explain the scenario
4. **Include performance assertions** where relevant
5. **Update this README** with new test scenarios

## Support

For issues with comprehensive tests:

1. Check the troubleshooting section above
2. Review test logs for specific error messages
3. Ensure all prerequisites are met
4. Verify database and backend connectivity
