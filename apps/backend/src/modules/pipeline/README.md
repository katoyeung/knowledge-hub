# Pipeline Processing Module

A flexible, configurable data processing pipeline system that allows you to define multi-step workflows for processing document segments.

## Features

- **Flexible Step Configuration**: Define custom processing steps using JSON configuration
- **Multiple Step Types**: Built-in steps for deduplication, filtering, AI summarization, embedding generation, and graph extraction
- **Queue Integration**: Asynchronous execution using Bull queues with Redis
- **Real-time Monitoring**: Progress tracking and notifications via WebSocket
- **Error Handling**: Configurable retry logic and error recovery
- **Template System**: Create reusable pipeline templates
- **Conditional Execution**: Support for conditional step execution based on segment properties

## Architecture

### Core Components

1. **PipelineOrchestrator**: Main service for managing pipeline execution
2. **PipelineExecutor**: Handles individual step execution with error handling
3. **PipelineStepRegistry**: Registry for all available pipeline steps
4. **PipelineConfigService**: CRUD operations for pipeline configurations
5. **PipelineJob**: Queue job for asynchronous execution

### Pipeline Steps

#### Built-in Steps

1. **DuplicateSegmentStep** (`duplicate_segment`)

   - Detects and handles duplicate segments
   - Methods: content_hash, content_similarity, exact_match
   - Actions: skip, remove, merge

2. **RuleBasedFilterStep** (`rule_based_filter`)

   - Filters segments using regex patterns
   - Configurable rules with actions: remove, keep, flag
   - Support for case sensitivity and content length constraints

3. **AiSummarizationStep** (`ai_summarization`)

   - Uses AI/LLM providers to summarize long content
   - Configurable conditions for when to summarize
   - Support for multiple AI providers (OpenRouter, Ollama, etc.)

4. **EmbeddingGenerationStep** (`embedding_generation`)

   - Generates vector embeddings for segments
   - Integrates with existing embedding services
   - Support for batch processing and worker pools

5. **GraphExtractionStep** (`graph_extraction`)
   - Extracts knowledge graph entities and relationships
   - Uses AI providers for entity extraction
   - Configurable entity and relation types

## Usage

### Creating a Pipeline Configuration

```typescript
const pipelineConfig = {
  name: 'Document Processing Pipeline',
  description: 'Process documents with deduplication and summarization',
  steps: [
    {
      id: 'dedup-1',
      type: 'duplicate_segment',
      name: 'Remove Duplicates',
      config: {
        method: 'content_hash',
        action: 'remove',
      },
      order: 0,
      enabled: true,
    },
    {
      id: 'filter-1',
      type: 'rule_based_filter',
      name: 'Filter Ads',
      config: {
        rules: [
          {
            id: 'ad-filter',
            name: 'Advertisement Filter',
            pattern: '\\[AD\\]',
            action: 'remove',
          },
        ],
        defaultAction: 'keep',
      },
      order: 1,
      enabled: true,
    },
  ],
  settings: {
    errorHandling: 'retry',
    maxRetries: 3,
    parallelExecution: false,
    notifyOnCompletion: true,
  },
};
```

### Executing a Pipeline

```typescript
// Synchronous execution
const result = await pipelineOrchestrator.executePipelineSync({
  pipelineConfigId: 'pipeline-id',
  documentId: 'document-id',
  userId: 'user-id',
});

// Asynchronous execution
const result = await pipelineOrchestrator.executePipelineAsync({
  pipelineConfigId: 'pipeline-id',
  documentId: 'document-id',
  userId: 'user-id',
});
```

## API Endpoints

### Pipeline Configuration Management

- `POST /pipeline/configs` - Create pipeline configuration
- `GET /pipeline/configs` - Get all pipeline configurations
- `GET /pipeline/configs/:id` - Get pipeline configuration by ID
- `PUT /pipeline/configs/:id` - Update pipeline configuration
- `DELETE /pipeline/configs/:id` - Delete pipeline configuration

### Pipeline Execution

- `POST /pipeline/execute` - Execute pipeline asynchronously
- `POST /pipeline/execute/sync` - Execute pipeline synchronously
- `GET /pipeline/executions/:executionId` - Get execution status
- `POST /pipeline/executions/:executionId/cancel` - Cancel execution

### Pipeline Steps

- `GET /pipeline/steps` - Get all available pipeline steps
- `GET /pipeline/steps/:type` - Get step configuration schema
- `POST /pipeline/steps/:type/validate` - Validate step configuration

## Database Schema

### Pipeline Configurations

```sql
CREATE TABLE pipeline_configs (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  dataset_id UUID,
  user_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT true,
  steps JSONB NOT NULL,
  settings JSONB NOT NULL,
  is_template BOOLEAN DEFAULT false,
  tags TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Pipeline Executions

```sql
CREATE TABLE pipeline_executions (
  id UUID PRIMARY KEY,
  pipeline_config_id UUID NOT NULL,
  document_id UUID,
  dataset_id UUID,
  status VARCHAR(50) DEFAULT 'pending',
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  step_results JSONB NOT NULL,
  metrics JSONB NOT NULL,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

## Extending the Pipeline

### Creating Custom Steps

1. Extend the `BaseStep` class:

```typescript
@Injectable()
export class CustomStep extends BaseStep {
  constructor() {
    super('custom_step', 'Custom Processing Step');
  }

  async execute(inputSegments, config, context) {
    // Implementation
  }

  async validate(config) {
    // Validation logic
  }

  async rollback(rollbackData, context) {
    // Rollback logic
  }

  getMetadata() {
    return {
      name: 'Custom Step',
      description: 'Custom processing step',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        // JSON schema for configuration
      },
    };
  }
}
```

2. Register the step in the PipelineModule:

```typescript
constructor(
  private readonly stepRegistry: PipelineStepRegistry,
  private readonly customStep: CustomStep,
) {
  this.stepRegistry.registerStep(CustomStep);
}
```

## Configuration Examples

See `examples/complete-pipeline-config.json` for a comprehensive example pipeline configuration.

## Monitoring and Debugging

- Execution history is stored in the `pipeline_executions` table
- Real-time progress notifications via WebSocket
- Comprehensive logging with step-level metrics
- Error tracking and retry mechanisms

## Performance Considerations

- Use batch processing for large datasets
- Configure appropriate concurrency limits
- Monitor memory usage during AI processing
- Use worker pools for CPU-intensive operations
