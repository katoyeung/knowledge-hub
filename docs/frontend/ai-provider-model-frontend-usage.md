# Frontend Usage Guide: AI Provider Model CRUD Operations

This guide shows you how to use the new AI provider model CRUD operations in your frontend application.

## 🚀 Quick Start

### 1. **Basic API Usage**

```typescript
import { aiProviderApi, type AiProviderModel } from "@/lib/api";

// Get all models for a provider
const models = await aiProviderApi.getModels("provider-id");

// Add a new model
const newModel: AiProviderModel = {
  id: "gpt-4-turbo",
  name: "GPT-4 Turbo",
  description: "Latest GPT-4 model",
  maxTokens: 128000,
  contextWindow: 128000,
  pricing: {
    input: 10,
    output: 30,
  },
};

await aiProviderApi.addModel("provider-id", newModel);

// Update a model
await aiProviderApi.updateModel("provider-id", "model-id", {
  name: "Updated Model Name",
  pricing: { input: 8, output: 24 },
});

// Remove a model
await aiProviderApi.removeModel("provider-id", "model-id");
```

### 2. **Using the Custom Hook**

```typescript
import { useModelManager } from '@/lib/hooks/use-model-manager'

function MyComponent({ providerId }: { providerId: string }) {
  const {
    models,
    loading,
    error,
    addModel,
    updateModel,
    removeModel
  } = useModelManager({ providerId })

  const handleAddModel = async () => {
    try {
      await addModel({
        id: 'new-model',
        name: 'New Model',
        description: 'A new model',
        maxTokens: 8192,
        contextWindow: 8192,
        pricing: { input: 1, output: 2 }
      })
    } catch (error) {
      console.error('Failed to add model:', error)
    }
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <button onClick={handleAddModel}>Add Model</button>
      {models.map(model => (
        <div key={model.id}>{model.name}</div>
      ))}
    </div>
  )
}
```

## 📁 Available Components

### 1. **Enhanced AI Providers Page**

- **File**: `/apps/frontend/app/settings/ai-providers-enhanced/page.tsx`
- **Features**: Complete provider and model management with expandable rows
- **Usage**: Replace your existing AI providers page

### 2. **Model Manager Component**

- **File**: `/apps/frontend/components/model-manager.tsx`
- **Features**: Reusable component for model management
- **Usage**:

```typescript
import { ModelManager } from '@/components/model-manager'

<ModelManager
  providerId="provider-id"
  providerName="OpenAI"
  onModelChange={() => console.log('Models updated!')}
/>
```

### 3. **Custom Hooks**

- **File**: `/apps/frontend/lib/hooks/use-model-manager.ts`
- **Features**:
  - `useModelManager` - Main hook for model operations
  - `useModelValidation` - Validation utilities
  - `useModelStats` - Statistics and analytics

## 🎯 Common Use Cases

### 1. **Model Selection Dropdown**

```typescript
function ModelSelector({ providerId, onModelSelect }: {
  providerId: string
  onModelSelect: (modelId: string) => void
}) {
  const { models, loading } = useModelManager({ providerId })

  if (loading) return <div>Loading models...</div>

  return (
    <select onChange={(e) => onModelSelect(e.target.value)}>
      <option value="">Choose a model...</option>
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name} {model.pricing && `($${model.pricing.input}/${model.pricing.output})`}
        </option>
      ))}
    </select>
  )
}
```

### 2. **Model Statistics Dashboard**

