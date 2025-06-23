# Knowledge Hub

A comprehensive knowledge management system with advanced document processing, vector search, and AI-powered features.

## 🏗️ Architecture

This is a monorepo containing:

- **Backend** (`apps/backend`): NestJS API with advanced document processing
- **Frontend** (`apps/frontend`): Next.js web application
- **CMS** (`apps/cms`): Refine.js admin interface
- **Shared Types** (`packages/shared-types`): Common TypeScript definitions

## 📚 Documentation

All documentation has been organized in the root docs directory:

**📁 [Complete Documentation](docs/README.md)**

### Quick Links

- **🚀 [Getting Started](docs/development/backend-setup.md)** - Setup and installation
- **📖 [API Reference](docs/api/document-parser-api.md)** - Complete API documentation
- **🏗️ [Architecture](docs/architecture/)** - System design and components
- **📋 [Integration Guides](docs/guides/)** - Step-by-step integration guides

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start backend development server
cd apps/backend
npm run start:dev

# Start frontend development server (new terminal)
cd apps/frontend
npm run dev
```

## 🔧 Development

Each application has its own development setup:

- **Backend**: See [Backend Setup Guide](docs/development/backend-setup.md)
- **Frontend**: See [Frontend Setup Guide](docs/development/frontend-setup.md)

## 📊 Features

- **Document Processing**: Advanced PDF parsing with RAGFlow integration
- **Vector Search**: PostgreSQL pgvector with HNSW/IVFFlat indexes
- **Hybrid Search**: Combined keyword and semantic search with ML reranking
- **Type Safety**: End-to-end TypeScript with shared type definitions
- **Real-time**: WebSocket support for live updates

For detailed feature documentation, see the [complete documentation](docs/README.md).
