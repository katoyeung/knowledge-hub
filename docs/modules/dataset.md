# Dataset Module

This module provides CRUD operations for managing datasets, documents, document segments, and related entities in the Knowledge Hub backend.

## Entities

### Dataset

- **Table**: `datasets`
- **Description**: Main dataset entity containing metadata and configuration
- **Key Fields**: name, description, provider, permission, indexing configuration
- **Relationships**:
  - Belongs to User (owner)
  - Has many Documents
  - Has many DocumentSegments
  - Has one DatasetKeywordTable

### Document

- **Table**: `documents`
- **Description**: Individual documents within a dataset
- **Key Fields**: name, position, indexing status, file metadata
- **Relationships**:
  - Belongs to Dataset
  - Belongs to User (creator)
  - Has many DocumentSegments

### DocumentSegment

- **Table**: `document_segments`
- **Description**: Text segments extracted from documents for indexing
- **Key Fields**: content, position, tokens, keywords
- **Relationships**:
  - Belongs to Dataset
  - Belongs to Document
  - Belongs to User (creator)

### DatasetKeywordTable

- **Table**: `dataset_keyword_tables`
- **Description**: Keyword extraction table for datasets
- **Key Fields**: keywordTable, dataSourceType
- **Relationships**:
  - Belongs to Dataset (one-to-one)

### Embedding

- **Table**: `embeddings`
- **Description**: Vector embeddings for text content
- **Key Fields**: modelName, hash, embedding vector, providerName

## API Endpoints

### Datasets

- `GET /datasets` - List all datasets
- `GET /datasets/:id` - Get dataset by ID
- `POST /datasets` - Create new dataset
- `PUT /datasets/:id` - Update dataset
- `DELETE /datasets/:id` - Delete dataset

### Documents

- `GET /documents` - List all documents
- `GET /documents/:id` - Get document by ID
- `POST /documents` - Create new document
- `PUT /documents/:id` - Update document
- `DELETE /documents/:id` - Delete document

## Services

### DatasetService

- Extends `TypeOrmCrudService<Dataset>`
- Provides additional methods:
  - `findByOwnerId(ownerId: string)` - Get datasets by owner
  - `getDatasetWithDetails(id: string)` - Get dataset with all relations
  - `getDatasetsByUser(userId: string)` - Get user's datasets

### DocumentService

- Extends `TypeOrmCrudService<Document>`
- Provides additional methods:
  - `findByDatasetId(datasetId: string)` - Get documents by dataset
  - `getDocumentsByStatus(status: string)` - Get documents by indexing status
  - `updateIndexingStatus(id: string, status: string)` - Update document status

## DTOs

### CreateDatasetDto

- Validation for creating new datasets
- Includes enums for DataSourceType, IndexingTechnique, Permission
- Required fields: name, ownerId
- Optional fields: description, provider, configuration options

### CreateDocumentDto

- Validation for creating new documents
- Required fields: datasetId, position, dataSourceType, batch, name, createdFrom, creatorId
- Optional fields: metadata, processing timestamps, status flags

## Permissions

The module uses the `DATASET` resource for permission checks. Users need appropriate permissions to:

- Create datasets/documents
- Read datasets/documents
- Update datasets/documents
- Delete datasets/documents

## Usage Example

```typescript
// Inject the service
constructor(private readonly datasetService: DatasetService) {}

// Create a new dataset
const dataset = await this.datasetService.create({
  name: 'My Dataset',
  description: 'A sample dataset',
  ownerId: 'user-uuid',
  permission: Permission.ONLY_ME,
  dataSourceType: DataSourceType.FILE
});

// Get datasets for a user
const userDatasets = await this.datasetService.getDatasetsByUser('user-uuid');
```

## Database Migrations

Make sure to run database migrations to create the required tables:

```bash
npm run migration:run
```

The entities are configured to work with PostgreSQL and use UUID primary keys with automatic timestamp tracking.
