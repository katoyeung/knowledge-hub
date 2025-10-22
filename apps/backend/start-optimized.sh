#!/bin/bash

# Load performance environment variables
if [ -f "./performance.env" ]; then
  export $(cat ./performance.env | xargs)
  echo "✅ Loaded performance environment variables from ./performance.env"
  echo "📊 Configuration:"
  echo "   - Worker Pool Enabled: $EMBEDDING_WORKER_POOL_ENABLED"
  echo "   - Worker Count: $EMBEDDING_WORKER_COUNT"
  echo "   - Queue Concurrency: $QUEUE_CONCURRENCY"
  echo "   - Max Concurrent Jobs: $MAX_CONCURRENT_JOBS"
  echo "   - HTTP Request Priority: $HTTP_REQUEST_PRIORITY"
else
  echo "⚠️  Warning: ./performance.env not found. Using default environment."
fi

echo ""
echo "🚀 Starting backend with CPU throttling and worker pool optimizations..."
echo ""

# Build the application first
echo "🔨 Building the application..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed. Exiting."
  exit 1
fi

echo ""
echo "🎯 Starting backend server..."
echo ""

# Start the application
npm run dev
