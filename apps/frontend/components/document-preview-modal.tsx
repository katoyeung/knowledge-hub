'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { FileText, Loader2, Calendar, File, ChevronDown, ChevronUp, Eye, EyeOff, Search, Network } from 'lucide-react'
import { documentSegmentApi, graphApi, type Document, type DocumentSegment } from '@/lib/api'
import { DocumentSearch } from './document-search'

interface DocumentPreviewModalProps {
    document: Document | null
    isOpen: boolean
    onClose: () => void
}

export function DocumentPreviewModal({ document, isOpen, onClose }: DocumentPreviewModalProps) {
    const [segments, setSegments] = useState<DocumentSegment[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalSegments, setTotalSegments] = useState(0)
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [showAll, setShowAll] = useState(false)
    const [segmentStatusCounts, setSegmentStatusCounts] = useState<Record<string, number>>({})
    const [viewMode, setViewMode] = useState<'combined' | 'segments'>('segments')
    const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null)
    const [showSearch, setShowSearch] = useState(false)

    const SEGMENTS_PER_PAGE = 100

    // Calculate status counts from segments array (helper function)
    const calculateStatusCounts = useCallback((segments: DocumentSegment[]): Record<string, number> => {
        const counts: Record<string, number> = {}
        segments.forEach(segment => {
            const status = segment.status || 'unknown'
            counts[status] = (counts[status] || 0) + 1
        })
        return counts
    }, [])

    const fetchSegments = useCallback(async (page: number = 1, reset: boolean = false) => {
        if (!document) return

        if (reset) {
            setLoading(true)
            setError(null)
            setCurrentPage(1)
            setShowAll(false)
        } else {
            setLoadingMore(true)
        }

        try {
            // Fetch segments only (removed status-counts API call for performance)
            const response = await documentSegmentApi.getByDocumentPaginated(document.id, {
                page,
                limit: SEGMENTS_PER_PAGE
            })

            // Enhance segments with graph data (with better error handling)
            const enhancedSegments = await Promise.allSettled(
                response.data.map(async (segment) => {
                    try {
                        // Get graph data for this segment (if any)
                        const graphData = await graphApi.getSegmentGraphData(segment.id);
                        return {
                            ...segment,
                            graphNodes: graphData?.nodes || [],
                            graphEdges: graphData?.edges || [],
                        };
                    } catch {
                        // Silently handle graph data errors - segments without embeddings won't have graph data
                        return {
                            ...segment,
                            graphNodes: [],
                            graphEdges: [],
                        };
                    }
                })
            ).then(results =>
                results.map(result =>
                    result.status === 'fulfilled' ? result.value : result.reason
                )
            );

            if (reset) {
                setSegments(enhancedSegments)
                setTotalSegments(response.total)
                setHasMore(enhancedSegments.length === SEGMENTS_PER_PAGE && enhancedSegments.length < response.total)

                // Calculate status counts from loaded segments (approximate, not total)
                const counts = calculateStatusCounts(enhancedSegments)
                setSegmentStatusCounts(counts)
            } else {
                setSegments(prev => {
                    const newSegments = [...prev, ...enhancedSegments]
                    setHasMore(enhancedSegments.length === SEGMENTS_PER_PAGE && newSegments.length < response.total)

                    // Calculate status counts from all loaded segments (approximate, not total)
                    const counts = calculateStatusCounts(newSegments)
                    setSegmentStatusCounts(counts)

                    return newSegments
                })
            }

            setCurrentPage(page)
        } catch (err) {
            console.error('Failed to fetch document segments:', err)
            setError('Failed to load document content')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [document])

    // Fetch document segments when modal opens
    useEffect(() => {
        if (isOpen && document) {
            fetchSegments(1, true)
        }
    }, [isOpen, document, fetchSegments])

    // Auto-refresh segments when document is processing or when segments are still being processed
    useEffect(() => {
        if (!isOpen || !document) return

        const isDocumentProcessing = ['embedding', 'processing', 'parsing', 'splitting', 'indexing'].includes(document.indexingStatus)

        // Check if there are still segments being processed
        const hasProcessingSegments = segmentStatusCounts && (
            segmentStatusCounts.embedding > 0 ||
            segmentStatusCounts.processing > 0 ||
            segmentStatusCounts.parsing > 0 ||
            segmentStatusCounts.splitting > 0 ||
            segmentStatusCounts.indexing > 0
        )

        // Only refresh if document is processing OR if there are processing segments AND document is not completed
        const shouldRefresh = isDocumentProcessing || (hasProcessingSegments && document.indexingStatus !== 'completed')

        if (shouldRefresh) {
            let refreshCount = 0
            const maxRefreshes = 20 // Maximum 20 refreshes (1 minute)

            const interval = setInterval(() => {
                refreshCount++

                // Stop refreshing after max attempts or if document is completed and no processing segments
                if (refreshCount >= maxRefreshes ||
                    (document.indexingStatus === 'completed' && !hasProcessingSegments)) {
                    clearInterval(interval)
                    return
                }

                fetchSegments(1, true)
            }, 3000) // Refresh every 3 seconds

            return () => clearInterval(interval)
        }
    }, [isOpen, document, document?.indexingStatus, segmentStatusCounts, fetchSegments])

    const loadMoreSegments = () => {
        if (!loadingMore && hasMore) {
            fetchSegments(currentPage + 1, false)
        }
    }

    const toggleShowAll = () => {
        if (showAll) {
            // Show only first page
            setShowAll(false)
            setSegments(segments.slice(0, SEGMENTS_PER_PAGE))
        } else {
            // Load all remaining segments
            setShowAll(true)
            if (hasMore) {
                fetchSegments(currentPage + 1, false)
            }
        }
    }

    // Format file size
    const formatFileSize = (bytes?: number) => {
        if (!bytes) return 'Unknown size'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    // Format date
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Unknown date'
        const date = new Date(dateString)
        if (isNaN(date.getTime())) return 'Invalid date'
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    // Get document date
    const getDocumentDate = (document: Document): string | undefined => {
        if (document.docMetadata?.uploadedAt && typeof document.docMetadata.uploadedAt === 'string') {
            return document.docMetadata.uploadedAt
        }
        if (document.createdAt) {
            return document.createdAt
        }
        if (document.processingStartedAt) {
            return document.processingStartedAt
        }
        return undefined
    }

    // Get document file size safely
    const getDocumentSize = (document: Document): number | null => {
        if (document.docMetadata?.size) {
            const size = Number(document.docMetadata.size)
            return isNaN(size) ? null : size
        }
        return null
    }

    // Get processing progress information
    const getProcessingProgress = () => {
        const total = totalSegments || 0
        const embedded = segmentStatusCounts.embedded || 0
        const embedding = segmentStatusCounts.embedding || 0
        const chunked = segmentStatusCounts.chunked || 0
        const parsing = segmentStatusCounts.parsing || 0
        const splitting = segmentStatusCounts.splitting || 0
        const indexing = segmentStatusCounts.indexing || 0

        // Determine current stage and progress
        if (document?.indexingStatus === 'parsing') {
            const completed = total - parsing
            const remaining = parsing
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Parsing Document',
                completed,
                remaining,
                total,
                percentage,
                details: `Parsing document content into segments`
            }
        } else if (document?.indexingStatus === 'splitting') {
            const completed = total - splitting
            const remaining = splitting
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Splitting Content',
                completed,
                remaining,
                total,
                percentage,
                details: `Splitting content into manageable chunks`
            }
        } else if (document?.indexingStatus === 'indexing') {
            const completed = total - indexing
            const remaining = indexing
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Indexing Segments',
                completed,
                remaining,
                total,
                percentage,
                details: `Creating searchable index for segments`
            }
        } else if (document?.indexingStatus === 'embedding') {
            const remaining = chunked + embedding
            const completed = embedded
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Generating Embeddings',
                completed,
                remaining,
                total,
                percentage,
                details: `Creating vector embeddings for semantic search`
            }
        } else if (document?.indexingStatus === 'processing') {
            // Generic processing status - show overall progress
            const completed = embedded
            const remaining = total - completed
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Processing Document',
                completed,
                remaining,
                total,
                percentage,
                details: `Processing document through multiple stages`
            }
        }

        return null
    }


    // Combine all segments content
    const combinedContent = segments
        .sort((a, b) => a.position - b.position)
        .map(segment => segment.content)
        .join('\n\n')

    if (!document) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <File className="h-8 w-8 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-semibold text-gray-900 truncate">
                                {document.name}
                            </DialogTitle>
                            <DialogDescription className="text-sm text-gray-600 mt-1">
                                Document Preview
                            </DialogDescription>
                        </div>
                    </div>

                    {/* Document metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
                        <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(getDocumentDate(document) || '')}
                        </span>
                        {getDocumentSize(document) && (
                            <span>
                                {formatFileSize(getDocumentSize(document)!)}
                            </span>
                        )}
                        {document.docType && (
                            <span className="capitalize">
                                {String(document.docType)}
                            </span>
                        )}
                        {document.wordCount && (
                            <span>
                                {Number(document.wordCount).toLocaleString()} words
                            </span>
                        )}
                        {segments.length > 0 && (
                            <span>
                                {segments.length} segments
                            </span>
                        )}
                    </div>
                </DialogHeader>

                {/* Processing Status */}
                <div className="px-1 py-2 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' || document.indexingStatus === 'embedding' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            ) : document.indexingStatus === 'completed' ? (
                                <div className="h-4 w-4 rounded-full bg-green-500"></div>
                            ) : document.indexingStatus === 'error' ? (
                                <div className="h-4 w-4 rounded-full bg-red-500"></div>
                            ) : document.indexingStatus === 'waiting' ? (
                                <div className="h-4 w-4 rounded-full bg-yellow-500"></div>
                            ) : (
                                <div className="h-4 w-4 rounded-full bg-gray-400"></div>
                            )}
                            <span className={`text-sm font-medium ${document.indexingStatus === 'completed' ? 'text-green-700' :
                                document.indexingStatus === 'error' ? 'text-red-700' :
                                    document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' || document.indexingStatus === 'embedding' ? 'text-blue-700' :
                                        'text-gray-700'
                                }`}>
                                {document.indexingStatus === 'completed' ? `Processing completed - ${totalSegments} segments processed` :
                                    document.indexingStatus === 'error' ? `Processing failed - Unknown error` :
                                        document.indexingStatus === 'waiting' ? 'Waiting to start processing...' :
                                            document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' || document.indexingStatus === 'embedding' ?
                                                (() => {
                                                    const progress = getProcessingProgress()
                                                    if (progress) {
                                                        return `${progress.stage} - ${progress.completed}/${progress.total} segments (${progress.percentage}%)`
                                                    }
                                                    return `Processing in progress... (${segments.length}/${totalSegments || '?'} segments loaded)`
                                                })() :
                                                `Status: ${document.indexingStatus}`}
                            </span>
                        </div>
                        {totalSegments > 0 && (
                            <div className="text-sm text-gray-500">
                                {segments.length} of {totalSegments} segments loaded
                            </div>
                        )}
                    </div>

                    {/* Detailed Progress Bar for All Processing Stages */}
                    {(() => {
                        const progress = getProcessingProgress()
                        if (progress) {
                            return (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                        <span className="font-medium">{progress.stage}</span>
                                        <span>{progress.completed}/{progress.total} ({progress.percentage}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${progress.percentage}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                                        <span>Completed: {progress.completed}</span>
                                        <span>Remaining: {progress.remaining}</span>
                                    </div>
                                    {progress.details && (
                                        <div className="text-xs text-gray-500 mt-1 italic">
                                            {progress.details}
                                        </div>
                                    )}
                                </div>
                            )
                        }
                        return null
                    })()}

                    {/* Segment Status Breakdown - Only show if document is not completed or has non-embedded segments */}
                    {totalSegments > 0 && Object.keys(segmentStatusCounts).length > 0 &&
                        (document?.indexingStatus !== 'completed' ||
                            (segmentStatusCounts.embedded !== totalSegments)) && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-medium text-gray-700">
                                        Segment Status Breakdown (Total: {totalSegments}):
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const hasProcessingSegments = segmentStatusCounts && (
                                                segmentStatusCounts.embedding > 0 ||
                                                segmentStatusCounts.processing > 0 ||
                                                segmentStatusCounts.parsing > 0 ||
                                                segmentStatusCounts.splitting > 0 ||
                                                segmentStatusCounts.indexing > 0
                                            )

                                            if (hasProcessingSegments) {
                                                return (
                                                    <div className="flex items-center text-xs text-blue-600">
                                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1"></div>
                                                        Processing...
                                                    </div>
                                                )
                                            }
                                            return null
                                        })()}

                                        {segmentStatusCounts?.embedding > 0 && document?.indexingStatus === 'completed' && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const result = await documentSegmentApi.fixStuckSegments(document.id)
                                                        if (result.fixedSegments > 0) {
                                                            // Refresh the segments to show updated status
                                                            fetchSegments(1, true)
                                                        }
                                                    } catch (error) {
                                                        console.error('Failed to fix stuck segments:', error)
                                                    }
                                                }}
                                                className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
                                                title="Fix stuck segments that have been in embedding status for too long"
                                            >
                                                Fix Stuck Segments
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    {Object.entries(segmentStatusCounts).map(([status, count]) => (
                                        <div key={status} className="flex justify-between">
                                            <span className="capitalize text-gray-600">{status.replace('_', ' ')}:</span>
                                            <span className="font-medium text-gray-800">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                            <span className="ml-3 text-gray-600">Loading document content...</span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <div className="text-red-500 mb-4">
                                <FileText className="h-12 w-12 mx-auto mb-2" />
                                <p className="font-medium">Failed to load document content</p>
                                <p className="text-sm text-gray-600 mt-1">{error}</p>
                            </div>
                            <Button onClick={() => fetchSegments(1, true)} variant="outline" size="sm">
                                Try Again
                            </Button>
                        </div>
                    ) : segments.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600">No content available for this document.</p>
                            <p className="text-sm text-gray-500 mt-1">
                                The document may not have been processed yet or has no segments.
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            {/* View Mode Toggle and Search */}
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={viewMode === 'segments' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setViewMode('segments')}
                                        className="flex items-center gap-2"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Segments View
                                    </Button>
                                    <Button
                                        variant={viewMode === 'combined' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setViewMode('combined')}
                                        className="flex items-center gap-2"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Combined View
                                    </Button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={showSearch ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setShowSearch(!showSearch)}
                                        className="flex items-center gap-2"
                                    >
                                        <Search className="h-4 w-4" />
                                        {showSearch ? 'Hide Search' : 'Search'}
                                    </Button>

                                </div>
                            </div>

                            {/* Search Component */}
                            {showSearch && document && (
                                <div className="mb-4">
                                    <DocumentSearch
                                        documentId={document.id}
                                        onHighlightSegment={setHighlightedSegmentId}
                                    />
                                </div>
                            )}

                            {viewMode === 'combined' ? (
                                <div className="prose prose-sm max-w-none">
                                    <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                                        {combinedContent}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {segments
                                        .sort((a, b) => a.position - b.position)
                                        .map((segment) => (
                                            <div
                                                key={segment.id}
                                                className={`border rounded-lg p-4 transition-all ${highlightedSegmentId === segment.id
                                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                                    : 'border-gray-200 bg-white'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-600">
                                                            Segment {segment.position}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${segment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                            'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {segment.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {segment.wordCount} words • {segment.tokens} tokens
                                                    </div>
                                                </div>

                                                <div className="prose prose-sm max-w-none mb-3">
                                                    <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                                                        {segment.content}
                                                    </div>
                                                </div>


                                                {/* Graph Data Display */}
                                                {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="flex items-center space-x-4 text-xs text-gray-600">
                                                            <div className="flex items-center space-x-1">
                                                                <Network className="h-3 w-3" />
                                                                <span>{segment.graphNodes?.length || 0} nodes</span>
                                                            </div>
                                                            <div className="flex items-center space-x-1">
                                                                <Network className="h-3 w-3" />
                                                                <span>{segment.graphEdges?.length || 0} edges</span>
                                                            </div>
                                                        </div>

                                                        {/* Detailed Graph Data */}
                                                        <div className="bg-gray-50 rounded-md p-3 space-y-2">
                                                            <div className="text-xs font-medium text-gray-700">Extracted Graph Data:</div>

                                                            {/* Nodes */}
                                                            {segment.graphNodes && segment.graphNodes.length > 0 && (
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-600 mb-1">Nodes:</div>
                                                                    <div className="space-y-1">
                                                                        {segment.graphNodes.slice(0, 3).map((node, index) => (
                                                                            <div key={index} className="flex items-center space-x-2 text-xs">
                                                                                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
                                                                                    {node.type}
                                                                                </span>
                                                                                <span className="font-medium">{node.label}</span>
                                                                                {node.properties?.confidence && typeof node.properties.confidence === 'number' && (
                                                                                    <span className="text-gray-500">
                                                                                        ({(node.properties.confidence * 100).toFixed(0)}%)
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        {segment.graphNodes.length > 3 && (
                                                                            <div className="text-xs text-gray-500">
                                                                                ... and {segment.graphNodes.length - 3} more nodes
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Edges */}
                                                            {segment.graphEdges && segment.graphEdges.length > 0 && (
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-600 mb-1">Relationships:</div>
                                                                    <div className="space-y-1">
                                                                        {segment.graphEdges.slice(0, 2).map((edge, index) => (
                                                                            <div key={index} className="flex items-center space-x-2 text-xs">
                                                                                <span className="font-medium">{edge.from}</span>
                                                                                <span className="text-gray-400">→</span>
                                                                                <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                                                                                    {edge.type}
                                                                                </span>
                                                                                <span className="font-medium">{edge.to}</span>
                                                                                {edge.properties?.confidence && typeof edge.properties.confidence === 'number' && (
                                                                                    <span className="text-gray-500">
                                                                                        ({(edge.properties.confidence * 100).toFixed(0)}%)
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        {segment.graphEdges.length > 2 && (
                                                                            <div className="text-xs text-gray-500">
                                                                                ... and {segment.graphEdges.length - 2} more relationships
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            )}

                            {/* Load More / Show All Controls */}
                            {totalSegments > SEGMENTS_PER_PAGE && (
                                <div className="mt-4 pt-4 border-t border-gray-200 flex justify-center">
                                    {hasMore && !showAll ? (
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={loadMoreSegments}
                                                disabled={loadingMore}
                                                variant="outline"
                                                size="sm"
                                                className="flex items-center gap-2"
                                            >
                                                {loadingMore ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                                Load More ({totalSegments - segments.length} remaining)
                                            </Button>
                                            <Button
                                                onClick={toggleShowAll}
                                                variant="outline"
                                                size="sm"
                                                className="flex items-center gap-2"
                                            >
                                                <ChevronDown className="h-4 w-4" />
                                                Show All
                                            </Button>
                                        </div>
                                    ) : showAll ? (
                                        <Button
                                            onClick={toggleShowAll}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center gap-2"
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                            Show Less
                                        </Button>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 flex justify-end pt-4 border-t border-gray-200">
                    <Button onClick={onClose} variant="outline">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
