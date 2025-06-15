# Knowledge Hub CMS

Content Management System for Knowledge Hub - A comprehensive platform for managing knowledge base articles, workflows, datasets, and content.

## Features

- 📝 **Content Management**: Create and manage articles and posts
- 🔄 **Workflow Management**: Visual workflow editor and management
- 📊 **Dataset Management**: Upload and organize datasets
- 💬 **Prompt Management**: Manage AI prompts and templates
- 📋 **Logging & Monitoring**: Track system activities and logs
- 👥 **User Management**: Manage user accounts and permissions

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 8
- Backend API running on port 3001 (or configured VITE_API_URL)

### Environment Variables

Create a `.env` file in the CMS root directory:

```env
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=Knowledge Hub CMS
```

## Available Scripts

### Development

```bash
npm run dev
```

Runs the development server on `http://localhost:5173`

### Building for production

```bash
npm run build
```

### Running the production server

```bash
npm run start
```

### Type checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Configuration

The CMS uses the following API endpoints:

- **Auth**: `/auth/login`, `/auth/logout`, `/auth/me`
- **Users**: `/users`
- **Posts**: `/posts`
- **Workflows**: `/workflows`
- **Prompts**: `/prompts`
- **Datasets**: `/datasets`
- **Logger**: `/logger`

## Architecture

Built with:

- **React 18** - UI framework
- **Refine** - Admin panel framework
- **Ant Design** - UI components
- **Vite** - Build tool
- **TypeScript** - Type safety
- **React Router v6** - Routing
