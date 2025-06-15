#!/bin/bash

echo "🚀 Setting up Knowledge Hub environment files..."

# Backend environment
cat > apps/backend/.env << EOF
NODE_ENV=development
PORT=3001
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=knowledge_hub
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret_here
CORS_ORIGINS=http://localhost:3000,http://localhost:3002
EOF

# CMS environment  
cat > apps/cms/.env << EOF
VITE_API_URL=http://localhost:3001
EOF

# Frontend environment
cat > apps/frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:3001
EOF

echo "✅ Environment files created successfully!"
echo ""
echo "📋 Port Configuration:"
echo "   • Frontend: http://localhost:3000"
echo "   • Backend:  http://localhost:3001"  
echo "   • CMS:      http://localhost:3002"
echo ""
echo "🔧 Don't forget to:"
echo "   1. Update database credentials in apps/backend/.env"
echo "   2. Update JWT_SECRET in apps/backend/.env"
echo "   3. Start PostgreSQL and Redis services"
echo ""
echo "🎯 Ready to run: npm run dev" 