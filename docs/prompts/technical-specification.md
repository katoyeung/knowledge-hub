# Technical Specification: LOTR Trivia Test

## System Architecture

### Components

- **Backend**: NestJS application
- **Database**: PostgreSQL with MikroORM
- **Embeddings**: BGE-M3 (Xenova) via local provider
- **LLM**: Qwen Flash via DashScope API
- **Vector Store**: Local vector storage
- **Search**: Hybrid search with similarity scoring

### API Endpoints Used

- `POST /datasets` - Create dataset
- `POST /datasets/{id}/upload-documents` - Upload documents
- `POST /datasets/process-documents` - Process with embeddings
- `POST /chat/with-documents` - Chat with documents

## Configuration Details

### Dataset Configuration

```json
{
  "name": "Lord of the Rings Trivia Test Dataset - BGE-M3",
  "description": "Test dataset using Xenova/bge-m3 for embeddings with all three LOTR books",
  "embeddingModel": "Xenova/bge-m3",
  "embeddingModelProvider": "local"
}
```

### Document Processing

```json
{
  "datasetId": "uuid",
  "documentIds": ["uuid1", "uuid2", "uuid3"],
  "embeddingModel": "Xenova/bge-m3",
  "embeddingProvider": "local",
  "textSplitter": "recursive_character",
  "chunkSize": 1000,
  "chunkOverlap": 200
}
```

### Chat Request

```json
{
  "message": "Question text",
  "datasetId": "uuid",
  "llmProvider": "dashscope",
  "model": "qwen-flash",
  "maxChunks": 5,
  "temperature": 0.1
}
```

## Performance Metrics

### Response Time Analysis

- **Average**: 4.2 seconds
- **Range**: 3.5 - 5.1 seconds
- **Consistency**: High (low variance)
- **Bottlenecks**: LLM inference (primary), embedding search (secondary)

### Chunk Utilization

- **Target**: 5 chunks per query
- **Actual**: 4.5 chunks average
- **Efficiency**: 90% utilization
- **Quality**: 55.6% high-similarity chunks

### Accuracy Analysis

- **Overall**: 100% (10/10 questions)
- **Question Types**: All types handled correctly
- **Complexity**: Handles both simple and complex questions
- **Consistency**: No retries needed

## Model Specifications

### Qwen Flash (DashScope)

- **Provider**: Alibaba DashScope API
- **Model ID**: `qwen-flash`
- **Type**: Ultra-fast model
- **Max Tokens**: 8192
- **Context Window**: 128000
- **Pricing**: Input $0.008/1K, Output $0.02/1K

### BGE-M3 (Local)

- **Provider**: Xenova (local)
- **Model**: `Xenova/bge-m3`
- **Type**: Multilingual embedding model
- **Dimensions**: 1024
- **Performance**: High quality, fast local inference

## Test Data

### Documents

- **Volume I**: The Fellowship of the Ring.txt
- **Volume II**: The Two Towers.txt
- **Volume III**: The Return of the King.txt
- **Total Size**: ~1.2MB text
- **Processing Time**: ~30 seconds for all documents

### Questions

- **Total**: 10 trivia questions
- **Difficulty**: Mixed (simple to complex)
- **Topics**: Characters, locations, objects, events
- **Answer Types**: Names, descriptions, specific details

## Error Handling

### Retry Logic

- **Empty Response**: Automatic retry with same parameters
- **API Errors**: Graceful degradation with error logging
- **Timeout**: 15-minute test timeout
- **Rate Limiting**: 500ms delay between questions

### Validation

- **Answer Validation**: Keyword matching with special cases
- **Response Quality**: Non-empty response validation
- **Chunk Quality**: Similarity score analysis
- **Performance**: Response time tracking

## Monitoring and Logging

### Metrics Tracked

- Response time per question
- Chunk similarity scores
- Model accuracy per question
- Error rates and types
- Resource utilization

### Logging Levels

- **INFO**: Test progress, successful operations
- **WARN**: Retries, degraded performance
- **ERROR**: Failures, API errors
- **DEBUG**: Detailed chunk analysis

## Scalability Considerations

### Current Limits

- **Concurrent Users**: Not tested (single user test)
- **Document Size**: ~1.2MB (3 books)
- **Chunk Count**: 5 per query
- **Response Time**: 4.2s average

### Scaling Factors

- **More Documents**: Linear increase in processing time
- **More Users**: API rate limits may apply
- **Larger Chunks**: May improve context but increase latency
- **Different Models**: Performance varies significantly

## Security Considerations

### API Keys

- **DashScope**: Requires API key for Qwen Flash
- **Local Embeddings**: No external API calls
- **Database**: Local PostgreSQL instance

### Data Privacy

- **Documents**: Stored locally
- **Embeddings**: Generated locally
- **Chat History**: Stored in local database
- **API Calls**: Only to DashScope for LLM inference

## Maintenance

### Regular Tasks

- Monitor API key expiration
- Update model versions
- Clean up test datasets
- Review performance metrics

### Troubleshooting

- Check API key validity
- Verify model availability
- Monitor response times
- Review error logs

## Future Improvements

### Potential Optimizations

- Caching for repeated questions
- Batch processing for multiple questions
- Model fine-tuning for domain-specific tasks
- Advanced chunking strategies

### Additional Features

- Conversation memory
- Multi-turn dialogue
- Document-specific filtering
- Advanced similarity scoring
