# Knowledge Hub Backend

🎯 **Robust backend service for the Knowledge Hub platform**

## 📖 Documentation

📚 **All documentation has been moved to the root [`docs/`](../../docs/) directory.**

### Quick Links

- **[📋 Complete Documentation Index](../../docs/README.md)** - Start here
- **[🚀 Backend Setup Guide](../../docs/development/backend-setup.md)** - Installation & development
- **[📡 API Reference](../../docs/api/document-parser-api.md)** - API documentation
- **[🔧 Module Documentation](../../docs/modules/)** - Module-specific guides

## 🏃‍♂️ Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Run tests
npm test

# API documentation
open http://localhost:3000/api
```

## 🏗️ Project Structure

```
apps/backend/
├── src/modules/          # Feature modules
│   ├── document-parser/  # PDF parsing (RAGFlow)
│   ├── dataset/          # Dataset management
│   ├── auth/            # Authentication
│   └── ...
├── docs/ -> ../../docs/ # 📚 Documentation (moved to root)
└── README.md            # This file
```

## 🎯 Key Features

- **🤖 RAGFlow PDF Parser** - Advanced document understanding
- **🔐 Authentication & Authorization** - JWT + role-based access
- **📊 Dataset Management** - Document processing pipeline
- **⚡ Event-Driven Architecture** - Scalable processing
- **🚀 REST API** - Comprehensive endpoints

## 📋 Status

| Component          | Status              | Documentation   | Tests            |
| ------------------ | ------------------- | --------------- | ---------------- |
| Document Parser    | ✅ Production Ready | ✅ Complete     | ✅ 24/24 passing |
| Authentication     | ✅ Active           | ⚠️ Needs update | ❓ Unknown       |
| Dataset Management | ✅ Active           | ✅ Available    | ⚠️ Needs review  |

---

**📚 For detailed information, see the [documentation index](../../docs/README.md)**
