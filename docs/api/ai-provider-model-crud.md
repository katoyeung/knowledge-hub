# AI Provider Model CRUD Operations

This guide explains how to perform CRUD (Create, Read, Update, Delete) operations on models within AI providers.

## Overview

AI providers contain an array of models stored as JSONB in the database. Each model has the following structure:

```typescript
interface AiProviderModel {
  id: string; // Unique model identifier
  name: string; // Display name for the model
  description?: string; // Optional description
  maxTokens?: number; // Maximum tokens the model can handle
  contextWindow?: number; // Context window size
  pricing?: {
    // Optional pricing information
    input: number; // Cost per input token
    output: number; // Cost per output token
  };
}
```

## API Endpoints

### 1. Get All Models for a Provider

```http
GET /ai-providers/{providerId}/models
Authorization: Bearer {token}
```

**Response:**

```json
[
  {
    "id": "gpt-4o",
    "name": "GPT-4o",
    "description": "OpenAI GPT-4o model",
    "maxTokens": 128000,
    "contextWindow": 128000,
    "pricing": {
      "input": 5,
      "output": 15
    }
  },
  {
    "id": "gpt-4o-mini",
    "name": "GPT-4o Mini",
    "description": "OpenAI GPT-4o Mini model",
    "maxTokens": 128000,
    "contextWindow": 128000,
    "pricing": {
      "input": 0.15,
      "output": 0.6
    }
  }
]
```

### 2. Get a Specific Model

```http
GET /ai-providers/{providerId}/models/{modelId}
Authorization: Bearer {token}
```

**Response:**

```json
{
  "id": "gpt-4o",
  "name": "GPT-4o",
  "description": "OpenAI GPT-4o model",
  "maxTokens": 128000,
  "contextWindow": 128000,
  "pricing": {
    "input": 5,
    "output": 15
  }
}
```

### 3. Add a New Model

```http
POST /ai-providers/{providerId}/models
Authorization: Bearer {token}
Content-Type: application/json

{
  "id": "gpt-4-turbo",
  "name": "GPT-4 Turbo",
  "description": "OpenAI GPT-4 Turbo model",
  "maxTokens": 128000,
  "contextWindow": 128000,
  "pricing": {
    "input": 10,
    "output": 30
  }
}
```

**Response:**

```json
{
  "id": "provider-uuid",
  "name": "OpenAI",
  "type": "openai",
  "apiKey": "",
  "baseUrl": "https://api.openai.com/v1",
  "isActive": true,
  "models": [
    // ... existing models
    {
      "id": "gpt-4-turbo",
      "name": "GPT-4 Turbo",
      "description": "OpenAI GPT-4 Turbo model",
      "maxTokens": 128000,
      "contextWindow": 128000,
      "pricing": {
        "input": 10,
        "output": 30
      }
    }
  ],
  "createdAt": "2025-01-09T20:57:00.473Z",
  "updatedAt": "2025-01-09T20:57:00.473Z"
}
```

### 4. Update an Existing Model

```http
PATCH /ai-providers/{providerId}/models/{modelId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "GPT-4 Turbo (Updated)",
  "description": "Updated description",
  "pricing": {
    "input": 8,
    "output": 24
  }
}
```

**Response:** Returns the updated AI provider with the modified model.

### 5. Remove a Model

```http
DELETE /ai-providers/{providerId}/models/{modelId}
Authorization: Bearer {token}
```

**Response:** Returns the AI provider without the removed model.

## Frontend Usage

### Using the API Client

```typescript
import { aiProviderApi, type AiProviderModel } from "@/lib/api";

// Get all models for a provider
const models = await aiProviderApi.getModels("provider-id");

// Get a specific model
const model = await aiProviderApi.getModel("provider-id", "model-id");

// Add a new model
const newModel: AiProviderModel = {
  id: "gpt-4-turbo",
  name: "GPT-4 Turbo",
  description: "OpenAI GPT-4 Turbo model",
  maxTokens: 128000,
  contextWindow: 128000,
  pricing: {
    input: 10,
    output: 30,
  },
};

const updatedProvider = await aiProviderApi.addModel("provider-id", newModel);

// Update a model
const updatedProvider = await aiProviderApi.updateModel(
  "provider-id",
  "model-id",
  {
    name: "Updated Model Name",
    pricing: {
      input: 8,
      output: 24,
    },
  }
);

// Remove a model
const updatedProvider = await aiProviderApi.removeModel(
  "provider-id",
  "model-id"
);
```

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';
import { aiProviderApi, type AiProviderModel } from '@/lib/api';

