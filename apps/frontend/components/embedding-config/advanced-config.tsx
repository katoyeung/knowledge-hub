'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Info, Settings, ChevronDown, ChevronUp } from 'lucide-react'

export interface AdvancedConfig {
    // Legacy embedding settings
    embeddingModel: 'Xenova/bge-m3' | 'mixedbread-ai/mxbai-embed-large-v1' | 'WhereIsAI/UAE-Large-V1' | 'custom'
    customModelName?: string
    textSplitter: 'recursive_character' | 'character' | 'token' | 'markdown' | 'python_code'
    chunkSize: number
    chunkOverlap: number
    enableParentChildChunking: boolean
    useModelDefaults: boolean

    // Advanced settings
    separators?: string[]
    embeddingModelProvider?: string
}

interface AdvancedConfigProps {
    config: AdvancedConfig
    onChange: (config: AdvancedConfig) => void
    disabled?: boolean
}

const EMBEDDING_MODELS = {
    'Xenova/bge-m3': 'BGE M3 - Multilingual (1024 dims) ⭐',
    'mixedbread-ai/mxbai-embed-large-v1': 'MixedBread AI - High Quality English (1024 dims)',
    'WhereIsAI/UAE-Large-V1': 'UAE Large V1 - Universal Angle (1024 dims)',
    'custom': 'Custom Model (must be 1024 dimensions)',
}

const TEXT_SPLITTERS = {
    'recursive_character': 'Recursive Character Text Splitter',
    'character': 'Character Text Splitter',
    'token': 'Token Text Splitter',
    'markdown': 'Markdown Text Splitter',
    'python_code': 'Python Code Text Splitter',
}

