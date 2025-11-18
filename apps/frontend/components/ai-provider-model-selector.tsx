'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aiProviderApi, type AiProvider, type Model } from '@/lib/api'

interface AiProviderModelSelectorProps {
    selectedProviderId?: string
    selectedModel?: string
    onProviderChange: (providerId: string) => void
    onModelChange: (model: string) => void
    disabled?: boolean
    loading?: boolean
    label?: string
}

export function AiProviderModelSelector({
    selectedProviderId,
    selectedModel,
    onProviderChange,
    onModelChange,
    disabled = false,
    loading = false,
    label,
}: AiProviderModelSelectorProps) {
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [models, setModels] = useState<Model[]>([])
    const [loadingProviders, setLoadingProviders] = useState(false)

    // Provider selection state
    const [providerSearchQuery, setProviderSearchQuery] = useState('')
    const [showProviderDropdown, setShowProviderDropdown] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null)
    const providerInputRef = useRef<HTMLInputElement>(null)
    const providerDropdownRef = useRef<HTMLDivElement>(null)

    // Model selection state
    const [modelSearchQuery, setModelSearchQuery] = useState('')
    const [showModelDropdown, setShowModelDropdown] = useState(false)
    const [selectedModelData, setSelectedModelData] = useState<Model | null>(null)
    const modelInputRef = useRef<HTMLInputElement>(null)
    const modelDropdownRef = useRef<HTMLDivElement>(null)

    // Load providers on mount
    useEffect(() => {
        if (!loading) {
            loadProviders()
        }
    }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync selected provider when selectedProviderId or providers change
    useEffect(() => {
        if (selectedProviderId && providers.length > 0) {
            const provider = providers.find(p => p.id === selectedProviderId)
            if (provider) {
                setSelectedProvider(provider)
                setProviderSearchQuery(provider.name)
            } else {
                setSelectedProvider(null)
                setProviderSearchQuery('')
            }
        } else {
            setSelectedProvider(null)
            setProviderSearchQuery('')
        }
    }, [selectedProviderId, providers])

    // Load models when provider changes
    useEffect(() => {
        const providerId = selectedProviderId || selectedProvider?.id
        if (providerId && providers.length > 0) {
            const provider = providers.find(p => p.id === providerId)
            if (provider && provider.models) {
                console.log('Loading models for provider:', provider.name, 'Models count:', provider.models.length)
                setModels(provider.models || [])
            } else {
                console.warn('Provider not found or has no models:', providerId)
                setModels([])
            }
        } else {
            setModels([])
        }
    }, [selectedProviderId, selectedProvider, providers]) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync selected model when selectedModel or models change
    useEffect(() => {
        if (selectedModel && models.length > 0) {
            const model = models.find(m => m.id === selectedModel)
            if (model) {
                setSelectedModelData(model)
                setModelSearchQuery(model.name)
            } else {
                setSelectedModelData(null)
                setModelSearchQuery('')
            }
        } else {
            setSelectedModelData(null)
            setModelSearchQuery('')
        }
    }, [selectedModel, models])

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node) &&
                providerInputRef.current && !providerInputRef.current.contains(event.target as Node)) {
                setShowProviderDropdown(false)
            }
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node) &&
                modelInputRef.current && !modelInputRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false)
            }
        }

        if (showProviderDropdown || showModelDropdown) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showProviderDropdown, showModelDropdown])

    const loadProviders = async () => {
        setLoadingProviders(true)
        try {
            const response = await aiProviderApi.getAll()
            const loadedProviders = response.data || []
            setProviders(loadedProviders)
        } catch (error) {
            console.error('Failed to load providers:', error)
        } finally {
            setLoadingProviders(false)
        }
    }

    // Filter providers based on search
    const filteredProviders = useMemo(() => {
        if (!providerSearchQuery.trim()) return providers
        return providers.filter(provider =>
            provider.name.toLowerCase().includes(providerSearchQuery.toLowerCase()) ||
            provider.type?.toLowerCase().includes(providerSearchQuery.toLowerCase())
        )
    }, [providers, providerSearchQuery])

    // Filter models based on search
    const filteredModels = useMemo(() => {
        if (!modelSearchQuery.trim()) return models
        return models.filter(model =>
            model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
            model.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
            model.description?.toLowerCase().includes(modelSearchQuery.toLowerCase())
        )
    }, [models, modelSearchQuery])

    const handleProviderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value
        setProviderSearchQuery(query)
        setShowProviderDropdown(true)

        // If user clears the input, clear selection
        if (!query.trim()) {
            onProviderChange('')
            setSelectedProvider(null)
        }
    }

    const handleProviderInputFocus = () => {
        setShowProviderDropdown(true)
    }

    const handleSelectProvider = (provider: AiProvider) => {
        console.log('Selecting provider:', provider.id, provider.name)
        setSelectedProvider(provider)
        setProviderSearchQuery(provider.name)
        setShowProviderDropdown(false)
        // Reset model when provider changes
        onModelChange('')
        // Call parent callback to update state
        onProviderChange(provider.id)
        // Immediately load models for this provider
        if (provider.models && provider.models.length > 0) {
            console.log('Setting models immediately:', provider.models.length)
            setModels(provider.models)
        }
    }

    const handleModelInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value
        setModelSearchQuery(query)
        setShowModelDropdown(true)

        // If user clears the input, clear selection
        if (!query.trim()) {
            onModelChange('')
            setSelectedModelData(null)
        }
    }

    const handleModelInputFocus = () => {
        setShowModelDropdown(true)
    }

    const handleSelectModel = (model: Model) => {
        onModelChange(model.id)
        setSelectedModelData(model)
        setModelSearchQuery(model.name)
        setShowModelDropdown(false)
    }

    return (
        <div className="space-y-4">
            {/* AI Provider Selection */}
            <div className="space-y-2">
                {label && <Label htmlFor="aiProvider">{label}</Label>}
                <div className="relative" ref={providerDropdownRef}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            ref={providerInputRef}
                            id="aiProvider"
                            type="text"
                            value={providerSearchQuery}
                            onChange={handleProviderInputChange}
                            onFocus={handleProviderInputFocus}
                            placeholder="Search and select AI provider..."
                            disabled={disabled || loadingProviders || loading}
                            className="pl-10 pr-10"
                        />
                        {providerSearchQuery && (
                            <button
                                type="button"
                                onClick={() => {
                                    setProviderSearchQuery('')
                                    onProviderChange('')
                                    setSelectedProvider(null)
                                    providerInputRef.current?.focus()
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            disabled={disabled || loadingProviders || loading}
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {showProviderDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-hidden">
                            <div className="max-h-64 overflow-y-auto">
                                {loadingProviders ? (
                                    <div className="px-4 py-8 text-center text-sm text-gray-500">
                                        Loading providers...
                                    </div>
                                ) : filteredProviders.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-gray-500">
                                        {providerSearchQuery ? `No providers found matching "${providerSearchQuery}"` : 'No providers available'}
                                    </div>
                                ) : (
                                    filteredProviders.map((provider) => (
                                        <button
                                            key={provider.id}
                                            type="button"
                                            onClick={() => handleSelectProvider(provider)}
                                            className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${selectedProviderId === provider.id ? 'bg-blue-50 text-blue-700 font-medium' : ''
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {selectedProviderId === provider.id && (
                                                    <Check className="h-4 w-4 text-blue-600" />
                                                )}
                                                <span>{provider.name}</span>
                                                {provider.type && (
                                                    <span className="text-xs text-gray-500">({provider.type})</span>
                                                )}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
                {loadingProviders && (
                    <p className="text-xs text-gray-500">Loading providers...</p>
                )}
            </div>

            {/* Model Selection - Only show when provider is selected */}
            {(selectedProviderId || selectedProvider) && (
                <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <div className="relative" ref={modelDropdownRef}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                ref={modelInputRef}
                                id="model"
                                type="text"
                                value={modelSearchQuery}
                                onChange={handleModelInputChange}
                                onFocus={handleModelInputFocus}
                                placeholder="Search and select model..."
                                disabled={disabled || !(selectedProviderId || selectedProvider)}
                                className="pl-10 pr-10"
                            />
                            {modelSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setModelSearchQuery('')
                                        onModelChange('')
                                        setSelectedModelData(null)
                                        modelInputRef.current?.focus()
                                    }}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                disabled={disabled || !(selectedProviderId || selectedProvider)}
                            >
                                <ChevronDown className={`h-4 w-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {showModelDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-hidden">
                                <div className="max-h-64 overflow-y-auto">
                                    {filteredModels.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                                            {modelSearchQuery ? `No models found matching "${modelSearchQuery}"` : 'No models available'}
                                        </div>
                                    ) : (
                                        filteredModels.map((model) => (
                                            <button
                                                key={model.id}
                                                type="button"
                                                onClick={() => handleSelectModel(model)}
                                                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${selectedModel === model.id ? 'bg-blue-50 text-blue-700 font-medium' : ''
                                                    }`}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        {selectedModel === model.id && (
                                                            <Check className="h-4 w-4 text-blue-600" />
                                                        )}
                                                        <span className="font-medium">{model.name}</span>
                                                    </div>
                                                    {model.description && (
                                                        <div className="text-xs text-gray-500 mt-0.5">{model.description}</div>
                                                    )}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
