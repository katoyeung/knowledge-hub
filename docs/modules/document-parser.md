# Document Parser Module

This module provides advanced PDF parsing capabilities using the RAGFlow architecture for optimal document understanding and RAG performance.

## 🧹 Recent Cleanup (2025-06-23)

### Removed Components

- ❌ **Old Queue-based Processor** - `DocumentParserProcessor` (replaced by RAGFlow)
- ❌ **Demo Files** - `demo.ts`, `embedding-integration-demo.ts` (temporary files)
- ❌ **Broken Tests** - Tests with TypeORM dependency issues
- ❌ **Integration Tests** - `embedding-integration.spec.ts`, `ragflow-pdf-parser.integration.spec.ts`

### Current Architecture

```
document-parser/
├── controllers/
│   └── document-parser.controller.ts    # REST API endpoints
├── services/
│   ├── ragflow-pdf-parser.service.ts    # Advanced RAGFlow parser
│   └── simple-pdf-parser.service.ts     # Lightweight text extraction
├── dto/
│   └── parse-pdf.dto.ts                 # Request validation
└── document-parser.module.ts            # Module definition
```

## 🚀 Features

### RAGFlow PDF Parser (Primary)

- **Deep Document Understanding** - Layout analysis and structure recognition
- **Table Extraction** - Structured data extraction from tables
- **Intelligent Segmentation** - Context-aware text chunking
- **Embedding Integration** - Optimized for RAG performance
- **Multiple Strategies** - DeepDoc, Naive, and Hybrid processing modes
- **Confidence Scoring** - Quality assessment for extracted segments

### Simple PDF Parser (Lightweight)

- **Fast Text Extraction** - Basic PDF text extraction
- **Metadata Extraction** - Document properties and statistics
- **Buffer Processing** - Memory-efficient processing

## 📡 API Endpoints

### Advanced Parsing

```bash
# RAGFlow advanced PDF parsing
POST /document-parser/parse-pdf
POST /document-parser/parse-pdf-from-path

# Embedding-optimized parsing
POST /document-parser/parse-pdf-embedding-optimized
```

### Simple Extraction

```bash
# Simple PDF content extraction
POST /document-parser/extract-pdf-content
POST /document-parser/extract-pdf-content-buffer

# Health check
POST /document-parser/admin/test
```

## 🔧 Configuration

### Embedding-Optimized Config

```typescript
{
  model: EmbeddingModel;           // BGE-M3, MixedBread, UAE-Large-V1
  textSplitter: TextSplitter;      // recursive_character, character, token, markdown, python_code
  chunkSize: number;               // 100-8000 characters
  chunkOverlap: number;            // 0-500 characters
  confidenceThreshold?: number;   // 0.0-1.0
  enableTableExtraction?: boolean;
}
```

### RAGFlow Options

```typescript
{
  extractionMethod?: 'deepdoc' | 'naive' | 'hybrid';
  enableTableExtraction?: boolean;
  enableImageExtraction?: boolean;
  segmentationStrategy?: 'paragraph' | 'sentence' | 'semantic' | 'hybrid';
  maxSegmentLength?: number;
  minSegmentLength?: number;
  overlapRatio?: number;
  confidenceThreshold?: number;
}
```

## 🧪 Testing

### Current Test Coverage

- ✅ **RAGFlow Focused Tests** - `ragflow-pdf-parser.focused.spec.ts` (14 tests)
- ✅ **Simple Parser Tests** - `simple-pdf-parser.service.spec.ts` (10 tests)
- 📊 **Total**: 24 passing tests

### Running Tests

```bash
# Run all document parser tests
npm test -- --testPathPattern=document-parser

# Run specific test files
npm test ragflow-pdf-parser.focused.spec.ts
npm test simple-pdf-parser.service.spec.ts
```

## 🔄 Migration from Old System

### Before (Queue-based)

```typescript
// Old queue-based processing
await documentQueue.add('parse-document', {
  documentId,
  filePath,
  userId,
});
```

### After (Direct API)

```typescript
// New RAGFlow parsing
const result = await fetch('/document-parser/parse-pdf-embedding-optimized', {
  method: 'POST',
  body: formData,
});
```

## 📦 Dependencies

```json
{
  "pdf-parse": "^1.1.1",
  "natural": "^6.0.0",
  "@nestjs/common": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "multer": "^1.4.5",
  "class-validator": "^0.14.0",
  "class-transformer": "^0.5.1"
}
```

## 🏗️ Future Enhancements

- [ ] **Performance Optimization** - Async processing for large documents
- [ ] **Format Support** - Word, Excel, PowerPoint parsing
- [ ] **OCR Integration** - Image-based document processing
- [ ] **Batch Processing** - Multiple document handling
- [ ] **Caching Layer** - Redis-based result caching

## 📋 Usage Examples

### Basic PDF Parsing

```bash
curl -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@document.pdf" \
  http://localhost:3000/document-parser/parse-pdf
```

### Embedding-Optimized Parsing

```bash
curl -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@document.pdf" \
  -F "embeddingConfig={\"model\":\"bge-m3\",\"textSplitter\":\"recursive_character\",\"chunkSize\":1000,\"chunkOverlap\":100}" \
  http://localhost:3000/document-parser/parse-pdf-embedding-optimized
```

## 🔍 Monitoring

### Logs

- `RagflowPdfParserService` - Advanced parsing operations
- `SimplePdfParserService` - Basic text extraction
- `DocumentParserController` - API request handling

### Metrics

- Processing time per document
- Segments created per document
- Confidence scores
- Error rates by document type

---

**Status**: ✅ Production Ready  
**Last Updated**: 2025-06-23  
**Maintainer**: Knowledge Hub Team
