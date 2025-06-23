# Document Processing System

This module provides queue infrastructure for document processing. The actual document parsing has been moved to the `document-parser` module which uses the advanced RAGFlow parser.

## Architecture

### Current Status

**⚠️ DEPRECATED**: The old `DocumentParserProcessor` has been removed and replaced with the advanced RAGFlow PDF parser in the `document-parser` module.

### Migration Path

For document processing, use the new endpoints in the `document-parser` module:

- `POST /document-parser/parse-pdf` - RAGFlow advanced PDF parsing
- `POST /document-parser/parse-pdf-embedding-optimized` - Embedding-optimized parsing
- `POST /document-parser/extract-pdf-content` - Simple PDF content extraction

### Components

#### DocumentUploadHandler

- **Listens**: `DOCUMENT_UPLOADED` events
- **Action**: Currently disabled - documents are processed manually through the new workflow

#### Queue Infrastructure

- **Queue**: `document-processing` (maintained for future use)
- **Status**: Active but no processors currently registered

#### Events

- `DOCUMENT_UPLOADED` - Triggered when documents are uploaded
- `DOCUMENT_PROCESSING_STARTED` - Processing begins
- `DOCUMENT_PROCESSING_COMPLETED` - Processing finished successfully
- `DOCUMENT_PROCESSING_FAILED` - Processing failed
- `DOCUMENT_SEGMENTS_CREATED` - Segments were created

## New Document Processing Workflow

### RAGFlow Parser Features

- **Advanced PDF Understanding**: Deep document analysis with layout recognition
- **Table Extraction**: Structured data extraction from tables
- **Intelligent Segmentation**: Context-aware text chunking
- **Embedding Integration**: Optimized for RAG performance
- **Multiple Strategies**: DeepDoc, Naive, and Hybrid processing modes

### Configuration

The new system supports embedding-optimized configuration:

```typescript
{
  model: EmbeddingModel;
  textSplitter: TextSplitter;
  chunkSize: number;
  chunkOverlap: number;
  confidenceThreshold?: number;
  enableTableExtraction?: boolean;
}
```

## Dependencies

Queue infrastructure:

```bash
npm install @nestjs/bull bull
```

For document parsing, see the `document-parser` module dependencies.

## Usage

### New Workflow

1. Upload documents through the dataset service
2. Use the `document-parser` endpoints for processing
3. Configure embedding settings for optimal RAG performance

### Legacy Support

The queue infrastructure remains available for future enhancements but the old processor has been removed.

### Monitoring

Check logs for processing status:

- `DocumentUploadHandler` - Event handling
- `DocumentParserProcessor` - Job processing
- Document status in database (`indexingStatus` field)

### Status Values

- `waiting` - Document uploaded, waiting for processing
- `parsing` - Currently being processed
- `parsed` - Successfully processed
- `failed` - Processing failed
