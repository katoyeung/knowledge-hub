// Simple usage examples for AI Provider Model CRUD operations

import { useState, useEffect } from 'react'
import { aiProviderApi, type AiProviderModel } from '@/lib/api'
import { useModelManager } from '@/lib/hooks/use-model-manager'

// Example 1: Basic Model Management
export function BasicModelExample({ providerId }: { providerId: string }) {
    const [models, setModels] = useState<AiProviderModel[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadModels()
    }, [providerId])

    const loadModels = async () => {
        try {
            const modelsData = await aiProviderApi.getModels(providerId)
            setModels(modelsData)
        } catch (error) {
            console.error('Error loading models:', error)
        } finally {
            setLoading(false)
        }
    }

    const addModel = async () => {
        const newModel: AiProviderModel = {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            description: 'Latest GPT-4 model',
            maxTokens: 128000,
            contextWindow: 128000,
            pricing: {
                input: 10,
                output: 30
            }
        }

        try {
            await aiProviderApi.addModel(providerId, newModel)
            await loadModels() // Refresh the list
        } catch (error) {
            console.error('Error adding model:', error)
        }
    }

    const updateModel = async (modelId: string) => {
        try {
            await aiProviderApi.updateModel(providerId, modelId, {
                name: 'Updated Model Name',
                pricing: {
                    input: 8,
                    output: 24
                }
            })
            await loadModels() // Refresh the list
        } catch (error) {
            console.error('Error updating model:', error)
        }
    }

    const removeModel = async (modelId: string) => {
        try {
            await aiProviderApi.removeModel(providerId, modelId)
            await loadModels() // Refresh the list
        } catch (error) {
            console.error('Error removing model:', error)
        }
    }

    if (loading) return <div>Loading...</div>

    return (
        <div>
            <h3>Models ({models.length})</h3>
            <button onClick={addModel}>Add Model</button>

            {models.map((model) => (
                <div key={model.id} className="border p-4 mb-2">
                    <h4>{model.name}</h4>
                    <p>{model.description}</p>
                    <div className="flex gap-2">
                        <button onClick={() => updateModel(model.id)}>Update</button>
                        <button onClick={() => removeModel(model.id)}>Delete</button>
                    </div>
                </div>
            ))}
        </div>
    )
}

// Example 2: Using the Custom Hook
export function HookBasedExample({ providerId }: { providerId: string }) {
    const {
        models,
        loading,
        error,
        addModel,
        updateModel,
        removeModel
    } = useModelManager({ providerId })

    const handleAddModel = async () => {
        const newModel: AiProviderModel = {
            id: 'claude-3-sonnet',
            name: 'Claude 3 Sonnet',
            description: 'Anthropic Claude 3 Sonnet',
            maxTokens: 200000,
            contextWindow: 200000,
            pricing: {
                input: 3,
                output: 15
            }
        }

        try {
            await addModel(newModel)
            console.log('Model added successfully!')
        } catch (error) {
            console.error('Failed to add model:', error)
        }
    }

    const handleUpdateModel = async (modelId: string) => {
        try {
            await updateModel(modelId, {
                name: 'Updated Claude 3 Sonnet',
                pricing: {
                    input: 2.5,
                    output: 12.5
                }
            })
            console.log('Model updated successfully!')
        } catch (error) {
            console.error('Failed to update model:', error)
        }
    }

    const handleRemoveModel = async (modelId: string) => {
        if (confirm('Are you sure you want to delete this model?')) {
            try {
                await removeModel(modelId)
                console.log('Model removed successfully!')
            } catch (error) {
                console.error('Failed to remove model:', error)
            }
        }
    }

    if (loading) return <div>Loading models...</div>
    if (error) return <div>Error: {error}</div>

    return (
        <div>
            <h3>Models ({models.length})</h3>
            <button onClick={handleAddModel}>Add Claude Model</button>

            {models.map((model) => (
                <div key={model.id} className="border p-4 mb-2">
                    <h4>{model.name}</h4>
                    <p>{model.description}</p>
                    {model.pricing && (
                        <p>Pricing: ${model.pricing.input}/${model.pricing.output} per 1M tokens</p>
                    )}
                    <div className="flex gap-2">
                        <button onClick={() => handleUpdateModel(model.id)}>Update</button>
                        <button onClick={() => handleRemoveModel(model.id)}>Delete</button>
                    </div>
                </div>
            ))}
        </div>
    )
}

