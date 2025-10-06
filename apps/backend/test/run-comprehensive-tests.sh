#!/bin/bash

# Comprehensive Flow Test Runner
# This script runs comprehensive end-to-end tests for the embedding system

set -e

echo "🚀 Starting Comprehensive Flow Tests"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3001"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_PASSWORD="${DB_PASSWORD:-root}"
DB_DATABASE="${DB_DATABASE:-knowledge_hub}"

echo -e "${BLUE}Configuration:${NC}"
echo "  Backend URL: $BACKEND_URL"
echo "  Database: $DB_HOST:$DB_PORT/$DB_DATABASE"
echo ""

# Function to check if backend is running
check_backend() {
    echo -e "${YELLOW}Checking if backend is running...${NC}"
    if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is running${NC}"
        return 0
    else
        echo -e "${RED}❌ Backend is not running at $BACKEND_URL${NC}"
        echo "Please start the backend with: npm run dev"
        return 1
    fi
}

# Function to check database connection
check_database() {
    echo -e "${YELLOW}Checking database connection...${NC}"
    if command -v psql > /dev/null 2>&1; then
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_DATABASE" -c "SELECT 1;" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Database connection successful${NC}"
            return 0
        else
            echo -e "${RED}❌ Database connection failed${NC}"
            echo "Please check your database configuration"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  psql not found, skipping database check${NC}"
        return 0
    fi
}

# Function to run Jest comprehensive tests
run_jest_tests() {
    echo -e "${YELLOW}Running Jest comprehensive e2e tests...${NC}"
    echo ""
    
    # Run the comprehensive tests
    npm run test:comprehensive
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Jest comprehensive tests passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Jest comprehensive tests failed${NC}"
        return 1
    fi
}

# Function to run Node.js comprehensive flow test
run_node_tests() {
    echo -e "${YELLOW}Running Node.js comprehensive flow test...${NC}"
    echo ""
    
    # Check if the comprehensive flow test exists
    if [ -f "../comprehensive-flow-test.js" ]; then
        cd ..
        node comprehensive-flow-test.js
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Node.js comprehensive flow test passed${NC}"
            cd apps/backend
            return 0
        else
            echo -e "${RED}❌ Node.js comprehensive flow test failed${NC}"
            cd apps/backend
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  comprehensive-flow-test.js not found, skipping${NC}"
        return 0
    fi
}

# Function to run search test
run_search_tests() {
    echo -e "${YELLOW}Running comprehensive search test...${NC}"
    echo ""
    
    if [ -f "../comprehensive-search-test.js" ]; then
        cd ..
        node comprehensive-search-test.js
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Comprehensive search test passed${NC}"
            cd apps/backend
            return 0
        else
            echo -e "${RED}❌ Comprehensive search test failed${NC}"
            cd apps/backend
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  comprehensive-search-test.js not found, skipping${NC}"
        return 0
    fi
}

# Function to generate test report
generate_report() {
    echo ""
    echo -e "${BLUE}📊 Test Summary${NC}"
    echo "================"
    echo "Jest E2E Tests: $1"
    echo "Node Flow Tests: $2"
    echo "Search Tests: $3"
    echo ""
    
    if [ "$1" = "PASS" ] && [ "$2" = "PASS" ] && [ "$3" = "PASS" ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
        echo "The embedding system is working correctly."
        return 0
    else
        echo -e "${RED}🚨 SOME TESTS FAILED${NC}"
        echo "Please check the test output above for details."
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}Starting comprehensive test suite...${NC}"
    echo ""
    
    # Check prerequisites
    check_backend || exit 1
    check_database || exit 1
    
    # Initialize test results
    jest_result="FAIL"
    node_result="FAIL"
    search_result="FAIL"
    
    # Run Jest tests
    if run_jest_tests; then
        jest_result="PASS"
    fi
    
    echo ""
    echo "----------------------------------------"
    
    # Run Node.js tests
    if run_node_tests; then
        node_result="PASS"
    fi
    
    echo ""
    echo "----------------------------------------"
    
    # Run search tests
    if run_search_tests; then
        search_result="PASS"
    fi
    
    # Generate final report
    generate_report "$jest_result" "$node_result" "$search_result"
    
    # Exit with appropriate code
    if [ "$jest_result" = "PASS" ] && [ "$node_result" = "PASS" ] && [ "$search_result" = "PASS" ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
