'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { FileText, Loader2, X, Calendar, File } from 'lucide-react'
import { documentSegmentApi, type Document, type DocumentSegment } from '@/lib/api'

interface DocumentPreviewModalProps {
    document: Document | null
    isOpen: boolean
    onClose: () => void
}

export function DocumentPreviewModal({ document, isOpen, onClose }: DocumentPreviewModalProps) {
    const [segments, setSegments] = useState<DocumentSegment[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Fetch document segments when modal opens
    useEffect(() => {
        if (isOpen && document) {
            fetchSegments()
        }
    }, [isOpen, document])

    const fetchSegments = async () => {
        if (!document) return

        setLoading(true)
        setError(null)
        try {
            const response = await documentSegmentApi.getByDocumentPaginated(document.id, {
                page: 1,
                limit: 1000 // Get all segments for preview
            })
            setSegments(response.data)
        } catch (err) {
            console.error('Failed to fetch document segments:', err)
            setError('Failed to load document content')
        } finally {
            setLoading(false)
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
                            <Button onClick={fetchSegments} variant="outline" size="sm">
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
                            <div className="prose prose-sm max-w-none">
                                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                                    {combinedContent}
                                </div>
                            </div>
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
