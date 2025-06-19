# Document Processing System

This module implements an event-driven document processing system that automatically parses uploaded documents into segments.

## Architecture

### Event Flow

1. **Document Upload** → `DocumentService.uploadDocuments()` saves documents and emits `DOCUMENT_UPLOADED` event
2. **Event Handler** → `DocumentUploadHandler` listens for upload events and queues parsing jobs
3. **Job Processing** → `DocumentParserProcessor` processes documents and creates segments
4. **Status Updates** → Events are emitted throughout the process for monitoring

### Components

#### DocumentParserProcessor

- **Queue**: `document-processing`
- **Job Type**: `parse-document`
- **Supported Formats**: PDF, TXT, MD
- **Output**: Creates `DocumentSegment` entities

#### DocumentUploadHandler

- **Listens**: `DOCUMENT_UPLOADED` events
- **Action**: Queues parsing jobs with retry configuration

#### Events

- `DOCUMENT_UPLOADED` - Triggered when documents are uploaded
- `DOCUMENT_PROCESSING_STARTED` - Processing begins
- `DOCUMENT_PROCESSING_COMPLETED` - Processing finished successfully
- `DOCUMENT_PROCESSING_FAILED` - Processing failed
- `DOCUMENT_SEGMENTS_CREATED` - Segments were created

## Configuration

### Queue Settings

- **Attempts**: 3 retries with exponential backoff
- **Delay**: 2000ms base delay
- **Retention**: 10 completed jobs, 50 failed jobs

### Segmentation Strategy

- **Max Segment Length**: 1000 characters
- **Min Segment Length**: 100 characters
- **Method**: Split by paragraphs (double newlines)

## Dependencies

```bash
npm install pdf-parse @types/pdf-parse
```

## Usage

The system automatically processes documents when they are uploaded through the `DocumentService.uploadDocuments()` method. No manual intervention is required.

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
