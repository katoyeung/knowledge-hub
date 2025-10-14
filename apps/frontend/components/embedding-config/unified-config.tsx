'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Zap, Settings, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { EmbeddingConfigService } from '@/lib/services/embedding-config.service'

export interface UnifiedEmbeddingConfig {
    // Basic settings
    embeddingProvider: 'local' | 'ollama' | 'dashscope'
    embeddingModel: string
    customModelName?: string
    chunkSize: number
    chunkOverlap: number

    // Advanced settings
    textSplitter: 'recursive_character' | 'character' | 'token' | 'sentence_splitter' | 'smart_chunking' | 'markdown' | 'python_code'
    enableParentChildChunking: boolean
    separators?: string[]
}

interface UnifiedConfigProps {
    config: UnifiedEmbeddingConfig
    onChange: (config: UnifiedEmbeddingConfig) => void
    disabled?: boolean
}

const DEFAULT_CONFIG: UnifiedEmbeddingConfig = {
    embeddingProvider: 'local',
    embeddingModel: 'Xenova/bge-m3',
    chunkSize: 1000,
    chunkOverlap: 200,
    textSplitter: 'smart_chunking',
    enableParentChildChunking: false,
}

const EMBEDDING_PROVIDERS = {
    'local': 'Local Models',
    'ollama': 'Ollama',
    'dashscope': 'DashScope (Alibaba Cloud)',
}

const EMBEDDING_MODELS = {
    local: {
        'Xenova/bge-m3': 'BGE M3 - Multilingual (1024 dims) ⭐',
        'mixedbread-ai/mxbai-embed-large-v1': 'MixedBread AI - High Quality English (1024 dims)',
        'WhereIsAI/UAE-Large-V1': 'UAE Large V1 - Universal Angle (1024 dims)',
        'custom': 'Custom Model (must be 1024 dimensions)',
    },
    ollama: {
        'qwen3-embedding:0.6b': 'Qwen3 Embedding 0.6B (Ollama) ⭐',
        'qwen3-embedding:4b': 'Qwen3 Embedding 4B (Ollama)',
        'embeddinggemma:300m': 'Embedding Gemma 300M (Ollama)',
        'nomic-embed-text:v1.5': 'Nomic Embed Text v1.5 (Ollama)',
        'custom': 'Custom Ollama Model',
    },
    dashscope: {
        'text-embedding-v1': 'Text Embedding V1 (DashScope)',
        'text-embedding-v2': 'Text Embedding V2 (DashScope)',
        'text-embedding-v3': 'Text Embedding V3 (DashScope)',
        'text-embedding-v4': 'Text Embedding V4 (DashScope) ⭐',
        'custom': 'Custom DashScope Model',
    },
}

const TEXT_SPLITTERS = {
    'smart_chunking': 'Smart Text Segmentation (Recommended) ⭐',
    'sentence_splitter': 'Sentence-Aware Text Splitter',
    'recursive_character': 'Recursive Character Text Splitter',
    'character': 'Character Text Splitter',
    'token': 'Token Text Splitter',
    'markdown': 'Markdown Text Splitter',
    'python_code': 'Python Code Text Splitter',
}