export function AdvancedConfigComponent({
    config,
    onChange,
    disabled = false
}: AdvancedConfigProps) {
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [localEmbeddingModel, setLocalEmbeddingModel] = useState(config.embeddingModel)

    // Update local state when config changes
    useEffect(() => {
        setLocalEmbeddingModel(config.embeddingModel)
    }, [config.embeddingModel])

    const handleConfigChange = (updates: Partial<AdvancedConfig>) => {
        onChange({ ...config, ...updates })
    }

    // Handle embedding model change specifically with optimizations
    const handleEmbeddingModelChange = (value: string) => {
        setLocalEmbeddingModel(value)

        // Apply model-specific optimizations
        let optimizedChunkSize = config.chunkSize
        let optimizedChunkOverlap = config.chunkOverlap

        switch (value) {
            case 'Xenova/bge-m3':
                optimizedChunkSize = 800
                optimizedChunkOverlap = 80
                break
            case 'mixedbread-ai/mxbai-embed-large-v1':
                optimizedChunkSize = 1000
                optimizedChunkOverlap = 100
                break
            case 'WhereIsAI/UAE-Large-V1':
                optimizedChunkSize = 900
                optimizedChunkOverlap = 90
                break
            default:
                // Keep current values for custom models
                break
        }

        const newConfig = {
            ...config,
            embeddingModel: value as AdvancedConfig['embeddingModel'],
            chunkSize: optimizedChunkSize,
            chunkOverlap: optimizedChunkOverlap
        }
        onChange(newConfig)
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex items-center space-x-2">
                    <Settings className="h-5 w-5 text-orange-600" />
                    <CardTitle className="text-lg">Advanced Configuration</CardTitle>
                    <Badge variant="outline" className="text-orange-600 border-orange-200">
                        Expert
                    </Badge>
                </div>
                <p className="text-sm text-gray-600">
                    Advanced settings for specialized document processing.
                </p>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Basic Embedding Settings */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-900">Embedding Settings</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Embedding Model */}
                        <div className="md:col-span-2">
                            <Label htmlFor="embeddingModel" className="text-sm font-medium">
                                Embedding Model
                            </Label>
                            <select
                                value={localEmbeddingModel}
                                onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                                disabled={disabled}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            >
                                {Object.entries(EMBEDDING_MODELS).map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Model Settings Indicator */}
                        {localEmbeddingModel !== 'custom' && (
                            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md">
                                <div className="flex items-center space-x-2 mb-2">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                    <span className="text-sm font-medium text-orange-900">Settings Adjusted for Model</span>
                                </div>
                                <div className="text-xs text-orange-700">
                                    <div>Segment Size: <span className="font-medium">{config.chunkSize}</span> chars</div>
                                    <div>Segment Overlap: <span className="font-medium">{config.chunkOverlap}</span> chars</div>
                                </div>
                            </div>
                        )}

                        {config.embeddingModel === 'custom' && (
                            <div className="md:col-span-2">
                                <Label htmlFor="customModelName" className="text-sm font-medium">
                                    Custom Model Name
                                </Label>
                                <Input
                                    id="customModelName"
                                    value={config.customModelName || ''}
                                    onChange={(e) => handleConfigChange({ customModelName: e.target.value })}
                                    placeholder="e.g., sentence-transformers/all-MiniLM-L6-v2"
                                    disabled={disabled}
                                    className="mt-1"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Must be a 1024-dimension model for compatibility
                                </p>
                            </div>
                        )}

                        {/* Text Splitter */}
                        <div>
                            <Label htmlFor="textSplitter" className="text-sm font-medium">
                                Text Splitter
                            </Label>
                            <Select
                                value={config.textSplitter}
                                onValueChange={(value) => handleConfigChange({ textSplitter: value as AdvancedConfig['textSplitter'] })}
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
                        </div>

                        {/* Embedding Model Provider */}
                        <div>
                            <Label htmlFor="embeddingModelProvider" className="text-sm font-medium">
                                Embedding Model Provider
                            </Label>
                            <Input
                                id="embeddingModelProvider"
                                value={config.embeddingModelProvider || ''}
                                onChange={(e) => handleConfigChange({ embeddingModelProvider: e.target.value })}
                                placeholder="e.g., HuggingFace, OpenAI"
                                disabled={disabled}
                                className="mt-1"
                            />
                        </div>
                    </div>
                </div>

                {/* Text Segmentation Settings */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-900">Text Segmentation Settings</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Text Segment Size */}
                        <div>
                            <Label htmlFor="chunkSize" className="text-sm font-medium">
                                Text Segment Size
                            </Label>
                            <Input
                                id="chunkSize"
                                type="number"
                                value={config.chunkSize}
                                onChange={(e) => handleConfigChange({ chunkSize: parseInt(e.target.value) || 1000 })}
                                min={100}
                                max={8000}
                                disabled={disabled}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Characters per text segment (100-8000)
                            </p>
                        </div>

                        {/* Segment Overlap */}
                        <div>
                            <Label htmlFor="chunkOverlap" className="text-sm font-medium">
                                Segment Overlap
                            </Label>
                            <Input
                                id="chunkOverlap"
                                type="number"
                                value={config.chunkOverlap}
                                onChange={(e) => handleConfigChange({ chunkOverlap: parseInt(e.target.value) || 200 })}
                                min={0}
                                max={Math.floor(config.chunkSize / 2)}
                                disabled={disabled}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Overlap between segments (0-{Math.floor(config.chunkSize / 2)})
                            </p>
                        </div>
                    </div>

                    {/* Model-specific settings toggle */}
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="useModelDefaults"
                            checked={config.useModelDefaults}
                            onChange={(e) => handleConfigChange({ useModelDefaults: e.target.checked })}
                            disabled={disabled}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <Label htmlFor="useModelDefaults" className="text-sm font-medium">
                            Use recommended settings for this model
                        </Label>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">
                        Automatically adjust settings for the selected model
                    </p>

                    {/* Hierarchical Text Segmentation */}
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="enableParentChildChunking"
                                checked={config.enableParentChildChunking}
                                onChange={(e) => handleConfigChange({ enableParentChildChunking: e.target.checked })}
                                disabled={disabled}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <Label htmlFor="enableParentChildChunking" className="text-sm font-medium">
                                Enable Hierarchical Text Segmentation (Advanced)
                            </Label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">
                            Creates hierarchical text segments for better search results. Works with PDF documents.
                        </p>
                        {config.enableParentChildChunking && (
                            <div className="ml-6 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <div className="flex items-start space-x-2">
                                    <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                                    <div className="text-xs text-blue-700">
                                        <strong>How it works:</strong> Creates larger context segments and smaller precise segments for better search results.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Advanced Settings Toggle */}
                <div className="border-t pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full justify-between p-0 h-auto"
                        disabled={disabled}
                    >
                        <div className="flex items-center space-x-2">
                            <Settings className="h-4 w-4" />
                            <span className="text-sm font-medium">Expert Settings</span>
                        </div>
                        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Expert Settings */}
                {showAdvanced && (
                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-sm font-medium text-gray-900">Expert Configuration</h3>


                        {/* Custom Separators */}
                        <div>
                            <Label htmlFor="separators" className="text-sm font-medium">
                                Custom Separators (Optional)
                            </Label>
                            <Input
                                id="separators"
                                value={config.separators?.join(', ') || ''}
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

                        {/* Warning for Expert Settings */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-start space-x-2">
                                <Info className="h-4 w-4 text-yellow-600 mt-0.5" />
                                <div className="text-sm text-yellow-800">
                                    <strong>Expert Settings:</strong> These settings affect search quality. Only modify if you understand the impact.
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
