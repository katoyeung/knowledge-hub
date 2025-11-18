#!/bin/bash

# Test runner script for LLM Processing Job tests
# This script runs all tests related to the flexible LLM processing job architecture

set -e

echo "🧪 Running LLM Processing Job Tests"
echo "===================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directories
UNIT_TESTS_DIR="src/modules/queue/jobs/llm-processing"
E2E_TESTS_DIR="test"

echo ""
echo -e "${BLUE}📦 Running Unit Tests${NC}"
echo "-----------------------------------"

# Run unit tests for services
echo -e "${YELLOW}Testing FieldMappingService...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/services/field-mapping.service.spec.ts" --verbose

# Run unit tests for strategies
echo -e "${YELLOW}Testing Content Extraction Strategies...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/strategies/post-content-extraction-strategy.spec.ts" --verbose
npm run test -- "${UNIT_TESTS_DIR}/strategies/segment-content-extraction-strategy.spec.ts" --verbose

echo -e "${YELLOW}Testing Result Application Strategies...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/strategies/post-result-application-strategy.spec.ts" --verbose
npm run test -- "${UNIT_TESTS_DIR}/strategies/segment-result-application-strategy.spec.ts" --verbose

# Run unit tests for policies
echo -e "${YELLOW}Testing Processing Policies...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/policies/post-processing-policy.spec.ts" --verbose
npm run test -- "${UNIT_TESTS_DIR}/policies/segment-processing-policy.spec.ts" --verbose

# Run unit tests for factories
echo -e "${YELLOW}Testing Processing Policy Factory...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/factories/processing-policy-factory.spec.ts" --verbose

# Run unit tests for generic job
echo -e "${YELLOW}Testing Generic LLM Processing Job...${NC}"
npm run test -- "${UNIT_TESTS_DIR}/generic-llm-processing.job.spec.ts" --verbose

echo ""
echo -e "${BLUE}🔗 Running Integration/E2E Tests${NC}"
echo "-----------------------------------"

# Check if backend is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Backend is not running on http://localhost:3001${NC}"
    echo -e "${YELLOW}   Please start the backend before running E2E tests${NC}"
    echo -e "${YELLOW}   Run: npm run dev${NC}"
    exit 1
fi

echo -e "${YELLOW}Running E2E tests for Generic LLM Processing Job...${NC}"
npm run test:e2e -- "${E2E_TESTS_DIR}/generic-llm-processing-job.e2e-spec.ts" --verbose

echo ""
echo -e "${GREEN}✅ All tests completed!${NC}"
echo "===================================="

