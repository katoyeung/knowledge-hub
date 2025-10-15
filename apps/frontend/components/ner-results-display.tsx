'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tag, Calendar, Hash, CheckCircle, XCircle, Clock } from 'lucide-react'
import { NerKeywords } from '@/lib/api'

interface NerResultsDisplayProps {
    keywords?: NerKeywords
    status?: string
    className?: string
    showHeader?: boolean
    compact?: boolean
}

export function NerResultsDisplay({
    keywords,
    status,
    className = '',
    showHeader = true,
    compact = false
}: NerResultsDisplayProps) {
    // Check if NER processing is completed and has results
    const hasNerResults = keywords && keywords.extracted && keywords.extracted.length > 0
    const isNerCompleted = status === 'completed'
    const isNerProcessing = status === 'ner_processing'
    const isNerFailed = status === 'ner_failed'

    if (compact) {
        if (!hasNerResults) {
            return (
                <div className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}>
                    {isNerProcessing && <Clock className="h-4 w-4 animate-spin" />}
                    {isNerFailed && <XCircle className="h-4 w-4 text-red-500" />}
                    {!isNerProcessing && !isNerFailed && <Hash className="h-4 w-4" />}
                    <span>
                        {isNerProcessing ? 'Processing NER...' :
                            isNerFailed ? 'NER failed' :
                                'No entities found'}
                    </span>
                </div>
            )
        }

        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">
                    {keywords.count} entities
                </span>
                <div className="flex flex-wrap gap-1">
                    {keywords.extracted.slice(0, 3).map((entity, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                            {entity}
                        </Badge>
                    ))}
                    {keywords.extracted.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                            +{keywords.extracted.length - 3} more
                        </Badge>
                    )}
                </div>
            </div>
        )
    }

    return (
        <Card className={`${className}`}>
            {showHeader && (
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                        <Tag className="h-4 w-4" />
                        Named Entity Recognition Results
                        {isNerCompleted && hasNerResults && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {isNerFailed && (
                            <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        {isNerProcessing && (
                            <Clock className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                    </CardTitle>
                </CardHeader>
            )}

            <CardContent className="pt-0">
                {isNerProcessing && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Clock className="h-4 w-4 animate-spin" />
                        <span>Processing entities...</span>
                    </div>
                )}

                {isNerFailed && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span>Entity extraction failed</span>
                    </div>
                )}

                {isNerCompleted && !hasNerResults && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Hash className="h-4 w-4" />
                        <span>No entities found in this segment</span>
                    </div>
                )}

                {hasNerResults && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                                Found <span className="font-medium text-gray-900">{keywords.count}</span> entities
                            </span>
                            {keywords.extractedAt && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                        {new Date(keywords.extractedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-gray-200 my-3" />

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-700">Extracted Entities:</h4>
                            <div className="flex flex-wrap gap-2">
                                {keywords.extracted.map((entity, index) => (
                                    <Badge
                                        key={index}
                                        variant="secondary"
                                        className="text-xs px-2 py-1 hover:bg-gray-200 transition-colors"
                                    >
                                        {entity}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
