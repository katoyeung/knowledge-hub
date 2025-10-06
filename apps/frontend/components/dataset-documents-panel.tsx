'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Check, X, FileText, ChevronLeft, MoreVertical, CheckSquare, Square, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { documentApi, type Document } from '@/lib/api'
import { DocumentPreviewModal } from './document-preview-modal'

interface DatasetDocumentsPanelProps {
    datasetId: string
    onDocumentClick?: (document: Document) => void
    onSelectedDocumentsChange?: (selectedDocuments: Document[]) => void
    onCollapse?: () => void
    showCollapseButton?: boolean
}

export function DatasetDocumentsPanel({ datasetId, onSelectedDocumentsChange, onCollapse, showCollapseButton = true }: DatasetDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [showAddDocument, setShowAddDocument] = useState(false)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
    const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())

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

    useEffect(() => {
        loadDocuments()
    }, [loadDocuments])

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
            onSelectedDocumentsChange(selectedDocs)
        }
    }, [selectedDocuments, documents, onSelectedDocumentsChange])

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

    // Handle select all documents
    const selectAllDocuments = () => {
        setSelectedDocuments(new Set(documents.map(doc => doc.id)))
    }

    // Handle deselect all documents
    const deselectAllDocuments = () => {
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
                            onClick={() => setShowAddDocument(true)}
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
                            onClick={selectedDocuments.size === documents.length ? deselectAllDocuments : selectAllDocuments}
                            className="p-1 hover:bg-gray-200 rounded"
                            title={selectedDocuments.size === documents.length ? "Deselect all documents" : "Select all documents"}
                        >
                            {selectedDocuments.size === documents.length ? (
                                <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                                <Square className="h-4 w-4 text-gray-400" />
                            )}
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
                                                    {document.indexingStatus === 'processing' ? (
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
                                                <p
                                                    className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                                    onClick={() => handlePreviewDocument(document)}
                                                    title="Click to preview document content"
                                                >
                                                    {document.name}
                                                </p>
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
                                                toggleDocumentSelection(document.id)
                                            }}
                                            className="p-1 hover:bg-gray-200 rounded"
                                            title={selectedDocuments.has(document.id) ? "Deselect document" : "Select document"}
                                        >
                                            {selectedDocuments.has(document.id) ? (
                                                <CheckSquare className="h-4 w-4 text-blue-600" />
                                            ) : (
                                                <Square className="h-4 w-4 text-gray-400" />
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
        </div >
    )
}
