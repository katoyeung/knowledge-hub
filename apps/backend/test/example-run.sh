#!/bin/bash

# Example script showing how to run comprehensive e2e tests
# This demonstrates the complete workflow

echo "🧪 Comprehensive E2E Test Example"
echo "================================="

# Step 1: Start the backend (in background)
echo "1. Starting backend..."
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
echo "   Waiting for backend to start..."
sleep 10

# Check if backend is running
if curl -s http://localhost:3001/health > /dev/null; then
    echo "   ✅ Backend is running"
else
    echo "   ❌ Backend failed to start"
    kill $BACKEND_PID
    exit 1
fi

# Step 2: Run comprehensive tests
echo ""
echo "2. Running comprehensive e2e tests..."
npm run test:comprehensive

# Check test results
if [ $? -eq 0 ]; then
    echo "   ✅ All tests passed!"
else
    echo "   ❌ Some tests failed"
fi

# Step 3: Cleanup
echo ""
echo "3. Cleaning up..."
kill $BACKEND_PID
echo "   ✅ Backend stopped"

echo ""
echo "🎉 Test run completed!"