export function UnifiedEmbeddingConfigComponent({
    config,
    onChange,
    disabled = false
}: UnifiedConfigProps) {
    const [showAdvanced, setShowAdvanced] = useState(false)
    const safeConfig = config || DEFAULT_CONFIG
    const [localEmbeddingModel, setLocalEmbeddingModel] = useState(safeConfig.embeddingModel || 'Xenova/bge-m3')
    const [localEmbeddingProvider, setLocalEmbeddingProvider] = useState(safeConfig.embeddingProvider || 'local')

    // Update local state when config changes
    useEffect(() => {
        setLocalEmbeddingModel(safeConfig.embeddingModel || 'Xenova/bge-m3')
        setLocalEmbeddingProvider(safeConfig.embeddingProvider || 'local')
    }, [safeConfig.embeddingModel, safeConfig.embeddingProvider])

    // Handle configuration changes
    const handleConfigChange = (updates: Partial<UnifiedEmbeddingConfig>) => {
        const newConfig = { ...safeConfig, ...updates }
        onChange(newConfig)
    }

    // Handle embedding provider change
    const handleEmbeddingProviderChange = (value: string) => {
        const provider = value as 'local' | 'ollama' | 'dashscope'
        setLocalEmbeddingProvider(provider)

        // Reset model to first available model for the provider
        const providerModels = EMBEDDING_MODELS[provider]
        const firstModel = providerModels ? Object.keys(providerModels)[0] : 'custom'
        setLocalEmbeddingModel(firstModel)

        const newConfig = {
            ...safeConfig,
            embeddingProvider: provider,
            embeddingModel: firstModel,
        }
        onChange(newConfig)
    }

    // Handle embedding model change with optimizations
    const handleEmbeddingModelChange = (value: string) => {
        setLocalEmbeddingModel(value)

        // Determine provider based on selected model
        let newProvider = localEmbeddingProvider
        if (EMBEDDING_MODELS.local[value as keyof typeof EMBEDDING_MODELS.local]) {
            newProvider = 'local'
        } else if (EMBEDDING_MODELS.ollama[value as keyof typeof EMBEDDING_MODELS.ollama]) {
            newProvider = 'ollama'
        } else if (EMBEDDING_MODELS.dashscope[value as keyof typeof EMBEDDING_MODELS.dashscope]) {
            newProvider = 'dashscope'
        }

        // Update provider if it changed
        if (newProvider !== localEmbeddingProvider) {
            setLocalEmbeddingProvider(newProvider)
        }

        // Apply model-specific optimizations
        let optimizedChunkSize = safeConfig.chunkSize
        let optimizedChunkOverlap = safeConfig.chunkOverlap

        switch (value) {
            case 'Xenova/bge-m3':
                optimizedChunkSize = 2000
                optimizedChunkOverlap = 200
                break
            case 'qwen3-embedding:0.6b':
                optimizedChunkSize = 8000
                optimizedChunkOverlap = 800
                break
            case 'mixedbread-ai/mxbai-embed-large-v1':
            case 'qwen3-embedding:4b':
                optimizedChunkSize = 10000
                optimizedChunkOverlap = 1000
                break
            case 'WhereIsAI/UAE-Large-V1':
            case 'nomic-embed-text:v1.5':
                optimizedChunkSize = 3000
                optimizedChunkOverlap = 300
                break
            case 'embeddinggemma:300m':
                optimizedChunkSize = 1500
                optimizedChunkOverlap = 150
                break
            case 'text-embedding-v4':
                optimizedChunkSize = 4000
                optimizedChunkOverlap = 400
                break
            default:
                // Keep current values for custom models
                break
        }

        const newConfig = {
            ...safeConfig,
            embeddingProvider: newProvider,
            embeddingModel: value,
            chunkSize: optimizedChunkSize,
            chunkOverlap: optimizedChunkOverlap
        }
        onChange(newConfig)
    }

    const resetToDefaults = () => {
        onChange(DEFAULT_CONFIG)
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Zap className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-lg">Embedding Configuration</CardTitle>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Recommended
                        </Badge>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={resetToDefaults}
                        disabled={disabled}
                    >
                        Reset to Defaults
                    </Button>
                </div>
                <p className="text-sm text-gray-600">
                    Configure how your documents will be processed for search.
                </p>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Basic Settings - Always Visible */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-900">Basic Settings</h3>

                    {/* Embedding Provider */}
                    <div>
                        <Label htmlFor="embeddingProvider" className="text-sm font-medium">
                            Embedding Provider
                        </Label>
                        <p className="text-sm text-gray-600 mb-2">
                            Select where to generate embeddings from.
                        </p>
                        <select
                            value={localEmbeddingProvider}
                            onChange={(e) => handleEmbeddingProviderChange(e.target.value)}
                            disabled={disabled}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                            {Object.entries(EMBEDDING_PROVIDERS).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Embedding Model */}
                    <div>
                        <Label htmlFor="embeddingModel" className="text-sm font-medium">
                            Embedding Model
                        </Label>
                        <p className="text-sm text-gray-600 mb-2">
                            Select the AI model for processing your documents.
                        </p>
                        <select
                            value={localEmbeddingModel}
                            onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                            disabled={disabled}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                            {localEmbeddingProvider && EMBEDDING_MODELS[localEmbeddingProvider] &&
                                Object.entries(EMBEDDING_MODELS[localEmbeddingProvider]).map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))
                            }
                        </select>

                        {safeConfig.embeddingModel === 'custom' && (
                            <div className="mt-3">
                                <Label htmlFor="customModelName" className="text-sm font-medium">
                                    Custom Model Name
                                </Label>
                                <Input
                                    id="customModelName"
                                    value={safeConfig.customModelName || ''}
                                    onChange={(e) => handleConfigChange({ customModelName: e.target.value })}
                                    placeholder={
                                        localEmbeddingProvider === 'local'
                                            ? "e.g., sentence-transformers/all-MiniLM-L6-v2"
                                            : localEmbeddingProvider === 'ollama'
                                                ? "e.g., qwen3-embedding:0.6b"
                                                : "e.g., text-embedding-v4"
                                    }
                                    disabled={disabled}
                                    className="mt-1"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {localEmbeddingProvider === 'local'
                                        ? "Must be a 1024-dimension model for compatibility"
                                        : localEmbeddingProvider === 'ollama'
                                            ? "Enter the Ollama model name (e.g., qwen3-embedding:0.6b)"
                                            : "Enter the DashScope model name (e.g., text-embedding-v4)"
                                    }
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Text Segment Size & Overlap */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="chunkSize" className="text-sm font-medium">
                                Text Segment Size
                            </Label>
                            <Input
                                id="chunkSize"
                                type="number"
                                value={safeConfig.chunkSize}
                                onChange={(e) => handleConfigChange({ chunkSize: parseInt(e.target.value) || 1000 })}
                                min={100}
                                max={12000}
                                disabled={disabled}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Characters per text segment (100-12000)
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="chunkOverlap" className="text-sm font-medium">
                                Segment Overlap
                            </Label>
                            <Input
                                id="chunkOverlap"
                                type="number"
                                value={safeConfig.chunkOverlap}
                                onChange={(e) => handleConfigChange({ chunkOverlap: parseInt(e.target.value) || 200 })}
                                min={0}
                                max={Math.floor(safeConfig.chunkSize * EmbeddingConfigService.getMaxOverlapRatioForModel(safeConfig.embeddingModel))}
                                disabled={disabled}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Overlap between segments (0-{Math.floor(safeConfig.chunkSize * EmbeddingConfigService.getMaxOverlapRatioForModel(safeConfig.embeddingModel))})
                            </p>
                        </div>
                    </div>
                </div>

                {/* Advanced Settings - Collapsible */}
                <div className="border-t pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full justify-between p-0 h-auto"
                        disabled={disabled}
                    >
                        <div className="flex items-center space-x-2">
                            <Settings className="h-4 w-4" />
                            <span className="text-sm font-medium">Advanced Settings</span>
                        </div>
                        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>

                {showAdvanced && (
                    <div className="space-y-4 pt-4 border-t">
                        {/* Text Splitter */}
                        <div>
                            <Label htmlFor="textSplitter" className="text-sm font-medium">
                                Text Splitter
                            </Label>
                            <Select
                                value={safeConfig.textSplitter}
                                onValueChange={(value: string) => handleConfigChange({ textSplitter: value as UnifiedEmbeddingConfig['textSplitter'] })}
                                disabled={disabled}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(TEXT_SPLITTERS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">
                                How to split text into segments
                            </p>
                        </div>

                        {/* Parent-Child Text Segmentation */}
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="enableParentChildChunking"
                                    checked={safeConfig.enableParentChildChunking}
                                    onChange={(e) => handleConfigChange({ enableParentChildChunking: e.target.checked })}
                                    disabled={disabled}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <Label htmlFor="enableParentChildChunking" className="text-sm font-medium">
                                    Enable Hierarchical Text Segmentation
                                </Label>
                            </div>
                            <p className="text-xs text-gray-500 ml-6">
                                Creates hierarchical text segments for better search results. Works with PDF documents.
                            </p>
                        </div>


                        {/* Custom Separators */}
                        <div>
                            <Label htmlFor="separators" className="text-sm font-medium">
                                Custom Separators (Optional)
                            </Label>
                            <Input
                                id="separators"
                                value={safeConfig.separators?.join(', ') || ''}
                                onChange={(e) => handleConfigChange({
                                    separators: e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined
                                })}
                                placeholder="e.g., \n\n, \n, ."
                                disabled={disabled}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Custom text separators (comma-separated)
                            </p>
                        </div>


                        {/* Expert Settings Warning */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-start space-x-2">
                                <Info className="h-4 w-4 text-yellow-600 mt-0.5" />
                                <div className="text-sm text-yellow-800">
                                    <strong>Advanced Settings:</strong> These settings affect search quality. Only modify if you understand the impact.
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
