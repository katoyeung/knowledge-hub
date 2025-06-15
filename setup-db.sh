#!/bin/bash

echo "🐘 Setting up PostgreSQL database for Knowledge Hub..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed!${NC}"
    echo -e "${YELLOW}📦 Install PostgreSQL first:${NC}"
    echo "   macOS: brew install postgresql@15"
    echo "   Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo "   Windows: Download from https://www.postgresql.org/download/"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL found${NC}"

# Database configuration
DB_NAME="knowledge_hub"
DB_USER="knowledge_hub_user"
DB_PASSWORD="your_secure_password"

echo -e "${YELLOW}📋 Database Configuration:${NC}"
echo "   Database: ${DB_NAME}"
echo "   User: ${DB_USER}"
echo "   Password: ${DB_PASSWORD}"
echo ""

# Create database and user
echo -e "${YELLOW}🔧 Creating database and user...${NC}"

# Try to connect as current user first, then as postgres
if psql -lqt | cut -d \| -f 1 | grep -qw template1; then
    PSQL_CMD="psql"
else
    PSQL_CMD="psql -U postgres"
fi

# Create the database and user
$PSQL_CMD -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || echo "Database ${DB_NAME} might already exist"
$PSQL_CMD -c "CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "User ${DB_USER} might already exist"
$PSQL_CMD -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
$PSQL_CMD -c "ALTER USER ${DB_USER} CREATEDB;"

echo -e "${GREEN}✅ Database setup completed!${NC}"
echo ""

# Update backend .env file
echo -e "${YELLOW}📝 Updating backend .env file...${NC}"

# Create or update the backend .env file
cat > apps/backend/.env << EOF
NODE_ENV=development
PORT=3001
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=${DB_USER}
DATABASE_PASSWORD=${DB_PASSWORD}
DATABASE_NAME=${DB_NAME}
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=$(openssl rand -base64 32)
CORS_ORIGINS=http://localhost:3000,http://localhost:3002
EOF

echo -e "${GREEN}✅ Backend .env updated with database credentials${NC}"
echo ""

# Test database connection
echo -e "${YELLOW}🔍 Testing database connection...${NC}"
if psql -h localhost -U ${DB_USER} -d ${DB_NAME} -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful!${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo "Please check your PostgreSQL installation and try again"
fi

echo ""
echo -e "${GREEN}🎯 Next steps:${NC}"
echo "1. Make sure Redis is running: brew services start redis"
echo "2. Run database migrations: cd apps/backend && npm run migration:run"
echo "3. Start the applications: npm run dev"
echo ""
echo -e "${YELLOW}📚 Database connection details:${NC}"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: ${DB_NAME}"
echo "   Username: ${DB_USER}"
echo "   Password: ${DB_PASSWORD}" 