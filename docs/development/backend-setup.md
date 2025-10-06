# Backend Setup Specification

## Overview

This document specifies the setup and configuration requirements for the Knowledge Hub backend service.

## System Requirements

### Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | v18+ | Runtime environment |
| PostgreSQL | v13+ | Primary database |
| Redis | v6+ | Caching and queues |
| Docker | v20+ | Containerization (optional) |

### Environment Variables

#### Database Configuration
```bash
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=knowledge_hub
```

#### Cache Configuration
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

#### LLM Provider Configuration
```bash
# OpenRouter
OPENROUTER_API_KEY=your_openrouter_key

# Ollama (Local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=120000

# DashScope (Alibaba Cloud)
DASHSCOPE_API_KEY=your_dashscope_key
```

## Installation Process

### 1. Repository Setup
```bash
git clone <repository-url>
cd knowledge-hub
cd apps/backend
```

### 2. Dependencies Installation
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Database Setup
```bash
# Create database
createdb -U postgres knowledge_hub

# Run migrations
npm run typeorm:migration:run

# Seed initial data
npm run seed
```

### 5. Service Startup
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm run start:prod
```

## Architecture Specification

### Module Structure

```
src/
├── common/                 # Shared utilities and interfaces
│   ├── enums/             # System enumerations
│   ├── interfaces/        # Type definitions
│   ├── services/          # Shared services
│   └── validators/        # Custom validators
├── config/                # Configuration management
├── modules/               # Feature modules
│   ├── auth/             # Authentication & authorization
│   ├── chat/             # Chat functionality
│   ├── dataset/          # Dataset management
│   ├── document-parser/  # Document processing
│   └── embedding-test/   # Testing framework
└── main.ts               # Application entry point
```

### API Endpoints

#### Authentication
- `POST /auth/login` - User authentication
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Token refresh

#### Dataset Management
- `GET /datasets` - List datasets
- `POST /datasets` - Create dataset
- `PUT /datasets/:id` - Update dataset
- `DELETE /datasets/:id` - Delete dataset

#### Document Processing
- `POST /documents/upload` - Upload documents
- `POST /datasets/process-documents` - Process documents
- `GET /documents/:id/segments` - Get document segments

#### Chat Interface
- `POST /chat/with-documents` - Chat with documents
- `GET /chat/conversations` - List conversations
- `GET /chat/conversations/:id/messages` - Get conversation messages

## Testing Specification

### Test Categories

| Test Type | Command | Coverage |
|-----------|---------|----------|
| Unit Tests | `npm test` | Service logic |
| Integration Tests | `npm run test:e2e` | API endpoints |
| Embedding Tests | `npm run test:embedding` | ML functionality |
| Comprehensive Tests | `npm run test:comprehensive` | Full workflows |

### Test Database Setup
```bash
# Create test database
createdb -U postgres knowledge_hub_test

# Set test environment
export DB_DATABASE=knowledge_hub_test
npm run typeorm:migration:run
```

## Performance Specifications

### Response Time Requirements

| Endpoint | Max Response Time | Target |
|----------|------------------|---------|
| Authentication | 500ms | 200ms |
| Document Upload | 5s | 2s |
| Search Queries | 2s | 1s |
| Chat Responses | 10s | 5s |

### Resource Requirements

| Environment | CPU | Memory | Storage |
|-------------|-----|--------|---------|
| Development | 2 cores | 4GB | 20GB |
| Production | 4 cores | 8GB | 100GB |

## Security Specifications

### Authentication
- JWT-based authentication
- Token expiration: 24 hours
- Refresh token: 7 days

### Authorization
- Role-based access control (RBAC)
- Resource-level permissions
- API rate limiting

### Data Protection
- Input validation with class-validator
- SQL injection prevention via TypeORM
- XSS protection in responses

## Monitoring & Logging

### Log Levels
- `ERROR`: System errors and exceptions
- `WARN`: Warning conditions
- `INFO`: General information
- `DEBUG`: Detailed debugging information

### Metrics Collection
- Request/response times
- Error rates
- Database query performance
- Memory and CPU usage

## Deployment Specifications

### Docker Configuration
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/main"]
```

### Health Checks
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Database connection failed | Wrong credentials | Check .env configuration |
| Ollama timeout | Model too large | Increase OLLAMA_TIMEOUT |
| Memory issues | Insufficient RAM | Increase container memory |
| Slow responses | Missing indexes | Run database optimization |

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Run with debugger
npm run start:debug
```