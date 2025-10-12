'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, Info, Zap, DollarSign, Clock, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { chatApi } from '@/lib/api'
import { ProviderInfo, ModelInfo } from '@/lib/types/chat'

interface ModelSelectionProps {
    selectedProvider?: string
    selectedModel?: string
    onProviderChange: (provider: string) => void
    onModelChange: (model: string) => void
    disabled?: boolean
}

export function ModelSelection({
    selectedProvider,
    selectedModel,
    onProviderChange,
    onModelChange,
    disabled = false,
}: ModelSelectionProps) {
    const [providers, setProviders] = useState<ProviderInfo[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [showDetails, setShowDetails] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        loadModels()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const loadModels = async () => {
        try {
            setIsLoading(true)
            const response = await chatApi.getModels()
            setProviders(response.providers)

            // Try to load saved selection first
            const savedProvider = localStorage.getItem('selectedLLMProvider')
            const savedModel = localStorage.getItem('selectedLLMModel')

            if (savedProvider && savedModel) {
                // Check if saved selection is still available
                const provider = response.providers.find(p => p.id === savedProvider)
                const model = provider?.models.find(m => m.id === savedModel)

                if (provider && model && (model as ModelInfo).available) {
                    onProviderChange(savedProvider)
                    onModelChange(savedModel)
                } else {
                    // Fallback to default if saved selection is not available
                    setDefaultSelection(response.providers)
                }
            } else {
                // Set default provider and model if none selected
                setDefaultSelection(response.providers)
            }
        } catch (error) {
            console.error('Failed to load models:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const setDefaultSelection = (providers: ProviderInfo[]) => {
        if (providers.length > 0) {
            // Prefer DashScope with Qwen Turbo if available, otherwise use first available provider
            const dashscopeProvider = providers.find(p => p.id === 'dashscope' && p.available)
            let defaultProvider = dashscopeProvider
            let defaultModel = 'qwen-turbo-latest' // Qwen Turbo model ID

            if (dashscopeProvider) {
                // Check if Qwen Turbo is available in DashScope
                const qwenTurboModel = dashscopeProvider.models.find(m => m.id === 'qwen-turbo-latest' && (m as ModelInfo).available)
                if (qwenTurboModel) {
                    defaultModel = 'qwen-turbo-latest'
                } else {
                    // Fallback to first available model in DashScope
                    const availableModel = dashscopeProvider.models.find(m => (m as ModelInfo).available) || dashscopeProvider.models[0]
                    defaultModel = availableModel.id
                }
            } else {
                // Fallback to first available provider
                defaultProvider = providers.find(p => p.available) || providers[0]
                if (defaultProvider && defaultProvider.models.length > 0) {
                    const availableModel = defaultProvider.models.find(m => (m as ModelInfo).available) || defaultProvider.models[0]
                    defaultModel = availableModel.id
                }
            }

            if (defaultProvider) {
                onProviderChange(defaultProvider.id)
                onModelChange(defaultModel)
                // Save the default selection
                saveSelection(defaultProvider.id, defaultModel)
            }
        }
    }


    const saveSelection = (provider: string, model: string) => {
        try {
            localStorage.setItem('selectedLLMProvider', provider)
            localStorage.setItem('selectedLLMModel', model)
        } catch (error) {
            console.error('Failed to save selection:', error)
        }
    }

    const selectedProviderData = providers.find(p => p.id === selectedProvider)
    const selectedModelData = selectedProviderData?.models.find(m => m.id === selectedModel)

    // Filter providers and models based on search query
    const filteredProviders = useMemo(() => {
        if (!searchQuery.trim()) return providers

        return providers
            .map(provider => ({
                ...provider,
                models: provider.models.filter(model =>
                    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    model.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    provider.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
            }))
            .filter(provider =>
                provider.models.length > 0 ||
                provider.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
    }, [providers, searchQuery])

    const formatPricing = (pricing?: { input: number; output: number }) => {
        if (!pricing) return 'Free'
        if (pricing.input === 0 && pricing.output === 0) return 'Free'
        return `$${pricing.input}/${pricing.output} per 1M tokens`
    }

    const formatTokens = (tokens?: number) => {
        if (!tokens) return 'Unknown'
        if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
        if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
        return tokens.toString()
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-600">Loading models...</span>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {/* Model Selection Button */}
            <div className="relative">
                <Button
                    variant="outline"
                    onClick={() => {
                        setIsOpen(!isOpen)
                        if (isOpen) {
                            setSearchQuery('')
                        }
                    }}
                    disabled={disabled}
                    className="w-full justify-between h-auto p-3"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Zap className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="text-left">
                            <div className="font-medium text-sm">
                                {selectedProviderData?.name || 'Select Provider'}
                            </div>
                            <div className="text-xs text-gray-500">
                                {selectedModelData?.name || 'Select Model'}
                            </div>
                        </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </Button>

                {/* Dropdown */}
                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                        {/* Search Input */}
                        <div className="p-3 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search models..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-10"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Results */}
                        <div className="max-h-80 overflow-y-auto">
                            {filteredProviders.length === 0 ? (
                                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                                    No models found matching &quot;{searchQuery}&quot;
                                </div>
                            ) : (
                                filteredProviders.map((provider) => (
                                    <div key={provider.id} className="border-b border-gray-100 last:border-b-0">
                                        <div className={`px-4 py-2 font-medium text-sm ${provider.available ? 'bg-gray-50 text-gray-700' : 'bg-red-50 text-red-700'}`}>
                                            {provider.name}
                                            {!provider.available && (
                                                <div className="text-xs text-red-600 mt-1">
                                                    {provider.availabilityMessage}
                                                </div>
                                            )}
                                        </div>
                                        {provider.models.map((model) => (
                                            <button
                                                key={model.id}
                                                onClick={() => {
                                                    if (model.available) {
                                                        onProviderChange(provider.id)
                                                        onModelChange(model.id)
                                                        saveSelection(provider.id, model.id)
                                                        setIsOpen(false)
                                                    }
                                                }}
                                                disabled={!model.available}
                                                className={`w-full px-4 py-3 text-left transition-colors ${!model.available
                                                    ? 'opacity-50 cursor-not-allowed'
                                                    : 'hover:bg-gray-50'
                                                    } ${selectedProvider === provider.id && selectedModel === model.id
                                                        ? 'bg-blue-50 border-l-4 border-l-blue-600'
                                                        : ''
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-sm text-gray-900">
                                                            {model.name}
                                                        </div>
                                                        {model.description && (
                                                            <div className="text-xs text-gray-500 mt-1">
                                                                {model.description}
                                                            </div>
                                                        )}
                                                        {!model.available && model.availabilityMessage && (
                                                            <div className="text-xs text-red-500 mt-1">
                                                                {model.availabilityMessage}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                                            {model.maxTokens && (
                                                                <div className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {formatTokens(model.maxTokens)} tokens
                                                                </div>
                                                            )}
                                                            {model.pricing && (
                                                                <div className="flex items-center gap-1">
                                                                    <DollarSign className="h-3 w-3" />
                                                                    {formatPricing(model.pricing)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {selectedProvider === provider.id && selectedModel === model.id && (
                                                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Model Details */}
            {selectedModelData && (
                <div className="space-y-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDetails(!showDetails)}
                        className="text-xs text-gray-500 hover:text-gray-700 p-0 h-auto"
                    >
                        <Info className="h-3 w-3 mr-1" />
                        {showDetails ? 'Hide' : 'Show'} model details
                    </Button>

                    {showDetails && (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                                {selectedModelData.maxTokens && (
                                    <div>
                                        <span className="font-medium text-gray-700">Max Tokens:</span>
                                        <span className="ml-2 text-gray-600">
                                            {formatTokens(selectedModelData.maxTokens)}
                                        </span>
                                    </div>
                                )}
                                {selectedModelData.contextWindow && (
                                    <div>
                                        <span className="font-medium text-gray-700">Context Window:</span>
                                        <span className="ml-2 text-gray-600">
                                            {formatTokens(selectedModelData.contextWindow)}
                                        </span>
                                    </div>
                                )}
                                {selectedModelData.pricing && (
                                    <div className="col-span-2">
                                        <span className="font-medium text-gray-700">Pricing:</span>
                                        <span className="ml-2 text-gray-600">
                                            {formatPricing(selectedModelData.pricing)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {selectedModelData.description && (
                                <div>
                                    <span className="font-medium text-gray-700">Description:</span>
                                    <p className="mt-1 text-gray-600">{selectedModelData.description}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
