# Knowledge Hub Monorepo

A full-stack knowledge management platform built with modern technologies and organized as a monorepo using Turbo.

## Architecture

- **Backend**: NestJS API server with TypeORM and PostgreSQL (Port: 3001)
- **CMS**: Refine.dev admin interface for content management (Port: 3002)
- **Frontend**: Next.js application for end users (Port: 3000)
- **Shared Types**: tRPC-based type-safe API contracts

## Port Configuration

| Service  | Port | URL                   | Description                   |
| -------- | ---- | --------------------- | ----------------------------- |
| Frontend | 3000 | http://localhost:3000 | Main user-facing application  |
| Backend  | 3001 | http://localhost:3001 | API server and tRPC endpoints |
| CMS      | 3002 | http://localhost:3002 | Admin interface for content   |

## Tech Stack

- **Monorepo**: Turbo
- **Type Safety**: tRPC with Zod validation
- **Backend**: NestJS, TypeORM, PostgreSQL, Redis
- **CMS**: Refine.dev, Ant Design
- **Frontend**: Next.js, React 19, Tailwind CSS
- **Development**: TypeScript, ESLint, Prettier

## Project Structure

```
knowledge-hub/
├── apps/
│   ├── backend/           # NestJS API server
│   ├── cms/              # Refine.dev admin interface
│   └── frontend/         # Next.js user-facing app
├── packages/
│   └── shared-types/     # tRPC types and schemas
├── package.json          # Root package.json with workspaces
├── turbo.json            # Turbo configuration
└── README.md
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- PostgreSQL
- Redis

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd knowledge-hub
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# Quick setup - run the automated script
./setup-env.sh

# Or manually create .env files (see Environment Variables section below)
```

4. Set up your database and update credentials in `apps/backend/.env`

## Development Commands

### Run All Applications

```bash
# Start all apps in development mode
npm run dev

# Build all apps
npm run build

# Start all apps in production mode
npm start

# Run linting across all apps
npm run lint

# Run type checking across all apps
npm run type-check

# Run tests across all apps
npm run test

# Clean all build artifacts
npm run clean
```

### Individual Application Commands

#### Backend Only

```bash
# Start backend in development mode
npm run dev:backend

# Build backend
npm run build:backend

# Start backend in production mode
npm run start:backend
```

#### CMS Only

```bash
# Start CMS in development mode
npm run dev:cms

# Build CMS
npm run build:cms

# Start CMS in production mode
npm run start:cms
```

#### Frontend Only

```bash
# Start frontend in development mode
npm run dev:frontend

# Build frontend
npm run build:frontend

# Start frontend in production mode
npm run start:frontend
```

### Advanced Development

#### Using Turbo Filters

```bash
# Run commands with specific filters
turbo dev --filter=backend
turbo build --filter="frontend cms"
turbo lint --filter="!backend"
```

#### Parallel Development

```bash
# Run backend and frontend simultaneously
turbo dev --filter="backend frontend"

# Build specific apps in parallel
turbo build --filter="cms frontend"
```

## Production Deployment

### Docker Deployment

Each application includes a Dockerfile for containerized deployment:

```bash
# Build and run backend
cd apps/backend
docker build -t knowledge-hub-backend .
docker run -p 3001:3001 knowledge-hub-backend

# Build and run CMS
cd apps/cms
docker build -t knowledge-hub-cms .
docker run -p 3002:3002 knowledge-hub-cms

# Build and run frontend
cd apps/frontend
docker build -t knowledge-hub-frontend .
docker run -p 3000:3000 knowledge-hub-frontend
```

### Production Build Commands

```bash
# Build all apps for production
npm run build

# Build specific apps for production
npm run build:backend
npm run build:cms
npm run build:frontend

# Start all apps in production mode
npm start

# Start specific apps in production mode
npm run start:backend
npm run start:cms
npm run start:frontend
```

## Environment Variables

Create `.env` files in each app directory:

### Backend (`apps/backend/.env`)

```env
NODE_ENV=development
PORT=3001
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=knowledge_hub
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret
```

### CMS (`apps/cms/.env`)

```env
VITE_API_URL=http://localhost:3001
```

### Frontend (`apps/frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Type Safety with tRPC

