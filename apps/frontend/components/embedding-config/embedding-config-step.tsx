'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { UnifiedEmbeddingConfigComponent, UnifiedEmbeddingConfig } from './unified-config'

// Re-export the interfaces for external use
export type { UnifiedEmbeddingConfig }

export interface EmbeddingConfigData {
    config: UnifiedEmbeddingConfig
}

interface EmbeddingConfigStepProps {
    config: EmbeddingConfigData
    onChange: (config: EmbeddingConfigData) => void
    disabled?: boolean
    uploadedDocumentsCount?: number
}

const DEFAULT_UNIFIED_CONFIG: UnifiedEmbeddingConfig = {
    embeddingProvider: 'local',
    embeddingModel: 'Xenova/bge-m3',
    chunkSize: 1000,
    chunkOverlap: 200,
    textSplitter: 'recursive_character',
    enableParentChildChunking: false,
}

export function EmbeddingConfigStep({
    config,
    onChange,
    disabled = false,
    uploadedDocumentsCount = 0
}: EmbeddingConfigStepProps) {
    const handleConfigChange = (unifiedConfig: UnifiedEmbeddingConfig) => {
        const newConfig = {
            ...config,
            config: unifiedConfig,
        }
        onChange(newConfig)
    }

    const getConfigSummary = () => {
        const current = config.config || DEFAULT_UNIFIED_CONFIG
        return {
            method: 'Standard Configuration',
            chunkSize: current.chunkSize,
            chunkOverlap: current.chunkOverlap,
            embeddingModel: current.embeddingModel,
            embeddingProvider: current.embeddingProvider,
            features: [
                current.enableParentChildChunking && 'Hierarchical Text Segmentation'
            ].filter(Boolean)
        }
    }

    const summary = getConfigSummary()

    return (
        <div className="space-y-6">
            {/* Embedding Configuration Component */}
            <div className="space-y-4">
                <UnifiedEmbeddingConfigComponent
                    config={config.config || DEFAULT_UNIFIED_CONFIG}
                    onChange={handleConfigChange}
                    disabled={disabled}
                />
            </div>

            {/* Configuration Summary */}
            <Card className="bg-gray-50 border-gray-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-900">Configuration Summary</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="font-medium text-gray-700">Method:</span>
                                <Badge variant="outline" className="text-blue-600">
                                    {summary.method}
                                </Badge>
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>Provider: <span className="font-medium">{summary.embeddingProvider}</span></div>
                                <div>Model: <span className="font-medium">{summary.embeddingModel}</span></div>
                                <div>Text Segment Size: <span className="font-medium">{summary.chunkSize}</span> chars</div>
                                <div>Segment Overlap: <span className="font-medium">{summary.chunkOverlap}</span> chars</div>
                            </div>
                        </div>
                        <div>
                            <div className="font-medium text-gray-700 mb-2">Features:</div>
                            <div className="space-y-1">
                                {summary.features.length > 0 ? (
                                    summary.features.map((feature, index) => (
                                        <div key={index} className="text-gray-600 flex items-center space-x-1">
                                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                            <span>{feature}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-gray-500 italic">No additional features enabled</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Processing Summary */}
            {uploadedDocumentsCount > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-4">
                        <div className="flex items-start space-x-2">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <strong>Ready to Process:</strong> {uploadedDocumentsCount} document{uploadedDocumentsCount !== 1 ? 's' : ''} will be processed with the selected configuration.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
