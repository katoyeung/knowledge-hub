'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Check, X, FileText, ChevronLeft, MoreVertical, CheckSquare, Square, Loader2, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { documentApi, type Document, type Dataset } from '@/lib/api'
import { DocumentPreviewModal } from './document-preview-modal'
import { DatasetDocumentUploadModal } from './dataset-document-upload-modal'
import { useDocumentProcessingNotifications } from '@/lib/hooks/use-notifications'

interface DatasetDocumentsPanelProps {
    datasetId: string
    documents?: Document[]
    loading?: boolean
    onDocumentClick?: (document: Document) => void
    onSelectedDocumentsChange?: (selectedDocuments: Document[]) => void
    onCollapse?: () => void
    showCollapseButton?: boolean
    dataset?: Dataset
}

export function DatasetDocumentsPanel({
    datasetId,
    documents: propDocuments,
    loading: propLoading,
    onSelectedDocumentsChange,
    onCollapse,
    showCollapseButton = true,
    dataset
}: DatasetDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [showAddDocument, setShowAddDocument] = useState(false)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
    const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
    const previousDocumentStatuses = useRef<Map<string, string>>(new Map())
    const hasUserInteracted = useRef<boolean>(false)
    const lastNotifiedSelectedDocs = useRef<Set<string>>(new Set())

    // Helper function to get status display information
    const getStatusInfo = (status: string) => {
        switch (status) {
            case 'waiting':
                return { text: 'Waiting', color: 'text-gray-500', bgColor: 'bg-gray-100' }
            case 'chunking':
                return { text: 'Chunking', color: 'text-blue-600', bgColor: 'bg-blue-100' }
            case 'chunked':
                return { text: 'Chunked', color: 'text-blue-600', bgColor: 'bg-blue-100' }
            case 'embedding':
                return { text: 'Embedding', color: 'text-purple-600', bgColor: 'bg-purple-100' }
            case 'embedded':
                return { text: 'Embedded', color: 'text-purple-600', bgColor: 'bg-purple-100' }
            case 'ner_processing':
                return { text: 'NER Processing', color: 'text-orange-600', bgColor: 'bg-orange-100' }
            case 'completed':
                return { text: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' }
            case 'chunking_failed':
                return { text: 'Chunking Failed', color: 'text-red-600', bgColor: 'bg-red-100' }
            case 'embedding_failed':
                return { text: 'Embedding Failed', color: 'text-red-600', bgColor: 'bg-red-100' }
            case 'ner_failed':
                return { text: 'NER Failed', color: 'text-red-600', bgColor: 'bg-red-100' }
            case 'error':
                return { text: 'Error', color: 'text-red-600', bgColor: 'bg-red-100' }
            default:
                return { text: status, color: 'text-gray-500', bgColor: 'bg-gray-100' }
        }
    }

    // Handle document processing notifications
    const handleDocumentProcessingUpdate = useCallback((notification: { documentId: string; status: string; wordCount?: number; embeddingDimensions?: number }) => {
        console.log('Document processing update:', notification)

        // Update the specific document in the list
        setDocuments(prev => prev.map(doc => {
            if (doc.id === notification.documentId) {
                return {
                    ...doc,
                    indexingStatus: notification.status,
                    wordCount: notification.wordCount || doc.wordCount,
                    embeddingDimensions: notification.embeddingDimensions || doc.embeddingDimensions,
                }
            }
            return doc
        }))

        // Auto-select newly completed documents
        if (notification.status === 'completed' && !lastNotifiedSelectedDocs.current.has(notification.documentId)) {
            setSelectedDocuments(prev => {
                const newSet = new Set(prev)
                newSet.add(notification.documentId)
                return newSet
            })
            lastNotifiedSelectedDocs.current.add(notification.documentId)
        }
    }, [])

    // Handle upload success
    const handleUploadSuccess = useCallback((newDocuments: Document[]) => {
        // Add new documents to the list
        setDocuments(prev => [...prev, ...newDocuments])

        // Don't auto-select immediately - wait for processing to complete
        // Auto-selection will happen via notification handler when status becomes 'completed'

        // Close the upload modal
        setShowUploadModal(false)
    }, [])

    // Set up notifications for this dataset
    useDocumentProcessingNotifications(datasetId, handleDocumentProcessingUpdate)

    const loadDocuments = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const docs = await documentApi.getByDataset(datasetId)
            setDocuments(docs)
        } catch (err) {
            console.error('Failed to load documents:', err)
            setError('Failed to load documents')
        } finally {
            setLoading(false)
        }
    }, [datasetId])

    // Use props if provided, otherwise load documents
    useEffect(() => {
        if (propDocuments !== undefined) {
            setDocuments(propDocuments)
            setLoading(propLoading || false)
        } else {
            loadDocuments()
        }
    }, [propDocuments, propLoading, loadDocuments])

    // Auto-select completed documents when documents first load (only if user hasn't interacted)
    useEffect(() => {
        if (documents.length > 0 && selectedDocuments.size === 0 && !hasUserInteracted.current) {
            const completedDocumentIds = documents
                .filter(doc => doc.indexingStatus === 'completed')
                .map(doc => doc.id)

            if (completedDocumentIds.length > 0) {
                setSelectedDocuments(new Set(completedDocumentIds))
            }
        }
    }, [documents, selectedDocuments.size])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (openDropdownId) {
                closeDropdown()
            }
        }

        if (openDropdownId) {
            document.addEventListener('click', handleClickOutside)
        }

        return () => {
            document.removeEventListener('click', handleClickOutside)
        }
    }, [openDropdownId])

    // Notify parent component when selected documents change
    useEffect(() => {
        if (onSelectedDocumentsChange) {
            const selectedDocs = documents.filter(doc => selectedDocuments.has(doc.id))
            const selectedDocIds = new Set(selectedDocs.map(doc => doc.id))

            // Only notify if the selection actually changed
            if (selectedDocIds.size !== lastNotifiedSelectedDocs.current.size ||
                ![...selectedDocIds].every(id => lastNotifiedSelectedDocs.current.has(id))) {
                lastNotifiedSelectedDocs.current = selectedDocIds
                onSelectedDocumentsChange(selectedDocs)
            }
        }
    }, [selectedDocuments, documents, onSelectedDocumentsChange])

    // Auto-select documents when they transition from processing to completed
    useEffect(() => {
        const currentStatuses = new Map<string, string>()

        documents.forEach(doc => {
            currentStatuses.set(doc.id, doc.indexingStatus)

            // Check if this document just completed processing
            const previousStatus = previousDocumentStatuses.current.get(doc.id)
            const isProcessingStatus = (status: string) =>
                status === 'processing' ||
                status === 'parsing' ||
                status === 'splitting' ||
                status === 'indexing' ||
                status === 'chunking' ||
                status === 'embedding' ||
                status === 'ner_processing'

            if (previousStatus &&
                isProcessingStatus(previousStatus) &&
                doc.indexingStatus === 'completed' &&
                !selectedDocuments.has(doc.id)) {

                // Auto-select this document
                setSelectedDocuments(prev => new Set([...prev, doc.id]))
            }
        })

        // Update the previous statuses for next comparison
        previousDocumentStatuses.current = currentStatuses
    }, [documents, selectedDocuments])

    const handleEdit = (document: Document) => {
        setEditingId(document.id)
        setEditName(document.name)
        closeDropdown()
    }

    const handleSaveEdit = async (documentId: string) => {
        try {
            // TODO: Implement document update API
            // await documentApi.update(documentId, { name: editName })
            setDocuments(prev =>
                prev.map(doc =>
                    doc.id === documentId ? { ...doc, name: editName } : doc
                )
            )
            setEditingId(null)
            setEditName('')
        } catch (err) {
            console.error('Failed to update document:', err)
        }
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setEditName('')
        closeDropdown()
    }

    // Handle document preview
    const handlePreviewDocument = (document: Document) => {
        setPreviewDocument(document)
        setShowPreview(true)
    }

    // Handle close preview
    const handleClosePreview = () => {
        setShowPreview(false)
        setPreviewDocument(null)
    }

    // Handle dropdown toggle
    const toggleDropdown = (documentId: string) => {
        setOpenDropdownId(openDropdownId === documentId ? null : documentId)
    }

    // Handle dropdown close
    const closeDropdown = () => {
        setOpenDropdownId(null)
    }

    // Handle document selection
    const toggleDocumentSelection = (documentId: string) => {
        hasUserInteracted.current = true
        setSelectedDocuments(prev => {
            const newSet = new Set(prev)
            if (newSet.has(documentId)) {
                newSet.delete(documentId)
            } else {
                newSet.add(documentId)
            }
            return newSet
        })
    }

    // Handle select all documents (only completed ones)
    const selectAllDocuments = () => {
        hasUserInteracted.current = true
        const completedDocuments = documents.filter(doc => doc.indexingStatus === 'completed')
        setSelectedDocuments(new Set(completedDocuments.map(doc => doc.id)))
    }

    // Handle deselect all documents
    const deselectAllDocuments = () => {
        hasUserInteracted.current = true
        setSelectedDocuments(new Set())
    }

    const handleDelete = async (documentId: string) => {
        if (confirm('Are you sure you want to delete this document?')) {
            try {
                await documentApi.delete(documentId)
                setDocuments(prev => prev.filter(doc => doc.id !== documentId))
                closeDropdown()
            } catch (err) {
                console.error('Failed to delete document:', err)
            }
        }
    }

    const handleResume = async (documentId: string) => {
        try {
            const result = await documentApi.resume(documentId)
            console.log('Document processing resumed:', result.message)

            // Update the document status to show it's processing
            setDocuments(prev => prev.map(doc =>
                doc.id === documentId
                    ? { ...doc, indexingStatus: 'processing' }
                    : doc
            ))

            closeDropdown()
        } catch (err) {
            console.error('Failed to resume document processing:', err)
            alert('Failed to resume document processing. Please try again.')
        }
    }


    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">Loading documents...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
            {/* Header */}
            <div className="px-4 border-b border-gray-200">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={() => setShowUploadModal(true)}
                            className="flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                        {onCollapse && showCollapseButton && (
                            <button
                                onClick={onCollapse}
                                className="p-1 hover:bg-gray-100 rounded"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
                {documents.length > 0 && (
                    <div className="h-8 flex items-center justify-between">
                        <span className="text-sm text-gray-600">Select all sources</span>
                        <button
                            onClick={() => {
                                const completedDocuments = documents.filter(doc => doc.indexingStatus === 'completed')
                                const allCompletedSelected = completedDocuments.length > 0 && completedDocuments.every(doc => selectedDocuments.has(doc.id))
                                if (allCompletedSelected) {
                                    deselectAllDocuments()
                                } else {
                                    selectAllDocuments()
                                }
                            }}
                            className="p-1 hover:bg-gray-200 rounded"
                            title="Select all completed documents"
                        >
                            {(() => {
                                const completedDocuments = documents.filter(doc => doc.indexingStatus === 'completed')
                                const allCompletedSelected = completedDocuments.length > 0 && completedDocuments.every(doc => selectedDocuments.has(doc.id))
                                return allCompletedSelected ? (
                                    <CheckSquare className="h-4 w-4 text-blue-600" />
                                ) : (
                                    <Square className="h-4 w-4 text-gray-400" />
                                )
                            })()}
                        </button>
                    </div>
                )}
            </div>

            {showAddDocument && (
                <div className="p-4 border-b border-gray-200 space-y-2">
                    <Input
                        placeholder="Document name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-sm"
                    />
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={() => {
                                // TODO: Implement add document functionality
                                setShowAddDocument(false)
                                setEditName('')
                            }}
                            className="flex-1"
                        >
                            Add Document
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setShowAddDocument(false)
                                setEditName('')
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Documents List */}
            <div className="flex-1 overflow-y-auto">
                {error ? (
                    <div className="p-4 text-center text-red-600 text-sm">
                        {error}
                    </div>
                ) : documents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                        No documents yet
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {documents.map((document) => (
                            <div
                                key={document.id}
                                className="group flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {editingId === document.id ? (
                                        <>
                                            <Input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="text-sm h-8"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit(document.id)
                                                    if (e.key === 'Escape') handleCancelEdit()
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        toggleDropdown(document.id)
                                                    }}
                                                    className="p-1 hover:bg-gray-200 rounded transition-all duration-200"
                                                    title="More actions"
                                                >
                                                    {(document.indexingStatus === 'waiting' ||
                                                        document.indexingStatus === 'processing' ||
                                                        document.indexingStatus === 'parsing' ||
                                                        document.indexingStatus === 'splitting' ||
                                                        document.indexingStatus === 'indexing' ||
                                                        document.indexingStatus === 'chunking' ||
                                                        document.indexingStatus === 'embedding' ||
                                                        document.indexingStatus === 'ner_processing') ? (
                                                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <FileText className="h-4 w-4 text-gray-400 group-hover:hidden" />
                                                            <MoreVertical className="h-3 w-3 text-gray-500 hidden group-hover:block" />
                                                        </>
                                                    )}
                                                </button>

                                                {openDropdownId === document.id && (
                                                    <div className="absolute left-0 top-8 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handlePreviewDocument(document)
                                                                closeDropdown()
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                                        >
                                                            <FileText className="h-3 w-3 text-gray-500" />
                                                            Preview document
                                                        </button>
                                                        {(document.indexingStatus === 'chunking_failed' ||
                                                            document.indexingStatus === 'embedding_failed' ||
                                                            document.indexingStatus === 'ner_failed' ||
                                                            document.indexingStatus === 'error') && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleResume(document.id)
                                                                    }}
                                                                    className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                                                >
                                                                    <RotateCcw className="h-3 w-3 text-blue-500" />
                                                                    Resume processing
                                                                </button>
                                                            )}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleEdit(document)
                                                                closeDropdown()
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                                        >
                                                            <Edit2 className="h-3 w-3 text-gray-500" />
                                                            Edit name
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleDelete(document.id)
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                        >
                                                            <Trash2 className="h-3 w-3 text-red-500" />
                                                            Delete document
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <p
                                                            className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                                            onClick={() => handlePreviewDocument(document)}
                                                            title="Click to preview document content"
                                                        >
                                                            {document.name}
                                                        </p>
                                                        {(() => {
                                                            const statusInfo = getStatusInfo(document.indexingStatus)
                                                            return (
                                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                                                                    {statusInfo.text}
                                                                </span>
                                                            )
                                                        })()}
                                                    </div>

                                                    {/* Document metadata */}
                                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                                        {document.wordCount && (
                                                            <span>{document.wordCount.toLocaleString()} words</span>
                                                        )}
                                                        {document.docType && (
                                                            <span className="capitalize">{document.docType}</span>
                                                        )}
                                                        {document.processingMetadata?.ner && (
                                                            <div className="flex items-center gap-1">
                                                                <span>NER:</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${document.processingMetadata.ner.enabled
                                                                        ? document.processingMetadata.ner.completedAt
                                                                            ? 'bg-green-100 text-green-700'
                                                                            : 'bg-blue-100 text-blue-700'
                                                                        : 'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                    {document.processingMetadata.ner.enabled
                                                                        ? document.processingMetadata.ner.completedAt
                                                                            ? 'Completed'
                                                                            : 'Processing'
                                                                        : 'Disabled'
                                                                    }
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    {editingId === document.id ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleSaveEdit(document.id)
                                                }}
                                                className="p-1 hover:bg-gray-200 rounded"
                                            >
                                                <Check className="h-3 w-3 text-green-600" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleCancelEdit()
                                                }}
                                                className="p-1 hover:bg-gray-200 rounded"
                                            >
                                                <X className="h-3 w-3 text-red-600" />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                // Only allow selection if document is completed
                                                if (document.indexingStatus === 'completed') {
                                                    toggleDocumentSelection(document.id)
                                                }
                                            }}
                                            className={`p-1 rounded ${document.indexingStatus === 'completed'
                                                ? 'hover:bg-gray-200'
                                                : 'cursor-not-allowed opacity-50'
                                                }`}
                                            disabled={document.indexingStatus !== 'completed'}
                                            title={
                                                document.indexingStatus === 'completed'
                                                    ? (selectedDocuments.has(document.id) ? "Deselect document" : "Select document")
                                                    : "Document is still processing"
                                            }
                                        >
                                            {selectedDocuments.has(document.id) ? (
                                                <CheckSquare className="h-4 w-4 text-blue-600" />
                                            ) : (
                                                <Square className={`h-4 w-4 ${document.indexingStatus === 'completed'
                                                    ? 'text-gray-400'
                                                    : 'text-gray-300'
                                                    }`} />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Document Preview Modal */}
            <DocumentPreviewModal
                document={previewDocument}
                isOpen={showPreview}
                onClose={handleClosePreview}
            />

            {/* Document Upload Modal */}
            {dataset && (
                <DatasetDocumentUploadModal
                    isOpen={showUploadModal}
                    onClose={() => setShowUploadModal(false)}
                    dataset={dataset}
                    onUploadSuccess={handleUploadSuccess}
                />
            )}
        </div >
    )
}