The shared types package (`packages/shared-types`) provides:

- Type-safe API contracts
- Shared schemas and validation
- Common types across all applications

### Using Shared Types

```typescript
// In backend
import { UserSchema, ApiResponse } from "@knowledge-hub/shared-types";

// In frontend/CMS
import { User, Article } from "@knowledge-hub/shared-types";
```

## Database Setup

1. Create PostgreSQL database:

```sql
CREATE DATABASE knowledge_hub;
```

2. Run migrations (from backend directory):

```bash
cd apps/backend
npm run migration:run
```

3. Seed database (optional):

```bash
cd apps/backend
npm run seed
```

## Useful Scripts

### Code Quality

```bash
# Format code across all apps
npm run format

# Fix linting issues
npm run lint:fix

# Run type checking
npm run type-check
```

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Database (Backend)

```bash
cd apps/backend

# Generate new migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Seed database
npm run seed
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports are available (Frontend: 3000, Backend: 3001, CMS: 3002)
2. **Database connection**: Verify PostgreSQL is running and credentials are correct
3. **Redis connection**: Ensure Redis server is running
4. **Node version**: Use Node.js >= 18.0.0

### Reset Installation

```bash
# Clean all node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf package-lock.json apps/*/package-lock.json packages/*/package-lock.json
npm install
```

## Contributing

1. Follow the existing code style and conventions
2. Write tests for new features
3. Update documentation as needed
4. Use conventional commit messages

## Docker Development

### Quick Start with Docker Compose

Start all services at once:

```bash
# Start all services (backend, frontend, CMS)
docker-compose -f docker-compose.dev.yml up

# Start all services in background
docker-compose -f docker-compose.dev.yml up -d

# Stop all services
docker-compose -f docker-compose.dev.yml down
```

### Individual Service Management

#### Backend Service

```bash
# Start backend only
docker-compose -f docker-compose.dev.yml up backend

# Start backend in background
docker-compose -f docker-compose.dev.yml up backend -d

# Seed the database (run after backend is started)
docker exec -it knowledge-hub-backend sh -c "cd /workspace/apps/backend && npm run seed"

# View backend logs
docker logs knowledge-hub-backend --tail=50 -f
```

#### Frontend Service

```bash
# Start frontend only
docker-compose -f docker-compose.dev.yml up frontend

# Start frontend in background
docker-compose -f docker-compose.dev.yml up frontend -d

# View frontend logs
docker logs knowledge-hub-frontend --tail=50 -f
```

#### CMS Service

```bash
# Start CMS only
docker-compose -f docker-compose.dev.yml up cms

# Start CMS in background
docker-compose -f docker-compose.dev.yml up cms -d

# View CMS logs
docker logs knowledge-hub-cms --tail=50 -f
```

### Docker Service Management

```bash
# View status of all services
docker-compose -f docker-compose.dev.yml ps

# Restart a specific service
docker-compose -f docker-compose.dev.yml restart backend

# Rebuild and start a service
docker-compose -f docker-compose.dev.yml up --build backend

# Execute commands inside containers
docker exec -it knowledge-hub-backend bash
docker exec -it knowledge-hub-frontend sh
docker exec -it knowledge-hub-cms sh

# View logs for all services
docker-compose -f docker-compose.dev.yml logs -f

# Clean up containers and volumes
docker-compose -f docker-compose.dev.yml down -v
```

### Docker Development Workflow

1. **First time setup**:
   ```bash
   # Build and start all services
   docker-compose -f docker-compose.dev.yml up --build
   
   # In another terminal, seed the database
   docker exec -it knowledge-hub-backend sh -c "cd /workspace/apps/backend && npm run seed"
   ```

2. **Daily development**:
   ```bash
   # Start services
   docker-compose -f docker-compose.dev.yml up -d
   
   # Check logs when needed
   docker-compose -f docker-compose.dev.yml logs -f [service-name]
   
   # Stop when done
   docker-compose -f docker-compose.dev.yml down
   ```

3. **Rebuilding after changes**:
   ```bash
   # Rebuild specific service
   docker-compose -f docker-compose.dev.yml up --build [service-name]
   
   # Or rebuild all services
   docker-compose -f docker-compose.dev.yml build
   ```

## License

[Your License Here]