```typescript
function ModelStats({ providerId }: { providerId: string }) {
  const { models } = useModelManager({ providerId })

  const stats = {
    total: models.length,
    withPricing: models.filter(m => m.pricing).length,
    avgMaxTokens: models.reduce((sum, m) => sum + (m.maxTokens || 0), 0) / models.length || 0,
    cheapestInput: Math.min(...models.map(m => m.pricing?.input || Infinity))
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3>Total Models</h3>
        <p className="text-2xl font-bold">{stats.total}</p>
      </div>
      <div className="bg-green-50 p-4 rounded-lg">
        <h3>With Pricing</h3>
        <p className="text-2xl font-bold">{stats.withPricing}</p>
      </div>
      <div className="bg-purple-50 p-4 rounded-lg">
        <h3>Avg Max Tokens</h3>
        <p className="text-2xl font-bold">{Math.round(stats.avgMaxTokens).toLocaleString()}</p>
      </div>
      <div className="bg-orange-50 p-4 rounded-lg">
        <h3>Cheapest Input</h3>
        <p className="text-2xl font-bold">${stats.cheapestInput.toFixed(2)}</p>
      </div>
    </div>
  )
}
```

### 3. **Bulk Model Operations**

```typescript
function BulkOperations({ providerId }: { providerId: string }) {
  const { models, addModel, removeModel } = useModelManager({ providerId })

  const addMultipleModels = async () => {
    const newModels = [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', pricing: { input: 0.15, output: 0.6 } },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', pricing: { input: 0.5, output: 1.5 } }
    ]

    for (const model of newModels) {
      await addModel(model)
    }
  }

  const removeAllModels = async () => {
    if (confirm('Remove all models?')) {
      for (const model of models) {
        await removeModel(model.id)
      }
    }
  }

  return (
    <div className="flex gap-2">
      <button onClick={addMultipleModels}>Add Multiple</button>
      <button onClick={removeAllModels}>Remove All</button>
    </div>
  )
}
```

## 🔧 Integration Examples

### 1. **Add to Existing Provider Row**

