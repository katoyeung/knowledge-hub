'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useNotifications } from '@/lib/hooks/use-notifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// import {
//     Select,
//     SelectContent,
//     SelectItem,
//     SelectTrigger,
//     SelectValue,
// } from '@/components/ui/select' // Removed - using HTML select instead
import {
    ChevronLeft,
    ChevronRight,
    Play,
    Loader2,
    FileText,
    Database,
    Network,
    CheckCircle,
    AlertCircle,
    RefreshCw,
    Eye,
} from 'lucide-react'
import { documentApi, documentSegmentApi, graphApi, type Document, type DocumentSegment, type GraphExtractionConfig, type GraphNode, type GraphEdge } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { SegmentGraphDetailModal } from '@/components/segment-graph-detail-modal'

interface DocumentSegmentExplorerProps {
    datasetId: string
    onSegmentExtraction?: (segmentId: string, result: { nodesCreated: number; edgesCreated: number }) => void
}

interface SegmentWithGraphData extends DocumentSegment {
    graphNodes?: GraphNode[]
    graphEdges?: GraphEdge[]
    extractionStatus?: 'idle' | 'extracting' | 'processing' | 'completed' | 'error'
    lastExtracted?: Date
    isEmpty?: boolean
    error?: string
}

export function DocumentSegmentExplorer({ datasetId }: DocumentSegmentExplorerProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
    const [segments, setSegments] = useState<SegmentWithGraphData[]>([])
    const [loadingDocuments, setLoadingDocuments] = useState(false)
    const [loadingSegments, setLoadingSegments] = useState(false)
    const [extractingSegments, setExtractingSegments] = useState<Set<string>>(new Set())
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalSegments, setTotalSegments] = useState(0)
    const [pageSize] = useState(10)
    const [searchQuery, setSearchQuery] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('graph-segment-search-query') || ''
        }
        return ''
    })
    const [nodeFilter, setNodeFilter] = useState<'all' | 'with-nodes' | 'without-nodes'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('graph-segment-node-filter')
            console.log('🚀 Initializing nodeFilter from localStorage:', saved)
            const result = (saved as 'all' | 'with-nodes' | 'without-nodes') || 'all'
            console.log('🚀 Initial nodeFilter value:', result)
            return result
        }
        console.log('🚀 No window, using default nodeFilter: all')
        return 'all'
    })
    const { success, error: showError } = useToast()

    // Modal state
    const [selectedSegment, setSelectedSegment] = useState<SegmentWithGraphData | null>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

    // Reload segments with current filters (triggers API call)
    const reloadSegments = useCallback((page: number = 1, filterOverride?: 'all' | 'with-nodes' | 'without-nodes') => {
        if (selectedDocumentId) {
            const currentFilter = filterOverride || nodeFilter
            console.log(`🔄 reloadSegments called with page: ${page}, filter: ${currentFilter}`)
            // Call loadSegments directly to avoid circular dependency
            loadSegments(selectedDocumentId, page, currentFilter)
        }
    }, [selectedDocumentId, nodeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

    // Handle node filter change and persist to localStorage
    const handleNodeFilterChange = (value: 'all' | 'with-nodes' | 'without-nodes') => {
        console.log(`🔄 Changing node filter from ${nodeFilter} to ${value}`)
        console.log(`🔄 Current nodeFilter state before change:`, nodeFilter)
        setNodeFilter(value)
        if (typeof window !== 'undefined') {
            localStorage.setItem('graph-segment-node-filter', value)
            console.log(`💾 Saved to localStorage: ${value}`)
        }

        // Reload segments with new filter (triggers API call)
        console.log(`🔄 Calling reloadSegments(1) with new filter: ${value}`)
        reloadSegments(1, value) // Reset to page 1 when filter changes, pass the new filter value
    }

    // Handle search query change and persist to localStorage
    const handleSearchQueryChange = (value: string) => {
        console.log(`🔍 Changing search query from "${searchQuery}" to "${value}"`)
        setSearchQuery(value)
        // Search will be applied via debounced useEffect
    }

    // Monitor nodeFilter changes
    useEffect(() => {
        console.log('🔄 nodeFilter state changed to:', nodeFilter)
    }, [nodeFilter])

    // Debounced search query persistence and reload
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (typeof window !== 'undefined') {
                if (searchQuery.trim()) {
                    localStorage.setItem('graph-segment-search-query', searchQuery)
                } else {
                    localStorage.removeItem('graph-segment-search-query')
                }
            }

            // Reload segments with new search query after debounce
            console.log(`🔍 Debounced search application with query: "${searchQuery}"`)
            reloadSegments(1) // Reset to page 1 when search changes
        }, 300) // 300ms debounce

        return () => clearTimeout(timeoutId)
    }, [searchQuery, reloadSegments])

    // Timeout for stuck extractions
    useEffect(() => {
        const interval = setInterval(() => {
            setSegments(prev => {
                const now = Date.now()
                const stuckSegments = prev.filter(s =>
                    s.extractionStatus === 'extracting' &&
                    s.lastExtracted &&
                    (now - s.lastExtracted.getTime()) > 30000 // 30 seconds timeout
                )

                if (stuckSegments.length > 0) {
                    console.log('Found stuck extractions, refreshing:', stuckSegments.map(s => s.id))

                    // Refresh stuck segments
                    stuckSegments.forEach(async (segment) => {
                        try {
                            const graphData = await getSegmentGraphData(segment.id)
                            setSegments(currentSegments =>
                                currentSegments.map(s =>
                                    s.id === segment.id
                                        ? {
                                            ...s,
                                            extractionStatus: graphData?.nodes?.length > 0 ? 'completed' as const : 'idle' as const,
                                            graphNodes: graphData?.nodes || [],
                                            graphEdges: graphData?.edges || [],
                                            lastExtracted: graphData?.lastExtracted,
                                            isEmpty: graphData?.isEmpty || false,
                                            error: graphData?.error
                                        }
                                        : s
                                )
                            )
                        } catch (err) {
                            setSegments(currentSegments =>
                                currentSegments.map(s =>
                                    s.id === segment.id
                                        ? {
                                            ...s,
                                            extractionStatus: 'error' as const,
                                            isEmpty: true,
                                            error: err instanceof Error ? err.message : 'Unknown error'
                                        }
                                        : s
                                )
                            )
                        }
                    })
                }

                return prev
            })
        }, 10000) // Check every 10 seconds

        return () => clearInterval(interval)
    }, [])

    // Set up notification handling for graph extraction updates
    useNotifications({
        onGraphExtractionUpdate: (notification) => {
            if (notification.datasetId === datasetId) {
                console.log('Graph extraction update:', notification)

                if (notification.stage === 'completed') {
                    // Update all extracting segments to completed and refresh their data
                    const refreshExtractingSegments = async () => {
                        setSegments(prev => {
                            const extractingSegments = prev.filter(s => s.extractionStatus === 'extracting')

                            // Update status to completed first
                            const updatedSegments = prev.map(s =>
                                s.extractionStatus === 'extracting'
                                    ? { ...s, extractionStatus: 'completed' as const }
                                    : s
                            )

                            // Refresh graph data for extracting segments
                            extractingSegments.forEach(async (segment) => {
                                try {
                                    const graphData = await getSegmentGraphData(segment.id)
                                    setSegments(currentSegments =>
                                        currentSegments.map(s =>
                                            s.id === segment.id
                                                ? {
                                                    ...s,
                                                    graphNodes: graphData?.nodes || [],
                                                    graphEdges: graphData?.edges || [],
                                                    lastExtracted: graphData?.lastExtracted,
                                                    isEmpty: graphData?.isEmpty || false,
                                                    error: graphData?.error
                                                }
                                                : s
                                        )
                                    )
                                } catch (err) {
                                    setSegments(currentSegments =>
                                        currentSegments.map(s =>
                                            s.id === segment.id
                                                ? {
                                                    ...s,
                                                    extractionStatus: 'error' as const,
                                                    isEmpty: true,
                                                    error: err instanceof Error ? err.message : 'Unknown error'
                                                }
                                                : s
                                        )
                                    )
                                }
                            })

                            return updatedSegments
                        })
                    }

                    refreshExtractingSegments()

                    success(
                        'Segment Extraction Complete',
                        `Graph extraction completed successfully`
                    )
                } else if (notification.stage === 'error') {
                    // Handle error case
                    setSegments(prev =>
                        prev.map(s =>
                            s.extractionStatus === 'extracting'
                                ? { ...s, extractionStatus: 'error' as const, isEmpty: true }
                                : s
                        )
                    )
                    showError(
                        'Extraction Failed',
                        notification.message || 'Graph extraction failed'
                    )
                } else if (notification.stage === 'processing_segment') {
                    // Handle processing case - no specific action needed as status is set during extraction
                }
            }
        }
    })

    // Load documents for the dataset
    const loadDocuments = useCallback(async () => {
        try {
            setLoadingDocuments(true)
            const docs = await documentApi.getByDataset(datasetId)
            setDocuments(docs)
            if (docs.length > 0 && !selectedDocumentId) {
                setSelectedDocumentId(docs[0].id)
            }
        } catch (err) {
            console.error('Failed to load documents:', err)
            showError('Failed to load documents')
        } finally {
            setLoadingDocuments(false)
        }
    }, [datasetId, selectedDocumentId, showError])

    // Load segments for selected document with proper pagination and filtering
    const loadSegments = useCallback(async (documentId: string, page: number = 1, filterOverride?: 'all' | 'with-nodes' | 'without-nodes') => {
        try {
            setLoadingSegments(true)
            const currentFilter = filterOverride || nodeFilter
            console.log(`🔄 Loading segments for document ${documentId}, page ${page}, filter: ${currentFilter}, search: "${searchQuery}"`)

            // Use the new filtered API endpoint
            const hasGraphDataParam = currentFilter === 'with-nodes' ? 'true' : currentFilter === 'without-nodes' ? 'false' : 'all'
            console.log(`🔍 API Call - currentFilter: ${currentFilter}, hasGraphDataParam: ${hasGraphDataParam}`)

            const response = await documentSegmentApi.getByDocumentWithFilters(documentId, {
                page,
                limit: pageSize,
                search: searchQuery.trim() || undefined,
                hasGraphData: hasGraphDataParam
            })

            console.log(`📊 API Response:`, {
                data: response.data.length,
                total: response.total,
                page: response.page,
                pageCount: response.pageCount
            })

            // Enhance segments with graph data (only for current page)
            const enhancedSegments = await Promise.all(
                response.data.map(async (segment) => {
                    try {
                        // Get graph data for this segment (if any)
                        const graphData = await getSegmentGraphData(segment.id)
                        return {
                            ...segment,
                            graphNodes: graphData?.nodes || [],
                            graphEdges: graphData?.edges || [],
                            extractionStatus: (graphData?.nodes?.length || 0) > 0 ? 'completed' as const : 'idle' as const,
                            lastExtracted: graphData?.lastExtracted,
                            isEmpty: graphData?.isEmpty || false,
                            error: graphData?.error
                        }
                    } catch (err) {
                        console.log(`❌ Error loading graph data for segment ${segment.id}:`, err)
                        return {
                            ...segment,
                            graphNodes: [],
                            graphEdges: [],
                            extractionStatus: 'idle' as const,
                            isEmpty: true,
                            error: err instanceof Error ? err.message : 'Unknown error'
                        }
                    }
                })
            )

            // Update state with paginated results
            setSegments(enhancedSegments)
            setTotalPages(response.pageCount)
            setTotalSegments(response.total)
            setCurrentPage(page)
        } catch (err) {
            console.error('Failed to load segments:', err)
            showError('Failed to load segments')
        } finally {
            setLoadingSegments(false)
        }
    }, [nodeFilter, searchQuery, showError, pageSize])

    // Get graph data for a specific segment
    const getSegmentGraphData = async (segmentId: string) => {
        try {
            const result = await graphApi.getSegmentGraphData(segmentId)
            console.log('Graph data received for segment', segmentId, ':', result)

            // Check if we have valid data
            if (!result || (!result.nodes || result.nodes.length === 0) && (!result.edges || result.edges.length === 0)) {
                console.log('No graph data found for segment', segmentId)
                return {
                    nodes: [],
                    edges: [],
                    lastExtracted: new Date(),
                    isEmpty: true
                }
            }

            return {
                nodes: result.nodes || [],
                edges: result.edges || [],
                lastExtracted: new Date(), // We could get this from the API if needed
                isEmpty: false
            }
        } catch (err) {
            console.error('Failed to get segment graph data:', err)
            return {
                nodes: [],
                edges: [],
                lastExtracted: new Date(),
                isEmpty: true,
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }

    // Handle opening detail modal
    const handleOpenDetailModal = (segment: SegmentWithGraphData) => {
        setSelectedSegment(segment)
        setIsDetailModalOpen(true)
    }

    // Handle closing detail modal
    const handleCloseDetailModal = () => {
        setIsDetailModalOpen(false)
        setSelectedSegment(null)
    }

    // Refresh graph data for a specific segment
    const refreshSegmentGraphData = async (segmentId: string) => {
        try {
            console.log('Refreshing graph data for segment:', segmentId)
            const graphData = await getSegmentGraphData(segmentId)
            console.log('Refreshed graph data:', graphData)

            if (graphData) {
                // Update current segments
                setSegments(prev =>
                    prev.map(s =>
                        s.id === segmentId
                            ? {
                                ...s,
                                graphNodes: graphData.nodes,
                                graphEdges: graphData.edges,
                                extractionStatus: graphData.nodes.length > 0 ? 'completed' as const : 'idle' as const,
                                lastExtracted: graphData.lastExtracted,
                                isEmpty: graphData.isEmpty || false,
                                error: graphData.error
                            }
                            : s
                    )
                )
                console.log('Updated segment with new graph data')
            }
        } catch (err) {
            console.error('Failed to refresh segment graph data:', err)
        }
    }

    // Extract graph from specific segment
    const extractFromSegment = async (segment: SegmentWithGraphData) => {
        try {
            setExtractingSegments(prev => new Set(prev).add(segment.id))

            const config: GraphExtractionConfig = {
                syncMode: false, // Use async mode to avoid timeout issues
            }

            // Call the graph extraction API with specific segment
            const result = await graphApi.triggerSegmentExtraction(
                segment.documentId,
                [segment.id],
                config
            )

            if (result.success) {
                // Update segment status to processing
                setSegments(prev =>
                    prev.map(s => s.id === segment.id ? { ...s, extractionStatus: 'extracting' as const } : s)
                )

                success(
                    'Segment Extraction Started',
                    'Graph extraction has been started. You will receive updates as it progresses.'
                )

                // The actual completion will be handled by the notification system
            } else {
                throw new Error(result.message)
            }
        } catch (err) {
            console.error('Failed to extract from segment:', err)
            showError(
                'Extraction Failed',
                err instanceof Error ? err.message : 'Failed to extract from segment'
            )

            // Update segment status to error
            setSegments(prev =>
                prev.map(s =>
                    s.id === segment.id
                        ? { ...s, extractionStatus: 'error' as const }
                        : s
                )
            )
        } finally {
            setExtractingSegments(prev => {
                const newSet = new Set(prev)
                newSet.delete(segment.id)
                return newSet
            })
        }
    }

    // Clear graph data for a specific segment
    const clearSegmentGraph = async (segmentId: string) => {
        try {
            // Call the API to clear graph data for this segment
            await graphApi.clearSegmentGraph(segmentId)

            // Update the segment in the local state to remove graph data
            setSegments(prev =>
                prev.map(s =>
                    s.id === segmentId
                        ? {
                            ...s,
                            graphNodes: [],
                            graphEdges: [],
                            extractionStatus: 'idle' as const,
                            lastExtracted: undefined,
                            isEmpty: true
                        }
                        : s
                )
            )

            success(
                'Graph Cleared',
                'Graph data has been cleared for this segment.'
            )
        } catch (error) {
            console.error('Failed to clear segment graph:', error)
            showError(
                'Clear Failed',
                error instanceof Error ? error.message : 'Failed to clear graph data'
            )
        }
    }

    // Handle document selection
    const handleDocumentChange = (documentId: string) => {
        setSelectedDocumentId(documentId)
        setCurrentPage(1)
        if (documentId) {
            loadSegments(documentId, 1, nodeFilter)
        }
    }

    // Handle page change
    const handlePageChange = (page: number) => {
        reloadSegments(page)
    }

    // Segments are now pre-filtered by the API
    const filteredSegments = segments

    // Load documents on mount
    useEffect(() => {
        loadDocuments()
    }, [datasetId, loadDocuments])

    // Load segments when document changes
    useEffect(() => {
        if (selectedDocumentId) {
            loadSegments(selectedDocumentId, currentPage)
        }
    }, [selectedDocumentId, currentPage, loadSegments])

    const selectedDocument = documents.find(doc => doc.id === selectedDocumentId)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Document & Segment Explorer</h2>
                    <p className="text-sm text-gray-600">
                        Explore documents and extract graphs from specific segments
                    </p>
                </div>
                <Button
                    onClick={() => selectedDocumentId && loadSegments(selectedDocumentId, currentPage, nodeFilter)}
                    variant="outline"
                    size="sm"
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Document-Level Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Network className="h-5 w-5" />
                        <span>Document Graph Controls</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => {/* TODO: Add extract all segments function */ }}
                            disabled={false}
                            size="sm"
                        >
                            <Play className="h-4 w-4 mr-2" />
                            Extract All Segments
                        </Button>
                        <Button
                            onClick={() => {/* TODO: Add sync extract function */ }}
                            disabled={false}
                            variant="secondary"
                            size="sm"
                        >
                            <Play className="h-4 w-4 mr-2" />
                            Sync Extract
                        </Button>
                        <Button
                            onClick={() => {/* TODO: Add refresh function */ }}
                            variant="outline"
                            size="sm"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh Graph Data
                        </Button>
                        <Button
                            onClick={() => {/* TODO: Add export function */ }}
                            variant="outline"
                            size="sm"
                        >
                            <Database className="h-4 w-4 mr-2" />
                            Export Graph
                        </Button>
                        <Button
                            onClick={() => {/* TODO: Add clear function */ }}
                            variant="destructive"
                            size="sm"
                        >
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Clear All Graphs
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Document Selection */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <span>Select Document</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="document-select">Document</Label>
                            <select
                                value={selectedDocumentId}
                                onChange={(e) => handleDocumentChange(e.target.value)}
                                disabled={loadingDocuments}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Select a document...</option>
                                {documents.map((doc) => (
                                    <option key={doc.id} value={doc.id}>
                                        {doc.name} ({doc.indexingStatus})
                                    </option>
                                ))}
                            </select>
                            {loadingDocuments && (
                                <p className="text-sm text-gray-500">Loading documents...</p>
                            )}
                        </div>

                        {selectedDocument && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="font-medium">Status:</span>
                                    <Badge
                                        variant={selectedDocument.indexingStatus === 'completed' ? 'default' : 'secondary'}
                                        className="ml-2"
                                    >
                                        {selectedDocument.indexingStatus}
                                    </Badge>
                                </div>
                                <div>
                                    <span className="font-medium">Segments:</span>
                                    <span className="ml-2">{totalSegments}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Segments List */}
            {selectedDocumentId && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center space-x-2">
                                <Database className="h-5 w-5" />
                                <span>Segments</span>
                                <Badge variant="outline">{totalSegments}</Badge>
                            </CardTitle>

                            {/* Search and Filters */}
                            <div className="flex items-center space-x-4">
                                <div className="w-64">
                                    <Input
                                        placeholder="Search segments..."
                                        value={searchQuery}
                                        onChange={(e) => handleSearchQueryChange(e.target.value)}
                                    />
                                </div>

                                {/* Node Filter */}
                                <div className="flex items-center space-x-2">
                                    <Label className="text-sm text-gray-600">Filter by nodes:</Label>
                                    <select
                                        value={nodeFilter}
                                        onChange={(e) => {
                                            const value = e.target.value as 'all' | 'with-nodes' | 'without-nodes'
                                            handleNodeFilterChange(value)
                                        }}
                                        className="w-48 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="all">All segments</option>
                                        <option value="with-nodes">With nodes only</option>
                                        <option value="without-nodes">Without nodes only</option>
                                    </select>
                                </div>
                            </div>

                            {/* Filter Status */}
                            {nodeFilter !== 'all' && (
                                <div className="mt-2 text-sm text-gray-600">
                                    Showing {filteredSegments.length} of {totalSegments} segments
                                    {nodeFilter === 'with-nodes' && ` (${totalSegments - filteredSegments.length} segments without nodes hidden)`}
                                    {nodeFilter === 'without-nodes' && ` (${totalSegments - filteredSegments.length} segments with nodes hidden)`}
                                    <span className="ml-2 text-xs text-blue-600">• Filter saved</span>
                                </div>
                            )}
                            {searchQuery && (
                                <div className="mt-1 text-sm text-gray-600">
                                    <span className="text-xs text-blue-600">• Search saved</span>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loadingSegments ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                <span>Loading segments...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredSegments.map((segment) => (
                                    <div
                                        key={segment.id}
                                        className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center space-x-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        Position {segment.position}
                                                    </Badge>
                                                    <Badge
                                                        variant={
                                                            segment.extractionStatus === 'completed' ? 'default' :
                                                                segment.extractionStatus === 'extracting' ? 'secondary' :
                                                                    segment.extractionStatus === 'error' ? 'destructive' : 'outline'
                                                        }
                                                        className="text-xs"
                                                    >
                                                        {segment.extractionStatus === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                                                        {segment.extractionStatus === 'extracting' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                                        {segment.extractionStatus === 'error' && <AlertCircle className="h-3 w-3 mr-1" />}
                                                        {segment.extractionStatus}
                                                    </Badge>
                                                    {segment.lastExtracted && (
                                                        <span className="text-xs text-gray-500">
                                                            Last extracted: {segment.lastExtracted.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-sm text-gray-700 line-clamp-3">
                                                    {segment.content}
                                                </p>

                                                {/* Graph Data Summary */}
                                                {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0 || segment.extractionStatus === 'extracting') && (
                                                    <div className="space-y-2">
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
                                                            <div className="flex items-center justify-between">
                                                                <div className="text-xs font-medium text-gray-700">
                                                                    {segment.extractionStatus === 'extracting' ? 'Extracting Graph Data...' :
                                                                        segment.isEmpty ? 'No Graph Data Found' : 'Extracted Graph Data:'}
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <Button
                                                                        onClick={() => refreshSegmentGraphData(segment.id)}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-6 px-2 text-xs"
                                                                    >
                                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                                        Refresh
                                                                    </Button>
                                                                    {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
                                                                        <Button
                                                                            onClick={() => handleOpenDetailModal(segment)}
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-6 px-2 text-xs"
                                                                        >
                                                                            <Eye className="h-3 w-3 mr-1" />
                                                                            View Details
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {segment.extractionStatus === 'extracting' ? (
                                                                <div className="flex items-center space-x-2 text-xs text-gray-500">
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                    <span>Processing segment with AI model...</span>
                                                                </div>
                                                            ) : segment.isEmpty ? (
                                                                <div className="text-center py-4 text-xs text-gray-500">
                                                                    <div className="mb-2">
                                                                        <AlertCircle className="h-6 w-6 mx-auto text-gray-400" />
                                                                    </div>
                                                                    <div className="font-medium mb-1">No graph data extracted</div>
                                                                    <div className="text-xs">
                                                                        {segment.error ? `Error: ${segment.error}` : 'Try running graph extraction on this segment'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {/* Nodes */}
                                                                    {segment.graphNodes && segment.graphNodes.length > 0 && (
                                                                        <div>
                                                                            <div className="text-xs font-medium text-gray-600 mb-1">Nodes:</div>
                                                                            <div className="space-y-1">
                                                                                {segment.graphNodes.slice(0, 5).map((node, index) => {
                                                                                    console.log('Rendering node:', node)
                                                                                    return (
                                                                                        <div key={index} className="flex items-center space-x-2 text-xs">
                                                                                            <Badge variant="outline" className="text-xs">
                                                                                                {node.type || 'Unknown'}
                                                                                            </Badge>
                                                                                            <span className="font-medium">{node.label}</span>
                                                                                            {node.properties?.confidence && typeof node.properties.confidence === 'number' && (
                                                                                                <span className="text-gray-500">
                                                                                                    ({(node.properties.confidence * 100).toFixed(0)}%)
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    )
                                                                                })}
                                                                                {segment.graphNodes.length > 5 && (
                                                                                    <div className="text-xs text-gray-500">
                                                                                        ... and {segment.graphNodes.length - 5} more nodes
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
                                                                                {segment.graphEdges.slice(0, 3).map((edge, index) => (
                                                                                    <div key={index} className="flex items-center space-x-2 text-xs">
                                                                                        <span className="font-medium">{edge.sourceNodeId}</span>
                                                                                        <span className="text-gray-400">→</span>
                                                                                        <Badge variant="outline" className="text-xs">
                                                                                            {edge.type || 'Unknown'}
                                                                                        </Badge>
                                                                                        <span className="font-medium">{edge.targetNodeId}</span>
                                                                                        {edge.properties?.confidence && typeof edge.properties.confidence === 'number' && (
                                                                                            <span className="text-gray-500">
                                                                                                ({(edge.properties.confidence * 100).toFixed(0)}%)
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                                {segment.graphEdges.length > 3 && (
                                                                                    <div className="text-xs text-gray-500">
                                                                                        ... and {segment.graphEdges.length - 3} more relationships
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="ml-4 flex flex-col space-y-2">
                                                <Button
                                                    onClick={() => extractFromSegment(segment)}
                                                    disabled={extractingSegments.has(segment.id)}
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    {extractingSegments.has(segment.id) ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Play className="h-4 w-4" />
                                                    )}
                                                    <span className="ml-1">Extract</span>
                                                </Button>

                                                {/* View Graph Button - only show if segment has graph data */}
                                                {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
                                                    <Button
                                                        onClick={() => handleOpenDetailModal(segment)}
                                                        size="sm"
                                                        variant="secondary"
                                                    >
                                                        <Network className="h-4 w-4" />
                                                        <span className="ml-1">View Graph</span>
                                                    </Button>
                                                )}

                                                {/* Clear Graph Button - only show if segment has graph data */}
                                                {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
                                                    <Button
                                                        onClick={() => clearSegmentGraph(segment.id)}
                                                        size="sm"
                                                        variant="destructive"
                                                        className="h-6 px-2 text-xs"
                                                    >
                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                        Clear Graph
                                                    </Button>
                                                )}

                                                {/* Force Refresh Button - show if segment was extracting for too long */}
                                                {segment.extractionStatus === 'extracting' && (
                                                    <Button
                                                        onClick={() => refreshSegmentGraphData(segment.id)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-2 text-xs"
                                                    >
                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                        Force Refresh
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {filteredSegments.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        {searchQuery
                                            ? 'No segments match your search.'
                                            : nodeFilter === 'with-nodes'
                                                ? 'No segments with nodes found. Try changing the filter or extract graph data from segments.'
                                                : nodeFilter === 'without-nodes'
                                                    ? 'No segments without nodes found. All segments have graph data.'
                                                    : 'No segments found.'
                                        }
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-6">
                                <div className="text-sm text-gray-600">
                                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalSegments)} of {totalSegments} segments
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        variant="outline"
                                        size="sm"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Previous
                                    </Button>
                                    <span className="text-sm">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <Button
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        variant="outline"
                                        size="sm"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Graph Detail Modal */}
            {selectedSegment && (
                <SegmentGraphDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={handleCloseDetailModal}
                    segmentId={selectedSegment.id}
                    segmentContent={selectedSegment.content}
                    nodes={selectedSegment.graphNodes || []}
                    edges={(selectedSegment.graphEdges || []).map(edge => ({
                        ...edge,
                        from: edge.sourceNodeId,
                        to: edge.targetNodeId,
                        type: edge.type
                    }))}
                    extractionStatus={selectedSegment.extractionStatus === 'processing' ? 'extracting' : selectedSegment.extractionStatus}
                    lastExtracted={selectedSegment.lastExtracted}
                />
            )}
        </div>
    )
}
