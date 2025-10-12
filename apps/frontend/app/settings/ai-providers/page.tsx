'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Edit, Trash2, Bot, ChevronDown, ChevronRight } from 'lucide-react'
import { aiProviderApi, type AiProvider, type AiProviderModel } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'

interface CreateAiProviderDto {
    name: string
    type: 'openai' | 'anthropic' | 'openrouter' | 'dashscope' | 'perplexity' | 'custom'
    apiKey?: string
    baseUrl?: string
    isActive: boolean
}

function AiProvidersContent() {
    const { success, error } = useToast()
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showModelModal, setShowModelModal] = useState(false)
    const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null)
    const [editingModel, setEditingModel] = useState<{ providerId: string, model: AiProviderModel } | null>(null)
    const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null)
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
    const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set())
    const [formData, setFormData] = useState<CreateAiProviderDto>({
        name: '',
        type: 'openai',
        apiKey: '',
        baseUrl: '',
        isActive: true,
    })
    const [modelFormData, setModelFormData] = useState({
        id: '',
        name: '',
        description: '',
        maxTokens: '',
        contextWindow: '',
        inputPrice: '',
        outputPrice: ''
    })
    const hasFetched = useRef(false)

    const fetchProviders = useCallback(async () => {
        if (hasFetched.current) {
            console.log('Skipping duplicate fetchProviders call')
            return
        }
        hasFetched.current = true
        console.log('Fetching AI providers...')

        try {
            const response = await aiProviderApi.getAll()
            setProviders(response.data || [])
        } catch (error) {
            console.error('Error fetching providers:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    const refreshProviders = useCallback(async () => {
        console.log('Refreshing AI providers...')
        hasFetched.current = false
        await fetchProviders()
    }, [fetchProviders])

    useEffect(() => {
        fetchProviders()
    }, [fetchProviders])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await aiProviderApi.create(formData)
            await refreshProviders()
            setShowCreateModal(false)
            setFormData({
                name: '',
                type: 'openai',
                apiKey: '',
                baseUrl: '',
                isActive: true,
            })
            success('Provider Created', `${formData.name} has been created successfully`)
        } catch (err: unknown) {
            console.error('Error creating provider:', err)
            error('Failed to Create Provider', 'An error occurred while creating the provider')
        }
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingProvider) return

        try {
            await aiProviderApi.update(editingProvider.id, formData)
            await refreshProviders()
            setEditingProvider(null)
            setFormData({
                name: '',
                type: 'openai',
                apiKey: '',
                baseUrl: '',
                isActive: true,
            })
            success('Provider Updated', `${formData.name} has been updated successfully`)
        } catch (err: unknown) {
            console.error('Error updating provider:', err)
            error('Failed to Update Provider', 'An error occurred while updating the provider')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this AI provider?')) return

        try {
            await aiProviderApi.delete(id)
            await refreshProviders()
            success('Provider Deleted', 'AI provider has been deleted successfully')
        } catch (err: unknown) {
            console.error('Error deleting provider:', err)
            error('Failed to Delete Provider', 'An error occurred while deleting the provider')
        }
    }

    const handleEdit = (provider: AiProvider) => {
        setEditingProvider(provider)
        setFormData({
            name: provider.name,
            type: provider.type,
            apiKey: provider.apiKey || '',
            baseUrl: provider.baseUrl || '',
            isActive: provider.isActive,
        })
    }

    // Model management functions
    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProvider) return

        try {
            const modelData: AiProviderModel = {
                id: modelFormData.id,
                name: modelFormData.name,
                description: modelFormData.description || undefined,
                maxTokens: modelFormData.maxTokens ? Number(modelFormData.maxTokens) : undefined,
                contextWindow: modelFormData.contextWindow ? Number(modelFormData.contextWindow) : undefined,
                pricing: modelFormData.inputPrice && modelFormData.outputPrice ? {
                    input: Number(modelFormData.inputPrice),
                    output: Number(modelFormData.outputPrice)
                } : undefined
            }

            await aiProviderApi.addModel(selectedProvider.id, modelData)
            await refreshProviders()
            setShowModelModal(false)
            setEditingModel(null)
            setModelFormData({
                id: '',
                name: '',
                description: '',
                maxTokens: '',
                contextWindow: '',
                inputPrice: '',
                outputPrice: ''
            })
            success('Model Added', `${modelData.name} has been added to ${selectedProvider.name}`)
        } catch (err: unknown) {
            console.error('Error adding model:', err)
            error('Failed to Add Model', 'An error occurred while adding the model')
        }
    }

    const handleEditModel = (providerId: string, model: AiProviderModel) => {
        setEditingModel({ providerId, model })
        setModelFormData({
            id: model.id,
            name: model.name,
            description: model.description || '',
            maxTokens: model.maxTokens?.toString() || '',
            contextWindow: model.contextWindow?.toString() || '',
            inputPrice: model.pricing?.input?.toString() || '',
            outputPrice: model.pricing?.output?.toString() || ''
        })
        setShowModelModal(true)
    }

    const handleUpdateModel = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingModel) return

        try {
            const modelData = {
                name: modelFormData.name,
                description: modelFormData.description || undefined,
                maxTokens: modelFormData.maxTokens ? Number(modelFormData.maxTokens) : undefined,
                contextWindow: modelFormData.contextWindow ? Number(modelFormData.contextWindow) : undefined,
                pricing: modelFormData.inputPrice && modelFormData.outputPrice ? {
                    input: Number(modelFormData.inputPrice),
                    output: Number(modelFormData.outputPrice)
                } : undefined
            }

            await aiProviderApi.updateModel(editingModel.providerId, editingModel.model.id, modelData)
            await refreshProviders()
            setShowModelModal(false)
            setEditingModel(null)
            setModelFormData({
                id: '',
                name: '',
                description: '',
                maxTokens: '',
                contextWindow: '',
                inputPrice: '',
                outputPrice: ''
            })
            success('Model Updated', `${modelData.name} has been updated successfully`)
        } catch (err: unknown) {
            console.error('Error updating model:', err)
            error('Failed to Update Model', 'An error occurred while updating the model')
        }
    }

    const handleDeleteModel = async (providerId: string, modelId: string) => {
        const deleteKey = `${providerId}-${modelId}`

        // Prevent double-clicking
        if (deletingModels.has(deleteKey)) {
            console.log('Delete already in progress for:', deleteKey)
            return
        }

        if (!confirm(`Are you sure you want to delete the model "${modelId}"?`)) return

        try {
            setDeletingModels(prev => new Set(prev).add(deleteKey))
            console.log('Deleting model:', { providerId, modelId })

            await aiProviderApi.removeModel(providerId, modelId)
            await refreshProviders()
            console.log('Model deleted successfully')
            success('Model Deleted', 'Model has been deleted successfully')
        } catch (err: unknown) {
            console.error('Error deleting model:', err)

            const errorObj = err as { response?: { data?: { message?: string }, status?: number }, message?: string }
            console.error('Error details:', {
                providerId,
                modelId,
                error: errorObj.response?.data || errorObj.message,
                status: errorObj.response?.status
            })

            // Show user-friendly error message
            const errorMessage = errorObj.response?.status === 404
                ? `Model "${modelId}" not found. It may have already been deleted.`
                : `Failed to delete model: ${errorObj.response?.data?.message || errorObj.message}`

            error('Failed to Delete Model', errorMessage)
        } finally {
            setDeletingModels(prev => {
                const newSet = new Set(prev)
                newSet.delete(deleteKey)
                return newSet
            })
        }
    }

    const toggleProviderExpansion = (providerId: string) => {
        const newExpanded = new Set(expandedProviders)
        if (newExpanded.has(providerId)) {
            newExpanded.delete(providerId)
        } else {
            newExpanded.add(providerId)
        }
        setExpandedProviders(newExpanded)
    }

    const handleLogout = () => {
        // The navbar handles the actual logout logic
    }

    const providerTypes = [
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'openrouter', label: 'OpenRouter' },
        { value: 'dashscope', label: 'DashScope' },
        { value: 'perplexity', label: 'Perplexity' },
        { value: 'custom', label: 'Custom' },
    ]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Loading AI providers...</div>
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            AI Providers
                        </h1>
                        <p className="text-gray-600">
                            Manage your AI model providers and API configurations
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Provider
                    </button>
                </div>
            </div>

            {/* Providers List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                {providers.length === 0 ? (
                    <div className="p-8 text-center">
                        <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No AI providers configured
                        </h3>
                        <p className="text-gray-500 mb-4">
                            Add your first AI provider to start using AI models
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
                        >
                            <Plus className="w-4 h-4" />
                            Add Provider
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {providers.map((provider) => (
                            <div key={provider.id} className="p-6">
                                {/* Provider Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <button
                                            onClick={() => toggleProviderExpansion(provider.id)}
                                            className="p-1 hover:bg-gray-100 rounded"
                                        >
                                            {expandedProviders.has(provider.id) ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </button>
                                        <Bot className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <h3 className="text-lg font-medium text-gray-900">
                                                {provider.name}
                                            </h3>
                                            <div className="flex items-center space-x-2">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {providerTypes.find(t => t.value === provider.type)?.label || provider.type}
                                                </span>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${provider.isActive
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {provider.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm text-gray-500">
                                            {provider.models?.length || 0} models
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedProvider(provider)
                                                setShowModelModal(true)
                                            }}
                                            className="text-blue-600 hover:text-blue-900 p-1"
                                            title="Add Model"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(provider)}
                                            className="text-blue-600 hover:text-blue-900 p-1"
                                            title="Edit Provider"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(provider.id)}
                                            className="text-red-600 hover:text-red-900 p-1"
                                            title="Delete Provider"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Models List */}
                                {expandedProviders.has(provider.id) && (
                                    <div className="mt-4 ml-8">
                                        {provider.models && provider.models.length > 0 ? (
                                            <div className="space-y-3">
                                                {provider.models.map((model) => (
                                                    <div key={model.id} className="bg-gray-50 rounded-lg p-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex-1">
                                                                <h4 className="font-medium text-gray-900">
                                                                    {model.name}
                                                                </h4>
                                                                <p className="text-sm text-gray-600">
                                                                    {model.description}
                                                                </p>
                                                                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                                                    {model.maxTokens && (
                                                                        <span>Max Tokens: {model.maxTokens.toLocaleString()}</span>
                                                                    )}
                                                                    {model.contextWindow && (
                                                                        <span>Context: {model.contextWindow.toLocaleString()}</span>
                                                                    )}
                                                                    {model.pricing && (
                                                                        <span>
                                                                            Pricing: ${model.pricing.input}/${model.pricing.output} per token
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <button
                                                                    onClick={() => handleEditModel(provider.id, model)}
                                                                    className="text-blue-600 hover:text-blue-900 p-1"
                                                                    title="Edit Model"
                                                                >
                                                                    <Edit className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteModel(provider.id, model.id)}
                                                                    disabled={deletingModels.has(`${provider.id}-${model.id}`)}
                                                                    className={`p-1 ${deletingModels.has(`${provider.id}-${model.id}`)
                                                                        ? 'text-gray-400 cursor-not-allowed'
                                                                        : 'text-red-600 hover:text-red-900'
                                                                        }`}
                                                                    title={deletingModels.has(`${provider.id}-${model.id}`) ? "Deleting..." : "Delete Model"}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-gray-500">
                                                <p>No models configured</p>
                                                <button
                                                    onClick={() => {
                                                        setSelectedProvider(provider)
                                                        setShowModelModal(true)
                                                    }}
                                                    className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                                >
                                                    Add your first model
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingProvider) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">
                                {editingProvider ? 'Edit AI Provider' : 'Add AI Provider'}
                            </h3>
                        </div>

                        <form onSubmit={editingProvider ? handleUpdate : handleCreate} className="px-6 py-4">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Type
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as CreateAiProviderDto['type'] })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    >
                                        {providerTypes.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        API Key
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.apiKey}
                                        onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your API key"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Base URL (Optional)
                                    </label>
                                    <input
                                        type="url"
                                        value={formData.baseUrl}
                                        onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="https://api.example.com"
                                    />
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                                        Active
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateModal(false)
                                        setEditingProvider(null)
                                        setFormData({
                                            name: '',
                                            type: 'openai',
                                            apiKey: '',
                                            baseUrl: '',
                                            isActive: true,
                                        })
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    {editingProvider ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add/Edit Model Modal */}
            {showModelModal && (selectedProvider || editingModel) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">
                                {editingModel ? 'Edit Model' : `Add Model to ${selectedProvider?.name}`}
                            </h3>
                        </div>

                        <form onSubmit={editingModel ? handleUpdateModel : handleAddModel} className="px-6 py-4">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Model ID
                                    </label>
                                    <input
                                        type="text"
                                        value={modelFormData.id}
                                        onChange={(e) => setModelFormData({ ...modelFormData, id: e.target.value })}
                                        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editingModel ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                        placeholder="e.g., gpt-4-turbo"
                                        disabled={!!editingModel}
                                        required
                                    />
                                    {editingModel && (
                                        <p className="text-xs text-gray-500 mt-1">Model ID cannot be changed when editing</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Model Name
                                    </label>
                                    <input
                                        type="text"
                                        value={modelFormData.name}
                                        onChange={(e) => setModelFormData({ ...modelFormData, name: e.target.value })}
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
                                        value={modelFormData.description}
                                        onChange={(e) => setModelFormData({ ...modelFormData, description: e.target.value })}
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
                                            value={modelFormData.maxTokens}
                                            onChange={(e) => setModelFormData({ ...modelFormData, maxTokens: e.target.value })}
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
                                            value={modelFormData.contextWindow}
                                            onChange={(e) => setModelFormData({ ...modelFormData, contextWindow: e.target.value })}
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
                                            value={modelFormData.inputPrice}
                                            onChange={(e) => setModelFormData({ ...modelFormData, inputPrice: e.target.value })}
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
                                            value={modelFormData.outputPrice}
                                            onChange={(e) => setModelFormData({ ...modelFormData, outputPrice: e.target.value })}
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
                                        setShowModelModal(false)
                                        setEditingModel(null)
                                        setSelectedProvider(null)
                                        setModelFormData({
                                            id: '',
                                            name: '',
                                            description: '',
                                            maxTokens: '',
                                            contextWindow: '',
                                            inputPrice: '',
                                            outputPrice: ''
                                        })
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

export default function AiProvidersPage() {
    return <AiProvidersContent />
}
