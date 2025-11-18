#!/bin/bash

# Test runner script for Chinese Post LLM Processing E2E Test
# This test uses:
# - AI Provider: Crumplete AI (Ollama)
# - Model: llama3.3:70b
# - Prompt: Detect Social Media Post
# - Post Title: "老豆開礦？錢，自己印？幫洗？"

set -e

echo "🧪 Running Chinese Post LLM Processing E2E Test"
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}📋 Test Configuration:${NC}"
echo "   AI Provider: Crumplete AI (Ollama)"
echo "   Model: llama3.3:70b"
echo "   Prompt: Detect Social Media Post"
echo "   Post Title: 老豆開礦？錢，自己印？幫洗？"
echo ""

# Check if backend is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Backend is not running on http://localhost:3001${NC}"
    echo -e "${YELLOW}   Please start the backend before running E2E tests${NC}"
    echo -e "${YELLOW}   Run: npm run dev${NC}"
    exit 1
fi

# Check if CRUMPLETE_API_KEY is set
if [ -z "$CRUMPLETE_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  CRUMPLETE_API_KEY environment variable is not set${NC}"
    echo -e "${YELLOW}   This test requires a valid API key for Crumplete AI${NC}"
    echo -e "${YELLOW}   Set it with: export CRUMPLETE_API_KEY=your-api-key${NC}"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}🚀 Running E2E test...${NC}"
echo ""

# Run the test
cd "$(dirname "$0")/.."
npm run test:e2e -- test/chinese-post-llm-processing.e2e-spec.ts --verbose

echo ""
echo -e "${GREEN}✅ Test completed!${NC}"
echo "================================================"

