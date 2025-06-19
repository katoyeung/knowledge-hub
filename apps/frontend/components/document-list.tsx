'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
    File,
    FileText,
    Trash2,
    Upload,
    Loader2,
    RefreshCw,
    Calendar,
} from 'lucide-react'
import { documentApi, type Document, type Dataset } from '@/lib/api'
import { DocumentUpload } from './document-upload'
import DocumentSegmentsList from './document-segments-list'

interface DocumentListProps {
    datasetId: string
    dataset?: Dataset
    onDocumentsChange?: (documents: Document[]) => void
}

export function DocumentList({ datasetId, dataset, onDocumentsChange }: DocumentListProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showUpload, setShowUpload] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

    // Ref to track if fetch is in progress to prevent duplicate calls
    const fetchInProgressRef = useRef(false)
    const currentDatasetIdRef = useRef<string | null>(null)

    // Reset selectedDocument when datasetId changes (when clicking different dataset in sidebar)
    useEffect(() => {
        console.log('🔄 Dataset changed, resetting selectedDocument')
        setSelectedDocument(null)
        setShowUpload(false) // Also reset upload view if open
    }, [datasetId])

    // Fetch documents for the dataset
    const fetchDocuments = useCallback(async () => {
        // Prevent duplicate calls for the same dataset
        if (fetchInProgressRef.current && currentDatasetIdRef.current === datasetId) {
            console.log('🚫 Skipping duplicate API call for datasetId:', datasetId)
            return
        }

        console.log('🔍 fetchDocuments called for datasetId:', datasetId)
        fetchInProgressRef.current = true
        currentDatasetIdRef.current = datasetId

        try {
            setLoading(true)
            setError(null)
            const docs = await documentApi.getByDataset(datasetId)
            console.log('📄 Documents fetched:', docs.length, 'documents')
            setDocuments(docs)
            onDocumentsChange?.(docs)
        } catch (err) {
            console.error('Failed to fetch documents:', err)
            setError('Failed to load documents')
            setDocuments([])
        } finally {
            setLoading(false)
            fetchInProgressRef.current = false
        }
    }, [datasetId])

    useEffect(() => {
        console.log('🔄 useEffect triggered with datasetId:', datasetId)
        if (datasetId) {
            fetchDocuments()
        }
    }, [datasetId, fetchDocuments])

    // Handle document upload success
    const handleUploadSuccess = (result: { dataset: Dataset; documents: Document[] }) => {
        setDocuments(prev => {
            const newDocuments = [...prev, ...result.documents]
            onDocumentsChange?.(newDocuments)
            return newDocuments
        })
        setShowUpload(false)
    }

    // Handle document deletion
    const handleDelete = async (documentId: string) => {
        if (!window.confirm('Are you sure you want to delete this document?')) {
            return
        }

        setDeletingId(documentId)
        try {
            await documentApi.delete(documentId)
            setDocuments(prev => prev.filter(doc => doc.id !== documentId))
            onDocumentsChange?.(documents.filter(doc => doc.id !== documentId))
        } catch (err) {
            console.error('Failed to delete document:', err)
            alert('Failed to delete document')
        } finally {
            setDeletingId(null)
        }
    }

    // Handle view segments
    const handleViewSegments = (document: Document) => {
        setSelectedDocument(document)
    }

    // Handle back from segments view
    const handleBackFromSegments = () => {
        setSelectedDocument(null)
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

    // Get document date (prefer uploadedAt from metadata, fallback to other dates)
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

    // Get status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'text-green-600 bg-green-100'
            case 'processing':
                return 'text-blue-600 bg-blue-100'
            case 'waiting':
                return 'text-yellow-600 bg-yellow-100'
            case 'error':
                return 'text-red-600 bg-red-100'
            default:
                return 'text-gray-600 bg-gray-100'
        }
    }

    // Show segments view
    if (selectedDocument) {
        return (
            <div className="bg-white rounded-lg border border-gray-200">
                <DocumentSegmentsList
                    document={selectedDocument}
                    onBack={handleBackFromSegments}
                />
            </div>
        )
    }

    // Show upload component
    if (showUpload) {
        return (
            <div className="bg-white rounded-lg border border-gray-200">
                <DocumentUpload
                    datasetId={datasetId}
                    onUploadSuccess={handleUploadSuccess}
                    onClose={() => setShowUpload(false)}
                />
            </div>
        )
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            {dataset?.name || 'Dataset Documents'}
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            {documents.length} document{documents.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchDocuments}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button
                            onClick={() => setShowUpload(true)}
                            size="sm"
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Documents
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        <span className="ml-3 text-gray-600">Loading documents...</span>
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <div className="text-red-500 mb-4">
                            <FileText className="h-12 w-12 mx-auto mb-2" />
                            <p className="font-medium">Failed to load documents</p>
                            <p className="text-sm text-gray-600 mt-1">{error}</p>
                        </div>
                        <Button onClick={fetchDocuments} variant="outline" size="sm">
                            Try Again
                        </Button>
                    </div>
                ) : documents.length === 0 ? (
                    // Empty state - show upload invitation
                    <div className="text-center py-12">
                        <Upload className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No documents yet
                        </h3>
                        <p className="text-gray-600 mb-6 max-w-md mx-auto">
                            This dataset doesn&apos;t have any documents. Upload some files to get started with your knowledge base.
                        </p>
                        <Button onClick={() => setShowUpload(true)}>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Documents
                        </Button>
                    </div>
                ) : (
                    // Document list
                    <div className="space-y-3">
                        {documents.map((document) => (
                            <div
                                key={document.id}
                                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => handleViewSegments(document)}
                            >
                                <div className="flex items-center space-x-4 flex-1 min-w-0">
                                    <div className="flex-shrink-0">
                                        <File className="h-8 w-8 text-blue-500" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-3 mb-1">
                                            <h4 className="text-sm font-medium text-gray-900 truncate">
                                                {document.name}
                                            </h4>
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                                    document.indexingStatus
                                                )}`}
                                            >
                                                {document.indexingStatus}
                                            </span>
                                        </div>

                                        <div className="flex items-center space-x-4 text-xs text-gray-500">
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
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(document.id);
                                        }}
                                        disabled={deletingId === document.id}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        {deletingId === document.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
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