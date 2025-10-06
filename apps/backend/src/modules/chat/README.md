# Chat Module

This module provides chat functionality for the knowledge hub, allowing users to have conversations with their datasets using different LLM providers.

## Features

- **Document-based Chat**: Chat with specific documents or document segments
- **Multiple LLM Providers**: Support for OpenAI, OpenRouter, and Perplexity
- **Conversation History**: Persistent chat history with conversation management
- **Hybrid Search Integration**: Uses the existing hybrid search service for document retrieval
- **Source Attribution**: Tracks which document segments were used to generate responses

## API Endpoints

### POST /chat/with-documents

Start or continue a chat conversation with documents.

**Request Body:**

```json
{
  "message": "What is the main topic of this document?",
  "datasetId": "uuid",
  "documentIds": ["uuid1", "uuid2"], // Optional: specific documents
  "segmentIds": ["uuid1", "uuid2"], // Optional: specific segments
  "llmProvider": "openai", // openai, openrouter, perplexity
  "model": "gpt-4", // Optional: specific model
  "maxChunks": 5, // Optional: max segments to retrieve
  "temperature": 0.7, // Optional: LLM temperature
  "conversationId": "uuid", // Optional: continue existing conversation
  "conversationTitle": "My Chat" // Optional: title for new conversation
}
```

**Response:**

```json
{
  "message": {
    "id": "uuid",
    "content": "The main topic is...",
    "role": "assistant",
    "status": "completed",
    "createdAt": "2024-01-01T00:00:00Z",
    "sourceChunkIds": "[\"uuid1\", \"uuid2\"]",
    "sourceDocuments": "[\"doc1\", \"doc2\"]",
    "metadata": {
      "tokensUsed": 150,
      "model": "gpt-4",
      "provider": "openai"
    }
  },
  "conversationId": "uuid",
  "sourceChunks": [
    {
      "id": "uuid1",
      "content": "Document content...",
      "documentId": "doc1",
      "documentName": "Document 1",
      "similarity": 0.95
    }
  ],
  "metadata": {
    "tokensUsed": 150,
    "processingTime": 1200,
    "model": "gpt-4",
    "provider": "openai"
  }
}
```

### GET /chat/conversations

Get all conversations for the authenticated user.

**Query Parameters:**

- `datasetId` (optional): Filter by dataset

### GET /chat/conversations/:conversationId/messages

Get all messages in a specific conversation.

## Entities

### ChatConversation

- `id`: Unique identifier
- `title`: Conversation title
- `description`: Optional description
- `selectedDocumentIds`: Array of document IDs for this conversation
- `selectedSegmentIds`: Array of segment IDs for this conversation
- `userId`: Owner of the conversation
- `datasetId`: Associated dataset
- `messages`: Related chat messages

### ChatMessage

- `id`: Unique identifier
- `content`: Message content
- `role`: user, assistant, or system
- `status`: pending, completed, or failed
- `sourceChunkIds`: JSON string of source chunk IDs
- `sourceDocuments`: JSON string of source document IDs
- `metadata`: Additional metadata (tokens used, model, etc.)
- `userId`: Message author
- `datasetId`: Associated dataset
- `conversationId`: Parent conversation

## Usage Example

```typescript
// Start a new chat
const response = await chatService.chatWithDocuments(
  {
    message: 'What are the key findings?',
    datasetId: 'dataset-uuid',
    documentIds: ['doc1', 'doc2'],
    llmProvider: 'openai',
    model: 'gpt-4',
    maxChunks: 5,
  },
  userId,
);

// Continue existing conversation
const response2 = await chatService.chatWithDocuments(
  {
    message: 'Can you elaborate on that?',
    datasetId: 'dataset-uuid',
    conversationId: response.conversationId,
    llmProvider: 'openai',
  },
  userId,
);
```

## Configuration

The module requires the following environment variables for LLM providers:

- `OPENAI_API_KEY`: OpenAI API key
- `OPENROUTER_API_KEY`: OpenRouter API key
- `PERPLEXITY_API_KEY`: Perplexity API key

## Dependencies

- Dataset Module: For document and segment retrieval
- Hybrid Search Service: For semantic search
- API Client Factory: For LLM provider management
- TypeORM: For database operations
