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
import { FileText, Loader2, Calendar, File, ChevronDown, ChevronUp, Eye, EyeOff, Search } from 'lucide-react'
import { documentSegmentApi, type Document, type DocumentSegment } from '@/lib/api'
import { NerResultsDisplay } from './ner-results-display'
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
    const [showNerResults, setShowNerResults] = useState(true)
    const [viewMode, setViewMode] = useState<'combined' | 'segments'>('segments')
    const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null)
    const [showSearch, setShowSearch] = useState(false)

    const SEGMENTS_PER_PAGE = 100

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
            const response = await documentSegmentApi.getByDocumentPaginated(document.id, {
                page,
                limit: SEGMENTS_PER_PAGE
            })

            if (reset) {
                setSegments(response.data)
                setTotalSegments(response.total)
                setHasMore(response.data.length === SEGMENTS_PER_PAGE && response.data.length < response.total)

                // Calculate segment status counts for reset
                const statusCounts = response.data.reduce((acc, segment) => {
                    acc[segment.status] = (acc[segment.status] || 0) + 1
                    return acc
                }, {} as Record<string, number>)
                setSegmentStatusCounts(statusCounts)
            } else {
                setSegments(prev => {
                    const newSegments = [...prev, ...response.data]
                    setHasMore(response.data.length === SEGMENTS_PER_PAGE && newSegments.length < response.total)

                    // Calculate segment status counts for append
                    const statusCounts = newSegments.reduce((acc, segment) => {
                        acc[segment.status] = (acc[segment.status] || 0) + 1
                        return acc
                    }, {} as Record<string, number>)
                    setSegmentStatusCounts(statusCounts)

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

    // Auto-refresh segments when document is processing
    useEffect(() => {
        if (!isOpen || !document) return

        const isProcessing = ['embedding', 'ner', 'processing', 'parsing', 'splitting', 'indexing'].includes(document.indexingStatus)

        if (isProcessing) {
            const interval = setInterval(() => {
                fetchSegments(1, true)
            }, 3000) // Refresh every 3 seconds

            return () => clearInterval(interval)
        }
    }, [isOpen, document, document?.indexingStatus, fetchSegments])

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
        const nerProcessed = segmentStatusCounts.ner_processed || 0

        if (document?.indexingStatus === 'embedding') {
            const remaining = chunked + embedding
            const completed = embedded
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'Embedding',
                completed,
                remaining,
                total,
                percentage
            }
        } else if (document?.indexingStatus === 'ner') {
            const remaining = total - nerProcessed
            const completed = nerProcessed
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
            return {
                stage: 'NER Processing',
                completed,
                remaining,
                total,
                percentage
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
                            {document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' || document.indexingStatus === 'embedding' || document.indexingStatus === 'ner' ? (
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
                                    document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' || document.indexingStatus === 'embedding' || document.indexingStatus === 'ner' ? 'text-blue-700' :
                                        'text-gray-700'
                                }`}>
                                {document.indexingStatus === 'completed' ? `Processing completed - ${totalSegments} segments processed` :
                                    document.indexingStatus === 'error' ? `Processing failed - Unknown error` :
                                        document.indexingStatus === 'processing' || document.indexingStatus === 'parsing' || document.indexingStatus === 'splitting' || document.indexingStatus === 'indexing' ? `Processing in progress... (${segments.length}/${totalSegments || '?'} segments loaded)` :
                                            document.indexingStatus === 'waiting' ? 'Waiting to start processing...' :
                                                `Status: ${document.indexingStatus}`}
                            </span>
                        </div>
                        {totalSegments > 0 && (
                            <div className="text-sm text-gray-500">
                                {segments.length} of {totalSegments} segments loaded
                            </div>
                        )}
                    </div>

                    {/* Detailed Progress Bar for Embedding/NER */}
                    {(() => {
                        const progress = getProcessingProgress()
                        if (progress) {
                            return (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                        <span>{progress.stage} in progress</span>
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
                                </div>
                            )
                        }
                        return null
                    })()}
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

                                    {viewMode === 'segments' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowNerResults(!showNerResults)}
                                            className="flex items-center gap-2"
                                        >
                                            {showNerResults ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            {showNerResults ? 'Hide NER' : 'Show NER'}
                                        </Button>
                                    )}
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
                                                            segment.status === 'ner_processing' ? 'bg-blue-100 text-blue-800' :
                                                                segment.status === 'ner_failed' ? 'bg-red-100 text-red-800' :
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

                                                {showNerResults && (
                                                    <NerResultsDisplay
                                                        keywords={segment.keywords}
                                                        status={segment.status}
                                                        compact={false}
                                                        showHeader={true}
                                                    />
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