// Example 3: Model Selection Component
export function ModelSelector({
    providerId,
    selectedModelId,
    onModelSelect
}: {
    providerId: string
    selectedModelId?: string
    onModelSelect: (modelId: string) => void
}) {
    const { models, loading } = useModelManager({ providerId })

    if (loading) return <div>Loading models...</div>

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Model
            </label>
            <select
                value={selectedModelId || ''}
                onChange={(e) => onModelSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="">Choose a model...</option>
                {models.map((model) => (
                    <option key={model.id} value={model.id}>
                        {model.name} {model.pricing && `($${model.pricing.input}/${model.pricing.output})`}
                    </option>
                ))}
            </select>
        </div>
    )
}

// Example 4: Model Statistics Dashboard
export function ModelStatsDashboard({ providerId }: { providerId: string }) {
    const { models, loading } = useModelManager({ providerId })

    if (loading) return <div>Loading statistics...</div>

    const stats = {
        total: models.length,
        withPricing: models.filter(m => m.pricing).length,
        avgMaxTokens: models.reduce((sum, m) => sum + (m.maxTokens || 0), 0) / models.length || 0,
        avgContextWindow: models.reduce((sum, m) => sum + (m.contextWindow || 0), 0) / models.length || 0,
        cheapestInput: Math.min(...models.map(m => m.pricing?.input || Infinity)),
        cheapestOutput: Math.min(...models.map(m => m.pricing?.output || Infinity))
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-800">Total Models</h3>
                <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-green-800">With Pricing</h3>
                <p className="text-2xl font-bold text-green-900">{stats.withPricing}</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-purple-800">Avg Max Tokens</h3>
                <p className="text-2xl font-bold text-purple-900">
                    {Math.round(stats.avgMaxTokens).toLocaleString()}
                </p>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-orange-800">Cheapest Input</h3>
                <p className="text-2xl font-bold text-orange-900">
                    ${stats.cheapestInput.toFixed(2)}
                </p>
            </div>
        </div>
    )
}

// Example 5: Bulk Model Operations
export function BulkModelOperations({ providerId }: { providerId: string }) {
    const { models, addModel, removeModel } = useModelManager({ providerId })

    const addMultipleModels = async () => {
        const newModels: AiProviderModel[] = [
            {
                id: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                description: 'Smaller, faster GPT-4o model',
                maxTokens: 128000,
                contextWindow: 128000,
                pricing: { input: 0.15, output: 0.6 }
            },
            {
                id: 'gpt-3.5-turbo',
                name: 'GPT-3.5 Turbo',
                description: 'Fast and efficient GPT-3.5 model',
                maxTokens: 16385,
                contextWindow: 16385,
                pricing: { input: 0.5, output: 1.5 }
            }
        ]

        try {
            for (const model of newModels) {
                await addModel(model)
            }
            console.log('All models added successfully!')
        } catch (error) {
            console.error('Error adding models:', error)
        }
    }

    const removeAllModels = async () => {
        if (confirm('Are you sure you want to remove all models?')) {
            try {
                for (const model of models) {
                    await removeModel(model.id)
                }
                console.log('All models removed successfully!')
            } catch (error) {
                console.error('Error removing models:', error)
            }
        }
    }

    return (
        <div className="space-y-4">
            <h3>Bulk Operations</h3>
            <div className="flex gap-2">
                <button
                    onClick={addMultipleModels}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                    Add Multiple Models
                </button>
                <button
                    onClick={removeAllModels}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                    Remove All Models
                </button>
            </div>
        </div>
    )
}