interface ModelManagerProps {
  providerId: string;
}

export function ModelManager({ providerId }: ModelManagerProps) {
  const [models, setModels] = useState<AiProviderModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModels();
  }, [providerId]);

  const loadModels = async () => {
    try {
      const modelsData = await aiProviderApi.getModels(providerId);
      setModels(modelsData);
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setLoading(false);
    }
  };

  const addModel = async (modelData: AiProviderModel) => {
    try {
      await aiProviderApi.addModel(providerId, modelData);
      await loadModels(); // Refresh the list
    } catch (error) {
      console.error('Error adding model:', error);
    }
  };

  const updateModel = async (modelId: string, updates: Partial<AiProviderModel>) => {
    try {
      await aiProviderApi.updateModel(providerId, modelId, updates);
      await loadModels(); // Refresh the list
    } catch (error) {
      console.error('Error updating model:', error);
    }
  };

  const removeModel = async (modelId: string) => {
    try {
      await aiProviderApi.removeModel(providerId, modelId);
      await loadModels(); // Refresh the list
    } catch (error) {
      console.error('Error removing model:', error);
    }
  };

  if (loading) return <div>Loading models...</div>;

  return (
    <div>
      <h3>Models</h3>
      {models.map((model) => (
        <div key={model.id} className="model-item">
          <h4>{model.name}</h4>
          <p>{model.description}</p>
          <p>Max Tokens: {model.maxTokens}</p>
          {model.pricing && (
            <p>Pricing: ${model.pricing.input}/${model.pricing.output} per token</p>
          )}
          <button onClick={() => removeModel(model.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

## Alternative Method: Using Provider Update

You can also manage models by updating the entire AI provider:

```typescript
// Get current provider
const provider = await aiProviderApi.getById("provider-id");

// Add a new model
const updatedProvider = await aiProviderApi.update("provider-id", {
  models: [
    ...provider.models,
    {
      id: "new-model",
      name: "New Model",
      description: "A new model",
      maxTokens: 8192,
      contextWindow: 8192,
      pricing: {
        input: 1,
        output: 2,
      },
    },
  ],
});

// Remove a model
const updatedProvider = await aiProviderApi.update("provider-id", {
  models: provider.models.filter((model) => model.id !== "model-to-remove"),
});
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `201` - Created (for new models)
- `400` - Bad Request (invalid data, duplicate model ID)
- `401` - Unauthorized (invalid token)
- `404` - Not Found (provider or model not found)
- `500` - Internal Server Error

Example error response:

```json
{
  "statusCode": 400,
  "message": "Model with ID gpt-4o already exists",
  "error": "Bad Request"
}
```

## Best Practices

1. **Unique Model IDs**: Ensure model IDs are unique within each provider
2. **Validation**: Always validate model data before sending requests
3. **Error Handling**: Implement proper error handling for all operations
4. **Caching**: The API uses caching, so changes may take a moment to reflect
5. **Batch Operations**: For multiple changes, consider updating the entire provider instead of individual model operations

## Database Schema

Models are stored as JSONB in the `ai_providers` table:

```sql
CREATE TABLE ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  api_key VARCHAR(500),
  base_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  models JSONB, -- Array of model objects
  user_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

The `models` column can be queried using PostgreSQL JSONB operators:

```sql
-- Find providers with specific model
SELECT * FROM ai_providers
WHERE models @> '[{"id": "gpt-4o"}]';

-- Find providers with models having specific pricing
SELECT * FROM ai_providers
WHERE models @> '[{"pricing": {"input": 5}}]';
```
