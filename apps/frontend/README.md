# Knowledge Hub Frontend

Next.js web application for the Knowledge Hub platform.

## 🚀 Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📚 Documentation

For complete setup and development documentation, see:

**[📖 Frontend Setup Guide](../docs/development/frontend-setup.md)**

## 🏗️ Project Structure

This is a Next.js project with:

- **App Router**: Modern Next.js routing
- **TypeScript**: Full type safety
- **Shared Types**: Common types from `@knowledge-hub/shared-types`
- **tRPC Integration**: Type-safe API calls

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📡 API Integration

The frontend integrates with the Knowledge Hub backend through:

- **tRPC**: Type-safe API calls with auto-completion
- **REST API**: Direct HTTP calls for specific use cases

For API documentation, see [API Reference](../docs/api/document-parser-api.md).

## 🎨 Tech Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **tRPC**: Type-safe API client
- **Tailwind CSS**: Utility-first styling
- **Geist Font**: Optimized font loading

## 📖 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [tRPC Documentation](https://trpc.io/docs/)
