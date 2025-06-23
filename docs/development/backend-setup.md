# Knowledge Hub Backend

A robust backend service for the Knowledge Hub platform, built with NestJS and TypeScript.

## Features

- User authentication and authorization
- Role-based access control
- File storage and management
- Event-driven architecture
- Caching system
- Queue management
- Scheduled tasks
- API documentation

## Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- TypeORM
- Redis (for caching)
- Bull (for queues)
- JWT (for authentication)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- PostgreSQL
- Redis
- Docker (optional)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-org/knowledge-hub-backend.git
cd knowledge-hub-backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

4. Start the development server:

```bash
npm run start:dev
```

### Docker Setup

```bash
docker-compose up -d
```

## API Documentation

Once the server is running, you can access the API documentation at:

- Swagger UI: http://localhost:3000/api
- OpenAPI JSON: http://localhost:3000/api-json

## Development

### Database Migrations

```bash
# Generate a migration
npm run typeorm migration:generate

# Run migrations
npm run typeorm migration:run

# Revert last migration
npm run typeorm migration:revert
```

### Testing

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Project Structure

```
src/
├── common/           # Common utilities and shared code
├── config/           # Configuration files
├── database/         # Database migrations and seeds
├── modules/          # Feature modules
│   ├── auth/        # Authentication
│   ├── user/        # User management
│   ├── access/      # Access control
│   ├── storage/     # File storage
│   ├── event/       # Event handling
│   ├── queue/       # Queue management
│   └── scheduler/   # Scheduled tasks
└── main.ts          # Application entry point
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```

```
