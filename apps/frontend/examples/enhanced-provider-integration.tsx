// Integration example: Adding model management to existing AI providers page

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Edit, Trash2 } from 'lucide-react'
import { aiProviderApi, type AiProvider, type AiProviderModel } from '@/lib/api'
import { useModelManager } from '@/lib/hooks/use-model-manager'

// Add this to your existing AI providers page component
export function EnhancedProviderRow({ provider }: { provider: AiProvider }) {
    const [expanded, setExpanded] = useState(false)
    const [showModelModal, setShowModelModal] = useState(false)

    const {
        models,
        loading: modelsLoading,
        addModel,
        updateModel,
        removeModel
    } = useModelManager({
        providerId: provider.id,
        autoLoad: expanded // Only load when expanded
    })

    const handleAddModel = async (modelData: AiProviderModel) => {
        try {
            await addModel(modelData)
            setShowModelModal(false)
        } catch (error) {
            console.error('Error adding model:', error)
        }
    }

    const handleUpdateModel = async (modelId: string, updates: Partial<AiProviderModel>) => {
        try {
            await updateModel(modelId, updates)
        } catch (error) {
            console.error('Error updating model:', error)
        }
    }

    const handleRemoveModel = async (modelId: string) => {
        if (confirm('Are you sure you want to delete this model?')) {
            try {
                await removeModel(modelId)
            } catch (error) {
                console.error('Error removing model:', error)
            }
        }
    }

    return (
        <div className="border border-gray-200 rounded-lg p-4">
            {/* Provider Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-1 hover:bg-gray-100 rounded"
                    >
                        {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                    </button>

                    <div>
                        <h3 className="font-medium text-gray-900">{provider.name}</h3>
                        <p className="text-sm text-gray-500">{provider.type}</p>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">
                        {provider.models?.length || 0} models
                    </span>
                    <button
                        onClick={() => setShowModelModal(true)}
                        className="p-1 text-blue-600 hover:text-blue-900"
                        title="Add Model"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Models List */}
            {expanded && (
                <div className="mt-4 ml-8">
                    {modelsLoading ? (
                        <div className="text-gray-500">Loading models...</div>
                    ) : models.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                            <p>No models configured</p>
                            <button
                                onClick={() => setShowModelModal(true)}
                                className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                            >
                                Add your first model
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {models.map((model) => (
                                <div key={model.id} className="bg-gray-50 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <h4 className="font-medium text-gray-900">{model.name}</h4>
                                            <p className="text-sm text-gray-600">{model.description}</p>
                                            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                                                {model.maxTokens && (
                                                    <span>Max: {model.maxTokens.toLocaleString()}</span>
                                                )}
                                                {model.pricing && (
                                                    <span>
                                                        ${model.pricing.input}/${model.pricing.output} per 1M tokens
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-1">
                                            <button
                                                onClick={() => handleUpdateModel(model.id, {
                                                    name: model.name + ' (Updated)'
                                                })}
                                                className="p-1 text-blue-600 hover:text-blue-900"
                                                title="Update Model"
                                            >
                                                <Edit className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveModel(model.id)}
                                                className="p-1 text-red-600 hover:text-red-900"
                                                title="Delete Model"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Add Model Modal */}
            {showModelModal && (
                <AddModelModal
                    providerName={provider.name}
                    onAdd={handleAddModel}
                    onClose={() => setShowModelModal(false)}
                />
            )}
        </div>
    )
}

// Simple Add Model Modal Component
function AddModelModal({
    providerName,
    onAdd,
    onClose
}: {
    providerName: string
    onAdd: (model: AiProviderModel) => void
    onClose: () => void
}) {
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        description: '',
        maxTokens: '',
        contextWindow: '',
        inputPrice: '',
        outputPrice: ''
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const model: AiProviderModel = {
            id: formData.id,
            name: formData.name,
            description: formData.description || undefined,
            maxTokens: formData.maxTokens ? Number(formData.maxTokens) : undefined,
            contextWindow: formData.contextWindow ? Number(formData.contextWindow) : undefined,
            pricing: formData.inputPrice && formData.outputPrice ? {
                input: Number(formData.inputPrice),
                output: Number(formData.outputPrice)
            } : undefined
        }

        onAdd(model)
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                        Add Model to {providerName}
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-4">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Model ID *
                            </label>
                            <input
                                type="text"
                                value={formData.id}
                                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., gpt-4-turbo"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Model Name *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., GPT-4 Turbo"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={2}
                                placeholder="Model description..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Max Tokens
                                </label>
                                <input
                                    type="number"
                                    value={formData.maxTokens}
                                    onChange={(e) => setFormData({ ...formData, maxTokens: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="128000"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Context Window
                                </label>
                                <input
                                    type="number"
                                    value={formData.contextWindow}
                                    onChange={(e) => setFormData({ ...formData, contextWindow: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="128000"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Input Price ($/1M tokens)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.inputPrice}
                                    onChange={(e) => setFormData({ ...formData, inputPrice: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="5.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Output Price ($/1M tokens)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.outputPrice}
                                    onChange={(e) => setFormData({ ...formData, outputPrice: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="15.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                            Add Model
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
