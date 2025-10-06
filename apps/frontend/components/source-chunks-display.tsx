'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SourceChunk } from '@/lib/types/chat'

interface SourceChunksDisplayProps {
    sourceChunks: SourceChunk[]
    className?: string
    onViewDocument?: (documentId: string) => void
    loadingDocument?: boolean
}

export function SourceChunksDisplay({ sourceChunks, className = '', onViewDocument, loadingDocument = false }: SourceChunksDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [expandedChunk, setExpandedChunk] = useState<string | null>(null)

    if (!sourceChunks || sourceChunks.length === 0) {
        return null
    }

    const truncateText = (text: string, maxLength: number = 200) => {
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength) + '...'
    }

    const formatSimilarity = (similarity: number) => {
        return `${Math.round(similarity * 100)}%`
    }

    return (
        <div className={`bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
            <div className="p-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full justify-between p-0 h-auto text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>Sources ({sourceChunks.length})</span>
                    </div>
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </Button>

                {isExpanded && (
                    <div className="mt-3 space-y-2">
                        {sourceChunks.map((chunk, index) => (
                            <div
                                key={chunk.id}
                                className="bg-white rounded border border-gray-200 p-3 hover:shadow-sm transition-shadow"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-500">
                                            Source {index + 1}
                                        </span>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="text-xs text-gray-500">
                                            {formatSimilarity(chunk.similarity)} match
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setExpandedChunk(
                                            expandedChunk === chunk.id ? null : chunk.id
                                        )}
                                        className="p-0 h-auto text-xs text-gray-500 hover:text-gray-700"
                                    >
                                        {expandedChunk === chunk.id ? 'Show less' : 'Show more'}
                                    </Button>
                                </div>

                                <div className="text-sm text-gray-700">
                                    {expandedChunk === chunk.id
                                        ? chunk.content
                                        : truncateText(chunk.content)
                                    }
                                </div>

                                <div className="mt-2 flex items-center justify-between">
                                    <div className="text-xs text-gray-500">
                                        {chunk.documentName}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewDocument?.(chunk.documentId)}
                                        disabled={loadingDocument}
                                        className="p-0 h-auto text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        {loadingDocument ? 'Loading...' : 'View document'}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
