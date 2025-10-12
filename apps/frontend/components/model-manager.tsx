'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Bot, DollarSign, Zap, Clock } from 'lucide-react'
import { aiProviderApi, type AiProviderModel } from '@/lib/api'

interface ModelManagerProps {
    providerId: string
    providerName: string
    onModelChange?: () => void
}

interface ModelFormData {
    id: string
    name: string
    description: string
    maxTokens: number | ''
    contextWindow: number | ''
    pricing: {
        input: number | ''
        output: number | ''
    }
}

export function ModelManager({ providerId, providerName, onModelChange }: ModelManagerProps) {
    const [models, setModels] = useState<AiProviderModel[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingModel, setEditingModel] = useState<AiProviderModel | null>(null)
    const [formData, setFormData] = useState<ModelFormData>({
        id: '',
        name: '',
        description: '',
        maxTokens: '',
        contextWindow: '',
        pricing: {
            input: '',
            output: ''
        }
    })

    useEffect(() => {
        loadModels()
    }, [providerId])

    const loadModels = async () => {
        try {
            setLoading(true)
            const modelsData = await aiProviderApi.getModels(providerId)
            setModels(modelsData)
        } catch (error) {
            console.error('Error loading models:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const modelData: AiProviderModel = {
                id: formData.id,
                name: formData.name,
                description: formData.description || undefined,
                maxTokens: formData.maxTokens ? Number(formData.maxTokens) : undefined,
                contextWindow: formData.contextWindow ? Number(formData.contextWindow) : undefined,
                pricing: formData.pricing.input && formData.pricing.output ? {
                    input: Number(formData.pricing.input),
                    output: Number(formData.pricing.output)
                } : undefined
            }

            await aiProviderApi.addModel(providerId, modelData)
            await loadModels()
            onModelChange?.()
            resetForm()
            setShowAddModal(false)
        } catch (error) {
            console.error('Error adding model:', error)
        }
    }

    const handleUpdateModel = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingModel) return

        try {
            const updates: Partial<AiProviderModel> = {
                name: formData.name,
                description: formData.description || undefined,
                maxTokens: formData.maxTokens ? Number(formData.maxTokens) : undefined,
                contextWindow: formData.contextWindow ? Number(formData.contextWindow) : undefined,
                pricing: formData.pricing.input && formData.pricing.output ? {
                    input: Number(formData.pricing.input),
                    output: Number(formData.pricing.output)
                } : undefined
            }

            await aiProviderApi.updateModel(providerId, editingModel.id, updates)
            await loadModels()
            onModelChange?.()
            resetForm()
            setEditingModel(null)
        } catch (error) {
            console.error('Error updating model:', error)
        }
    }

    const handleDeleteModel = async (modelId: string) => {
        if (!confirm('Are you sure you want to delete this model?')) return

        try {
            await aiProviderApi.removeModel(providerId, modelId)
            await loadModels()
            onModelChange?.()
        } catch (error) {
            console.error('Error deleting model:', error)
        }
    }

    const handleEditModel = (model: AiProviderModel) => {
        setEditingModel(model)
        setFormData({
            id: model.id,
            name: model.name,
            description: model.description || '',
            maxTokens: model.maxTokens || '',
            contextWindow: model.contextWindow || '',
            pricing: {
                input: model.pricing?.input || '',
                output: model.pricing?.output || ''
            }
        })
    }

    const resetForm = () => {
        setFormData({
            id: '',
            name: '',
            description: '',
            maxTokens: '',
            contextWindow: '',
            pricing: {
                input: '',
                output: ''
            }
        })
    }

    const formatNumber = (num: number) => {
        return num.toLocaleString()
    }

    const formatPrice = (price: number) => {
        return `$${price.toFixed(2)}`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading models...</div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-gray-900">Models</h3>
                    <p className="text-sm text-gray-600">
                        Manage models for {providerName}
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Model
                </button>
            </div>

            {/* Models List */}
            {models.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Bot className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 mb-2">No models configured</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                        Add your first model
                    </button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {models.map((model) => (
                        <div key={model.id} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Bot className="w-4 h-4 text-gray-400" />
                                        <h4 className="font-medium text-gray-900">{model.name}</h4>
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                            {model.id}
                                        </span>
                                    </div>

                                    {model.description && (
                                        <p className="text-sm text-gray-600 mb-3">{model.description}</p>
                                    )}

                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        {model.maxTokens && (
                                            <div className="flex items-center gap-1">
                                                <Zap className="w-3 h-3" />
                                                <span>Max: {formatNumber(model.maxTokens)}</span>
                                            </div>
                                        )}
                                        {model.contextWindow && (
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>Context: {formatNumber(model.contextWindow)}</span>
                                            </div>
                                        )}
                                        {model.pricing && (
                                            <div className="flex items-center gap-1">
                                                <DollarSign className="w-3 h-3" />
                                                <span>
                                                    {formatPrice(model.pricing.input)}/{formatPrice(model.pricing.output)} per 1M tokens
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleEditModel(model)}
                                        className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                                        title="Edit model"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteModel(model.id)}
                                        className="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                                        title="Delete model"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Model Modal */}
            {(showAddModal || editingModel) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">
                                {editingModel ? 'Edit Model' : 'Add New Model'}
                            </h3>
                        </div>

                        <form onSubmit={editingModel ? handleUpdateModel : handleAddModel} className="px-6 py-4">
                            <div className="space-y-4">
                                {!editingModel && (
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
                                )}

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
                                        rows={3}
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
                                            onChange={(e) => setFormData({ ...formData, maxTokens: e.target.value ? Number(e.target.value) : '' })}
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
                                            onChange={(e) => setFormData({ ...formData, contextWindow: e.target.value ? Number(e.target.value) : '' })}
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
                                            value={formData.pricing.input}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                pricing: {
                                                    ...formData.pricing,
                                                    input: e.target.value ? Number(e.target.value) : ''
                                                }
                                            })}
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
                                            value={formData.pricing.output}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                pricing: {
                                                    ...formData.pricing,
                                                    output: e.target.value ? Number(e.target.value) : ''
                                                }
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="15.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddModal(false)
                                        setEditingModel(null)
                                        resetForm()
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    {editingModel ? 'Update Model' : 'Add Model'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
