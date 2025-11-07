'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Check, X, FileText, ChevronLeft, MoreVertical, CheckSquare, Square, Loader2, RotateCcw, Network, Play, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { documentApi, datasetApi, queueApi, type Document, type Dataset } from '@/lib/api'
import { DocumentPreviewModal } from './document-preview-modal'
import { DatasetDocumentUploadModal } from './dataset-document-upload-modal'
import { useDocumentProcessingNotifications, useGraphExtractionNotifications } from '@/lib/hooks/use-notifications'
import { useToast } from './ui/simple-toast'

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
    dataset,
}: DatasetDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [total, setTotal] = useState(0)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [showAddDocument, setShowAddDocument] = useState(false)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
    const [showSelectAllDropdown, setShowSelectAllDropdown] = useState(false)
    const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
    const [extractingGraphs, setExtractingGraphs] = useState<Set<string>>(new Set())
    const [resumingJobs, setResumingJobs] = useState(false)
    const previousDocumentStatuses = useRef<Map<string, string>>(new Map())
    const hasUserInteracted = useRef<boolean>(false)
    const lastNotifiedSelectedDocs = useRef<Set<string>>(new Set())
    const toast = useToast()
    const [searchQuery, setSearchQuery] = useState('')


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

    const handleGraphExtractionUpdate = useCallback((notification: { documentId: string; stage: string; message?: string; nodesCreated?: number; edgesCreated?: number; error?: string }) => {
        console.log('Graph extraction update:', notification)

        // Update extracting state
        if (notification.stage === 'completed' || notification.stage === 'error') {
            setExtractingGraphs(prev => {
                const newSet = new Set(prev)
                newSet.delete(notification.documentId)
                return newSet
            })
        }

        // Show toast notification for important updates
        if (notification.stage === 'completed') {
            console.log(`Graph extraction completed: ${notification.nodesCreated} nodes, ${notification.edgesCreated} edges created`)
        } else if (notification.stage === 'error') {
            console.error(`Graph extraction failed: ${notification.error}`)
        }
    }, [])

    // Handle upload success
    const handleUploadSuccess = useCallback((newDocuments: Document[]) => {
        // Add new documents to the list
        setDocuments(prev => [...prev, ...newDocuments])
        // Update total count
        setTotal(prev => prev + newDocuments.length)

        // Don't auto-select immediately - wait for processing to complete
        // Auto-selection will happen via notification handler when status becomes 'completed'

        // Close the upload modal
        setShowUploadModal(false)
    }, [])

    // Set up notifications for this dataset
    const { getDocumentProcessingNotifications } = useDocumentProcessingNotifications()
    const { getGraphExtractionNotifications } = useGraphExtractionNotifications()

    // Listen for document processing notifications
    useEffect(() => {
        const interval = setInterval(() => {
            const notifications = getDocumentProcessingNotifications(datasetId)
            notifications.forEach((notification) => {
                if (notification.data?.documentId) {
                    handleDocumentProcessingUpdate(notification.data)
                }
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [datasetId, getDocumentProcessingNotifications, handleDocumentProcessingUpdate])

    // Listen for graph extraction notifications
    useEffect(() => {
        const interval = setInterval(() => {
            const notifications = getGraphExtractionNotifications(datasetId)
            notifications.forEach((notification) => {
                if (notification.data?.documentId) {
                    handleGraphExtractionUpdate(notification.data)
                }
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [datasetId, getGraphExtractionNotifications, handleGraphExtractionUpdate])



    const loadDocuments = useCallback(async (pageNum: number = 1, append: boolean = false) => {
        try {
            if (append) {
                setLoadingMore(true)
            } else {
                setLoading(true)
            }
            setError(null)
            const result = await documentApi.getByDataset(datasetId, pageNum, 20)

            if (append) {
                // Use functional update to access previous state
                setDocuments(prev => {
                    const allLoaded = [...prev, ...result.data]
                    const allLoadedCount = allLoaded.length
                    // Calculate hasMore: we have more if loaded count is less than total
                    const hasMorePages = allLoadedCount < result.total
                    setHasMore(hasMorePages)
                    return allLoaded
                })

                // Auto-select newly loaded documents if user hasn't interacted
                if (!hasUserInteracted.current) {
                    const newDocumentIds = result.data.map(doc => doc.id)
                    setSelectedDocuments(prev => {
                        const newSet = new Set(prev)
                        newDocumentIds.forEach(id => newSet.add(id))
                        return newSet
                    })
                }
            } else {
                const currentLoadedCount = result.data.length
                setDocuments(result.data)
                // Calculate hasMore: we have more if loaded count is less than total
                const hasMorePages = currentLoadedCount < result.total
                setHasMore(hasMorePages)
            }

            // Always update total from API response (it's the source of truth)
            setTotal(result.total)
            setPage(result.page)

        } catch (err) {
            console.error('Failed to load documents:', err)
            setError('Failed to load documents')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [datasetId])

    // Load more documents when scrolling to bottom
    const loadMoreDocuments = useCallback(() => {
        if (!loadingMore && hasMore) {
            loadDocuments(page + 1, true)
        }
    }, [page, hasMore, loadingMore, loadDocuments])

    // Removed auto-scroll loading - now using manual "Show more" button

    // Use props if provided, otherwise load documents
    useEffect(() => {
        if (propDocuments !== undefined) {
            setDocuments(propDocuments)
            setLoading(propLoading || false)
            // Reset pagination state when using props
            setPage(1)
            // Fetch actual total from API to get correct pagination status
            // propDocuments might only be the first page (20 items), but total could be more
            documentApi.getByDataset(datasetId, 1, 1).then(result => {
                setTotal(result.total)
                // Calculate hasMore: we have more if propDocuments length is less than total
                const hasMorePages = propDocuments.length < result.total
                setHasMore(hasMorePages)
            }).catch(err => {
                console.error('Failed to fetch total count:', err)
                // Fallback: use propDocuments length if API call fails
                setTotal(propDocuments.length)
                setHasMore(false)
            })

        } else {
            // Reset pagination when dataset changes
            setPage(1)
            setHasMore(true)
            setDocuments([])
            loadDocuments(1, false)
        }
    }, [datasetId, propDocuments, propLoading, loadDocuments])

    // Auto-select all documents when documents first load (only if user hasn't interacted)
    useEffect(() => {
        if (documents.length > 0 && selectedDocuments.size === 0 && !hasUserInteracted.current) {
            // Select all documents on the current page by default
            const allDocumentIds = documents.map(doc => doc.id)
            if (allDocumentIds.length > 0) {
                setSelectedDocuments(new Set(allDocumentIds))
            }
        }
    }, [documents, selectedDocuments.size])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (openDropdownId) {
                closeDropdown()
            }
            if (showSelectAllDropdown) {
                setShowSelectAllDropdown(false)
            }
        }

        if (openDropdownId || showSelectAllDropdown) {
            document.addEventListener('click', handleClickOutside)
        }

        return () => {
            document.removeEventListener('click', handleClickOutside)
        }
    }, [openDropdownId, showSelectAllDropdown])

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
                status === 'embedding'

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
                setSelectedDocuments(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(documentId)
                    return newSet
                })
                // Reload first page to get accurate total from API
                const result = await documentApi.getByDataset(datasetId, 1, 20)
                setTotal(result.total)
                closeDropdown()
            } catch (err) {
                console.error('Failed to delete document:', err)
                alert('Failed to delete document. Please try again.')
            }
        }
    }

    // Handle bulk delete for current page
    const handleDeleteCurrentPage = async () => {
        const selectedIds = Array.from(selectedDocuments).filter(id =>
            documents.some(doc => doc.id === id)
        )

        if (selectedIds.length === 0) {
            alert('No documents selected on current page')
            return
        }

        if (confirm(`Are you sure you want to delete ${selectedIds.length} document(s) from the current page?`)) {
            try {
                // Delete all selected documents in parallel
                await Promise.all(selectedIds.map(id => documentApi.delete(id)))

                // Clear selection
                setSelectedDocuments(new Set())

                // Reload to refresh the list and get accurate total from API
                await loadDocuments(1, false)
            } catch (err) {
                console.error('Failed to delete documents:', err)
                alert('Failed to delete some documents. Please try again.')
            }
        }
    }

    // Handle bulk delete for ALL documents in the dataset
    const handleDeleteAll = async () => {
        if (!total || total === 0) {
            alert('No documents to delete')
            return
        }

        if (confirm(`Are you sure you want to delete ALL ${total} document(s) in this dataset? This action cannot be undone.`)) {
            try {
                // Use the bulk delete endpoint
                const result = await documentApi.deleteAllByDataset(datasetId)

                // Clear selection and documents
                setSelectedDocuments(new Set())
                setDocuments([])
                setTotal(0)

                // Reload to show empty state
                await loadDocuments(1, false)

                toast.success(`Successfully deleted ${result.deletedCount} document(s)`)
            } catch (err) {
                console.error('Failed to delete documents:', err)
                alert('Failed to delete documents. Please try again.')
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

    const handleResumeJobs = async () => {
        if (!dataset) return

        // Show confirmation dialog
        const confirmed = await toast.confirm({
            title: 'Resume Jobs',
            description: `This will clear all existing jobs in the queue and restart processing for all unprocessed documents in "${dataset.name}". Continue?`,
            confirmText: 'Resume Jobs',
            cancelText: 'Cancel'
        })

        if (!confirmed) return

        setResumingJobs(true)
        try {
            const result = await queueApi.resumeJobs(datasetId)

            // Show success message
            toast.success('Jobs resumed successfully', `Queued ${result.queuedJobs} jobs for ${result.documents.length} documents.`)

            // Refresh documents to show updated status
            await loadDocuments()
            closeDropdown()
        } catch (error) {
            console.error('Failed to resume jobs:', error)
            toast.error('Failed to resume jobs', 'Please try again or contact support if the issue persists.')
        } finally {
            setResumingJobs(false)
        }
    }

    const handleExtractGraph = async (documentId: string) => {
        try {
            setExtractingGraphs(prev => new Set(prev).add(documentId))

            const result = await datasetApi.triggerGraphExtraction(datasetId, documentId)
            console.log('Graph extraction triggered:', result.message)

            closeDropdown()
        } catch (err) {
            console.error('Failed to trigger graph extraction:', err)
            alert('Failed to trigger graph extraction. Please try again.')
        } finally {
            setExtractingGraphs(prev => {
                const newSet = new Set(prev)
                newSet.delete(documentId)
                return newSet
            })
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
            <div className="px-2 border-b border-gray-200">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
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
                    <div className="border-b border-gray-200">
                        <div className="group flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="relative flex-1 max-w-xs">
                                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="text"
                                        placeholder="Search by title..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 pr-2 h-8 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => {
                                        const filteredDocs = documents.filter((doc) => {
                                            if (!searchQuery.trim()) return true
                                            return doc.name.toLowerCase().includes(searchQuery.toLowerCase())
                                        })
                                        const allSelected = filteredDocs.length > 0 && filteredDocs.every(doc => selectedDocuments.has(doc.id))
                                        if (allSelected) {
                                            deselectAllDocuments()
                                        } else {
                                            // Select only filtered documents
                                            hasUserInteracted.current = true
                                            const filteredIds = filteredDocs.map(doc => doc.id)
                                            setSelectedDocuments(prev => {
                                                const newSet = new Set(prev)
                                                filteredIds.forEach(id => newSet.add(id))
                                                return newSet
                                            })
                                        }
                                    }}
                                    className="p-1 hover:bg-gray-200 rounded"
                                    title="Select all visible documents"
                                >
                                    {(() => {
                                        const filteredDocs = documents.filter((doc) => {
                                            if (!searchQuery.trim()) return true
                                            return doc.name.toLowerCase().includes(searchQuery.toLowerCase())
                                        })
                                        const allSelected = filteredDocs.length > 0 && filteredDocs.every(doc => selectedDocuments.has(doc.id))
                                        return allSelected ? (
                                            <CheckSquare className="h-4 w-4 text-blue-600" />
                                        ) : (
                                            <Square className="h-4 w-4 text-gray-400" />
                                        )
                                    })()}
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setShowSelectAllDropdown(!showSelectAllDropdown)
                                        }}
                                        className="p-1 hover:bg-gray-200 rounded transition-all duration-200"
                                        title="More actions"
                                    >
                                        <MoreVertical className="h-4 w-4 text-gray-500" />
                                    </button>

                                    {showSelectAllDropdown && (
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleResumeJobs()
                                                    setShowSelectAllDropdown(false)
                                                }}
                                                disabled={resumingJobs}
                                                className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {resumingJobs ? (
                                                    <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                                                ) : (
                                                    <Play className="h-3 w-3 text-blue-500" />
                                                )}
                                                {resumingJobs ? 'Resuming...' : 'Resume Jobs'}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteCurrentPage()
                                                    setShowSelectAllDropdown(false)
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                                Selected ({Array.from(selectedDocuments).filter(id => documents.some(doc => doc.id === id)).length})
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteAll()
                                                    setShowSelectAllDropdown(false)
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                                All ({total})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
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
            <div className="flex-1 overflow-y-auto min-h-0" ref={scrollContainerRef}>
                {error ? (
                    <div className="p-4 text-center text-red-600 text-sm">
                        {error}
                    </div>
                ) : documents.length === 0 && !loading ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                        No documents yet
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {(() => {
                            const filteredDocuments = documents.filter((document) => {
                                if (!searchQuery.trim()) return true
                                return document.name.toLowerCase().includes(searchQuery.toLowerCase())
                            })

                            // Sort by name alphabetically
                            const sortedDocuments = [...filteredDocuments].sort((a, b) => {
                                return a.name.localeCompare(b.name)
                            })

                            if (sortedDocuments.length === 0 && searchQuery.trim()) {
                                return (
                                    <div key="no-results" className="p-4 text-center text-gray-500 text-sm">
                                        No documents found matching &quot;{searchQuery}&quot;
                                    </div>
                                )
                            }

                            return sortedDocuments.map((document) => (
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
                                                {/* Document icon based on status */}
                                                <div className="flex-shrink-0">
                                                    {(() => {
                                                        const isProcessing = [
                                                            'waiting',
                                                            'processing',
                                                            'parsing',
                                                            'splitting',
                                                            'indexing',
                                                            'chunking',
                                                            'chunked',
                                                            'embedding',
                                                            'embedded',
                                                        ].includes(document.indexingStatus);

                                                        const isFailed = [
                                                            'chunking_failed',
                                                            'embedding_failed',
                                                            'error',
                                                        ].includes(document.indexingStatus);

                                                        const isCompleted = document.indexingStatus === 'completed';

                                                        if (isProcessing) {
                                                            return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
                                                        } else if (isFailed) {
                                                            return <FileText className="h-4 w-4 text-red-500" />;
                                                        } else if (isCompleted) {
                                                            return <FileText className="h-4 w-4 text-blue-500" />;
                                                        } else {
                                                            return <FileText className="h-4 w-4 text-gray-400" />;
                                                        }
                                                    })()}
                                                </div>

                                                {/* Document name and metadata */}
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
                                                        </div>

                                                        {/* Document metadata */}
                                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                                            {document.updatedAt && (
                                                                <span>
                                                                    Updated at {new Date(document.updatedAt).toLocaleString()}
                                                                </span>
                                                            )}
                                                            {document.embeddingDimensions && (
                                                                <span>{document.embeddingDimensions} dims</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
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
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        toggleDocumentSelection(document.id)
                                                    }}
                                                    className="p-1 rounded hover:bg-gray-200"
                                                    title={selectedDocuments.has(document.id) ? "Deselect document" : "Select document"}
                                                >
                                                    {selectedDocuments.has(document.id) ? (
                                                        <CheckSquare className="h-4 w-4 text-blue-600" />
                                                    ) : (
                                                        <Square className="h-4 w-4 text-gray-400" />
                                                    )}
                                                </button>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            toggleDropdown(document.id)
                                                        }}
                                                        className="p-1 hover:bg-gray-200 rounded transition-all duration-200"
                                                        title="More actions"
                                                    >
                                                        <MoreVertical className="h-3 w-3 text-gray-500" />
                                                    </button>

                                                    {openDropdownId === document.id && (
                                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
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
                                                            {document.indexingStatus === 'completed' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleExtractGraph(document.id)
                                                                    }}
                                                                    disabled={extractingGraphs.has(document.id)}
                                                                    className="w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {extractingGraphs.has(document.id) ? (
                                                                        <Loader2 className="h-3 w-3 text-purple-500 animate-spin" />
                                                                    ) : (
                                                                        <Network className="h-3 w-3 text-purple-500" />
                                                                    )}
                                                                    {extractingGraphs.has(document.id) ? 'Extracting...' : 'Extract Graph'}
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
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        })()}

                        {/* Show more button or end of list indicator */}
                        {hasMore && !loadingMore && documents.length > 0 && (
                            <div className="p-4 text-center">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={loadMoreDocuments}
                                    className="flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    Show more ({documents.length} / {total})
                                </Button>
                            </div>
                        )}

                        {/* Loading more indicator */}
                        {loadingMore && (
                            <div className="p-4 text-center">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" />
                                <p className="text-xs text-gray-500 mt-2">Loading more documents...</p>
                            </div>
                        )}

                        {/* End of list indicator */}
                        {!hasMore && documents.length > 0 && (
                            <div className="p-4 text-center text-xs text-gray-500">
                                No more documents ({documents.length} / {total})
                            </div>
                        )}
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
            {
                dataset && (
                    <DatasetDocumentUploadModal
                        isOpen={showUploadModal}
                        onClose={() => setShowUploadModal(false)}
                        dataset={dataset}
                        onUploadSuccess={handleUploadSuccess}
                    />
                )
            }
        </div >
    )
}