```typescript
// In your existing provider component
function ProviderRow({ provider }: { provider: AiProvider }) {
  const [expanded, setExpanded] = useState(false)
  const { models, addModel } = useModelManager({
    providerId: provider.id,
    autoLoad: expanded
  })

  return (
    <div className="border p-4">
      <div className="flex justify-between">
        <h3>{provider.name}</h3>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          <h4>Models ({models.length})</h4>
          {models.map(model => (
            <div key={model.id} className="bg-gray-50 p-2 rounded">
              {model.name} - {model.pricing && `$${model.pricing.input}/${model.pricing.output}`}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 2. **Model Form Component**

```typescript
function ModelForm({ providerId, onSuccess }: {
  providerId: string
  onSuccess: () => void
}) {
  const { addModel } = useModelManager({ providerId })
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    maxTokens: '',
    contextWindow: '',
    inputPrice: '',
    outputPrice: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await addModel({
        id: formData.id,
        name: formData.name,
        description: formData.description || undefined,
        maxTokens: formData.maxTokens ? Number(formData.maxTokens) : undefined,
        contextWindow: formData.contextWindow ? Number(formData.contextWindow) : undefined,
        pricing: formData.inputPrice && formData.outputPrice ? {
          input: Number(formData.inputPrice),
          output: Number(formData.outputPrice)
        } : undefined
      })

      onSuccess()
    } catch (error) {
      console.error('Error adding model:', error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Model ID"
        value={formData.id}
        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
        required
      />
      <input
        type="text"
        placeholder="Model Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />
      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-4">
        <input
          type="number"
          placeholder="Max Tokens"
          value={formData.maxTokens}
          onChange={(e) => setFormData({ ...formData, maxTokens: e.target.value })}
        />
        <input
          type="number"
          placeholder="Context Window"
          value={formData.contextWindow}
          onChange={(e) => setFormData({ ...formData, contextWindow: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <input
          type="number"
          step="0.01"
          placeholder="Input Price"
          value={formData.inputPrice}
          onChange={(e) => setFormData({ ...formData, inputPrice: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Output Price"
          value={formData.outputPrice}
          onChange={(e) => setFormData({ ...formData, outputPrice: e.target.value })}
        />
      </div>
      <button type="submit">Add Model</button>
    </form>
  )
}
```

## 🎨 Styling Examples

### 1. **Model Card Component**

```typescript
function ModelCard({ model, onEdit, onDelete }: {
  model: AiProviderModel
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{model.name}</h4>
          <p className="text-sm text-gray-600">{model.description}</p>

          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {model.maxTokens && (
              <span>Max: {model.maxTokens.toLocaleString()}</span>
            )}
            {model.pricing && (
              <span>${model.pricing.input}/${model.pricing.output} per 1M tokens</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 2. **Loading States**

```typescript
function ModelList({ providerId }: { providerId: string }) {
  const { models, loading, error } = useModelManager({ providerId })

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-200 animate-pulse h-16 rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {models.map(model => (
        <ModelCard key={model.id} model={model} />
      ))}
    </div>
  )
}
```

## 🔍 Error Handling

### 1. **API Error Handling**

```typescript
const handleAddModel = async (modelData: AiProviderModel) => {
  try {
    await aiProviderApi.addModel(providerId, modelData);
    // Success
  } catch (error) {
    if (error.response?.status === 400) {
      // Bad request - validation error
      console.error("Validation error:", error.response.data.message);
    } else if (error.response?.status === 404) {
      // Provider not found
      console.error("Provider not found");
    } else {
      // Other errors
      console.error("Unexpected error:", error);
    }
  }
};
```

### 2. **Hook Error Handling**

```typescript
function MyComponent({ providerId }: { providerId: string }) {
  const { models, loading, error, addModel } = useModelManager({ providerId })

  const handleAddModel = async () => {
    try {
      await addModel({
        id: 'test-model',
        name: 'Test Model'
      })
    } catch (error) {
      // Error is already handled by the hook and stored in the error state
      console.log('Error state:', error)
    }
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={handleAddModel}>Add Model</button>
      {models.map(model => <div key={model.id}>{model.name}</div>)}
    </div>
  )
}
```

## 📱 Mobile-Friendly Examples

### 1. **Responsive Model Grid**

```typescript
function ResponsiveModelGrid({ providerId }: { providerId: string }) {
  const { models } = useModelManager({ providerId })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {models.map(model => (
        <div key={model.id} className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">{model.name}</h4>
          <p className="text-sm text-gray-600 mb-3">{model.description}</p>

          <div className="space-y-1 text-xs text-gray-500">
            {model.maxTokens && (
              <div>Max Tokens: {model.maxTokens.toLocaleString()}</div>
            )}
            {model.pricing && (
              <div>Pricing: ${model.pricing.input}/${model.pricing.output}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

## 🚀 Performance Tips

### 1. **Lazy Loading**

```typescript
// Only load models when needed
const { models, loading } = useModelManager({
  providerId,
  autoLoad: false, // Don't auto-load
});

const loadModels = () => {
  // Load models on demand
  refreshModels();
};
```

### 2. **Optimistic Updates**

```typescript
const handleAddModel = async (modelData: AiProviderModel) => {
  // Optimistically add to local state
  setModels((prev) => [...prev, modelData]);

  try {
    await addModel(modelData);
  } catch (error) {
    // Revert on error
    setModels((prev) => prev.filter((m) => m.id !== modelData.id));
    console.error("Failed to add model:", error);
  }
};
```

### 3. **Debounced Search**

```typescript
import { useDebounce } from '@/hooks/use-debounce'

function ModelSearch({ providerId }: { providerId: string }) {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 300)
  const { models } = useModelManager({ providerId })

  const filteredModels = useMemo(() => {
    if (!debouncedSearch) return models
    return models.filter(model =>
      model.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      model.description?.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
  }, [models, debouncedSearch])

  return (
    <div>
      <input
        type="text"
        placeholder="Search models..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
      />
      {filteredModels.map(model => (
        <div key={model.id}>{model.name}</div>
      ))}
    </div>
  )
}
```

This comprehensive guide should give you everything you need to implement AI provider model CRUD operations in your frontend application! 🎉
