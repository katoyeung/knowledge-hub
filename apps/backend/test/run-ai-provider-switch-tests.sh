#!/bin/bash

# AI Provider Switch E2E Test Runner
# This script runs the AI provider switching tests to verify chat settings resolution

echo "🔧 AI Provider Switch E2E Test Runner"
echo "======================================"

# Check if backend is running
echo "🔍 Checking if backend is running..."
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Backend is not running on localhost:3001"
    echo "Please start the backend server first:"
    echo "  cd apps/backend && npm run start:dev"
    exit 1
fi

echo "✅ Backend is running"

# Run the AI provider switch tests
echo "🚀 Running AI provider switch tests..."
echo ""

cd "$(dirname "$0")"

# Run the specific test file
npm run test:e2e -- --testPathPattern=ai-provider-switch.e2e-spec.ts --verbose

echo ""
echo "🎉 AI provider switch tests completed!"
echo ""
echo "Test scenarios covered:"
echo "1. Empty dataset and user chat settings (system defaults)"
echo "2. Empty dataset but user chat settings exist (user settings)"
echo "3. Both dataset and user chat settings exist (dataset precedence)"
