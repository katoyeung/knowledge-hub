'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { notificationService, type GraphExtractionNotification } from '@/lib/notification-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
    Search,
    X,
    Trash2,
} from 'lucide-react'
import { documentApi, documentSegmentApi, graphApi, apiClient, type Document, type DocumentSegment, type GraphExtractionConfig, type GraphNode, type GraphEdge } from '@/lib/api'
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

interface GraphDataCache {
    nodes: GraphNode[]
    edges: GraphEdge[]
    lastExtracted: Date
    isEmpty: boolean
    error?: string
}

export function DocumentSegmentExplorer({ datasetId }: DocumentSegmentExplorerProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
    const [segments, setSegments] = useState<SegmentWithGraphData[]>([])
    const [, setLoadingDocuments] = useState(false)
    const [loadingSegments, setLoadingSegments] = useState(false)
    const [extractingSegments, setExtractingSegments] = useState<Set<string>>(new Set())
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalSegments, setTotalSegments] = useState(0)
    const [pageSize] = useState(20)
    const [searchQuery, setSearchQuery] = useState('')
    const [nodeFilter, setNodeFilter] = useState<'all' | 'with-nodes' | 'without-nodes'>('all')
    const [documentSearchQuery, setDocumentSearchQuery] = useState('')
    const [showDocumentDropdown, setShowDocumentDropdown] = useState(false)
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set())
    const [isExtractingBatch, setIsExtractingBatch] = useState(false)
    const [loadingGraphData, setLoadingGraphData] = useState<Set<string>>(new Set())
    const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set())
    const documentSearchRef = useRef<HTMLDivElement>(null)
    const { success, error: showError } = useToast()

    // Modal state
    const [selectedSegment, setSelectedSegment] = useState<SegmentWithGraphData | null>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

    // Filter documents based on search query
    const filteredDocuments = documents.filter(doc =>
        doc.name.toLowerCase().includes(documentSearchQuery.toLowerCase())
    )

    // Handle document selection
    const handleDocumentSelect = (documentId: string) => {
        setSelectedDocumentId(documentId)
        setDocumentSearchQuery('')
        setShowDocumentDropdown(false)
        setCurrentPage(1)
        setSelectedSegmentIds(new Set())
    }

    // Handle clearing document selection
    const handleClearDocument = () => {
        setSelectedDocumentId('')
        setDocumentSearchQuery('')
        setShowDocumentDropdown(false)
        setCurrentPage(1)
        setSelectedSegmentIds(new Set())
    }

    // Handle node filter change
    const handleNodeFilterChange = (value: 'all' | 'with-nodes' | 'without-nodes') => {
        setNodeFilter(value)
        setCurrentPage(1)
        setSelectedSegmentIds(new Set())
    }

    // Close document dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (documentSearchRef.current && !documentSearchRef.current.contains(event.target as Node)) {
                setShowDocumentDropdown(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Handle checkbox toggle
    const handleSegmentToggle = (segmentId: string) => {
        setSelectedSegmentIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(segmentId)) {
                newSet.delete(segmentId)
            } else {
                newSet.add(segmentId)
            }
            return newSet
        })
    }

    // Handle select all on current page
    const handleSelectAllPage = () => {
        const allPageIds = segments.map(s => s.id)
        const allSelected = allPageIds.every(id => selectedSegmentIds.has(id))

        if (allSelected) {
            // Deselect all on page
            setSelectedSegmentIds(prev => {
                const newSet = new Set(prev)
                allPageIds.forEach(id => newSet.delete(id))
                return newSet
            })
        } else {
            // Select all on page
            setSelectedSegmentIds(prev => {
                const newSet = new Set(prev)
                allPageIds.forEach(id => newSet.add(id))
                return newSet
            })
        }
    }

    // Check if all segments on current page are selected
    const allPageSelected = segments.length > 0 && segments.every(s => selectedSegmentIds.has(s.id))

    // Get graph data for a specific segment
    const getSegmentGraphData = useCallback(async (segmentId: string) => {
        try {
            const result = await graphApi.getSegmentGraphData(segmentId)
            if (!result || ((!result.nodes || result.nodes.length === 0) && (!result.edges || result.edges.length === 0))) {
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
                lastExtracted: new Date(),
                isEmpty: false
            }
        } catch (err) {
            return {
                nodes: [],
                edges: [],
                lastExtracted: new Date(),
                isEmpty: true,
                error: err instanceof Error ? err.message : 'Unknown error'
            }
        }
    }, [])

    // Set up notification handling for graph extraction updates
    useEffect(() => {
        const handleGraphExtractionUpdate = (notification: GraphExtractionNotification) => {
            console.log('📢 Graph extraction notification received:', notification)
            if (notification.datasetId === datasetId) {
                if (notification.stage === 'started') {
                    // Update segments to show extraction started
                    setSegments(prev =>
                        prev.map(s => {
                            // Check if this segment is being extracted (we track this via extractingSegments state)
                            if (extractingSegments.has(s.id)) {
                                return { ...s, extractionStatus: 'extracting' as const }
                            }
                            return s
                        })
                    )
                } else if (notification.stage === 'processing_segment') {
                    // Update specific segment being processed
                    if (notification.segmentIds && notification.segmentIds.length > 0) {
                        setSegments(prev =>
                            prev.map(s =>
                                notification.segmentIds!.includes(s.id)
                                    ? { ...s, extractionStatus: 'extracting' as const }
                                    : s
                            )
                        )
                    }
                } else if (notification.stage === 'completed') {
                    console.log('✅ Extraction completed notification received', {
                        segmentIds: notification.segmentIds,
                        datasetId: notification.datasetId,
                        documentId: notification.documentId
                    })
                    // Get segment IDs that were being extracted
                    setSegments(prev => {
                        // Find all segments that are currently extracting
                        const extractingSegmentIds = prev
                            .filter(s => s.extractionStatus === 'extracting')
                            .map(s => s.id)

                        console.log('🔍 Currently extracting segments:', extractingSegmentIds)

                        // Use segmentIds from notification if available, otherwise use extracting segments
                        const segmentIdsToUpdate = notification.segmentIds && notification.segmentIds.length > 0
                            ? notification.segmentIds
                            : extractingSegmentIds

                        console.log('📝 Segments to update:', segmentIdsToUpdate)

                        if (segmentIdsToUpdate.length === 0) {
                            // Fallback: update all extracting segments to idle
                            console.log('⚠️ No specific segments to update, updating all extracting segments')
                            return prev.map(s =>
                                s.extractionStatus === 'extracting'
                                    ? { ...s, extractionStatus: 'idle' as const, isEmpty: true }
                                    : s
                            )
                        }

                        // Store segmentIds in a const to ensure closure captures it correctly
                        const segmentIds = [...segmentIdsToUpdate]

                        // Immediately update status to idle temporarily while we fetch graph data
                        // This prevents the "extracting" status from staying stuck
                        const updatedSegments = prev.map(s =>
                            segmentIds.includes(s.id)
                                ? { ...s, extractionStatus: 'idle' as const }
                                : s
                        )

                        // Fetch graph data for all segments asynchronously
                        Promise.all(
                            segmentIds.map(async (segmentId) => {
                                try {
                                    const graphData = await getSegmentGraphData(segmentId)
                                    return { segmentId, graphData, error: null }
                                } catch (err) {
                                    return {
                                        segmentId,
                                        graphData: null,
                                        error: err instanceof Error ? err.message : 'Unknown error'
                                    }
                                }
                            })
                        ).then(results => {
                            console.log('📊 Graph data fetch results:', results)
                            setSegments(currentSegments => {
                                const updated = currentSegments.map(s => {
                                    if (!segmentIds.includes(s.id)) {
                                        return s
                                    }

                                    const result = results.find(r => r.segmentId === s.id)
                                    if (!result) {
                                        // No result found, set to idle
                                        console.log(`⚠️ No result for segment ${s.id}, setting to idle`)
                                        return {
                                            ...s,
                                            extractionStatus: 'idle' as const,
                                            isEmpty: true
                                        }
                                    }

                                    if (result.error) {
                                        console.log(`❌ Error for segment ${s.id}:`, result.error)
                                        return {
                                            ...s,
                                            extractionStatus: 'error' as const,
                                            isEmpty: true,
                                            error: result.error
                                        }
                                    }

                                    // Update with graph data
                                    const hasGraphData = (result.graphData?.nodes?.length || 0) > 0 ||
                                        (result.graphData?.edges?.length || 0) > 0

                                    console.log(`✅ Updating segment ${s.id}: hasGraphData=${hasGraphData}, nodes=${result.graphData?.nodes?.length || 0}, edges=${result.graphData?.edges?.length || 0}`)

                                    return {
                                        ...s,
                                        graphNodes: result.graphData?.nodes || [],
                                        graphEdges: result.graphData?.edges || [],
                                        extractionStatus: hasGraphData ? 'completed' as const : 'idle' as const,
                                        lastExtracted: result.graphData?.lastExtracted || new Date(),
                                        isEmpty: !hasGraphData,
                                        error: result.graphData?.error
                                    }
                                })
                                console.log('🔄 Updated segments:', updated.map(s => ({ id: s.id, status: s.extractionStatus })))
                                return updated
                            })
                        }).catch(err => {
                            console.error('❌ Error fetching graph data:', err)
                            // On error, update all segments to error state
                            setSegments(currentSegments =>
                                currentSegments.map(s =>
                                    segmentIds.includes(s.id)
                                        ? { ...s, extractionStatus: 'error' as const, isEmpty: true, error: err.message }
                                        : s
                                )
                            )
                        })

                        return updatedSegments
                    })
                    success('Segment Extraction Complete', 'Graph extraction completed successfully')
                } else if (notification.stage === 'error') {
                    setSegments(prev =>
                        prev.map(s =>
                            s.extractionStatus === 'extracting'
                                ? { ...s, extractionStatus: 'error' as const, isEmpty: true }
                                : s
                        )
                    )
                    showError('Extraction Failed', notification.message || 'Graph extraction failed')
                }
            }
        }

        notificationService.onGraphExtractionUpdate(handleGraphExtractionUpdate)

        return () => {
            // Cleanup handled by notification service
        }
    }, [datasetId, success, showError, getSegmentGraphData, extractingSegments])

    // Load documents for the dataset
    const loadDocuments = useCallback(async () => {
        try {
            setLoadingDocuments(true)
            const result = await documentApi.getByDataset(datasetId, 1, 100)
            const docs = result.data || []
            setDocuments(docs)
            // Don't auto-select - keep empty by default
        } catch (err) {
            console.error('Failed to load documents:', err)
            showError('Failed to load documents')
        } finally {
            setLoadingDocuments(false)
        }
    }, [datasetId, showError])

    // Load segments - either for a specific document or all segments from dataset
    const loadSegments = useCallback(async (documentId: string | null, page: number = 1) => {
        try {
            setLoadingSegments(true)
            const hasGraphDataParam = nodeFilter === 'with-nodes' ? 'true' : nodeFilter === 'without-nodes' ? 'false' : 'all'

            let response: {
                data: DocumentSegment[]
                count: number
                total: number
                page: number
                pageCount: number
                graphDataCache?: Map<string, GraphDataCache>
            }

            if (documentId) {
                // Load segments for specific document
                response = await documentSegmentApi.getByDocumentWithFilters(documentId, {
                    page,
                    limit: pageSize,
                    search: searchQuery.trim() || undefined,
                    hasGraphData: hasGraphDataParam
                })
            } else {
                // Load segments from dataset using filtered endpoint with SQL JOINs
                // This uses efficient SQL queries instead of individual API calls
                response = await documentSegmentApi.getByDatasetWithFilters(datasetId, {
                    page,
                    limit: pageSize,
                    search: searchQuery.trim() || undefined,
                    hasGraphData: hasGraphDataParam
                })

                // Initialize empty graph data cache (will be loaded lazily when needed)
                response.graphDataCache = new Map<string, GraphDataCache>()
            }

            // Enhance segments with graph data (lazy loading - only when needed)
            // Use cached data if available (from node filter step)
            // Otherwise, don't fetch graph data on initial load - fetch it lazily when user needs it
            const enhancedSegments = response.data.map((segment) => {
                // Check if we have cached graph data (from node filter step)
                const cachedData = response.graphDataCache?.get(segment.id)

                if (cachedData) {
                    // Use cached data - no need to call API again
                    return {
                        ...segment,
                        graphNodes: cachedData?.nodes || [],
                        graphEdges: cachedData?.edges || [],
                        extractionStatus: (cachedData?.nodes?.length || 0) > 0 ? 'completed' as const : 'idle' as const,
                        lastExtracted: cachedData?.lastExtracted,
                        isEmpty: cachedData?.isEmpty || false,
                        error: cachedData?.error
                    }
                } else {
                    // Don't fetch graph data on initial load - will be fetched lazily when needed
                    // This significantly reduces API calls
                    return {
                        ...segment,
                        graphNodes: undefined,
                        graphEdges: undefined,
                        extractionStatus: 'idle' as const,
                        isEmpty: undefined,
                        error: undefined
                    }
                }
            })

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
    }, [datasetId, nodeFilter, searchQuery, showError, pageSize])

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

    // Lazy load graph data for a specific segment (only when needed)
    const loadSegmentGraphData = async (segmentId: string) => {
        // Check if already loaded
        const segment = segments.find(s => s.id === segmentId)
        if (segment && (segment.graphNodes !== undefined || segment.graphEdges !== undefined)) {
            return // Already loaded
        }

        if (loadingGraphData.has(segmentId)) {
            return // Already loading
        }

        try {
            setLoadingGraphData(prev => new Set(prev).add(segmentId))
            const graphData = await getSegmentGraphData(segmentId)
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
        } catch (err) {
            console.error('Failed to load segment graph data:', err)
            setSegments(prev =>
                prev.map(s =>
                    s.id === segmentId
                        ? {
                            ...s,
                            graphNodes: [],
                            graphEdges: [],
                            extractionStatus: 'error' as const,
                            isEmpty: true,
                            error: err instanceof Error ? err.message : 'Unknown error'
                        }
                        : s
                )
            )
        } finally {
            setLoadingGraphData(prev => {
                const newSet = new Set(prev)
                newSet.delete(segmentId)
                return newSet
            })
        }
    }

    // Refresh graph data for a specific segment
    const refreshSegmentGraphData = async (segmentId: string) => {
        await loadSegmentGraphData(segmentId)
    }

    // Toggle segment expansion (to show/hide graph data)
    const toggleSegmentExpansion = (segmentId: string) => {
        setExpandedSegments(prev => {
            const newSet = new Set(prev)
            if (newSet.has(segmentId)) {
                newSet.delete(segmentId)
            } else {
                newSet.add(segmentId)
                // Load graph data when expanding
                loadSegmentGraphData(segmentId)
            }
            return newSet
        })
    }

    // Extract graph from specific segment
    const extractFromSegment = async (segment: SegmentWithGraphData) => {
        try {
            setExtractingSegments(prev => new Set(prev).add(segment.id))
            const config: GraphExtractionConfig = { syncMode: false }
            const result = await graphApi.triggerSegmentExtraction(segment.documentId, [segment.id], config)

            if (result.success) {
                setSegments(prev =>
                    prev.map(s => s.id === segment.id ? { ...s, extractionStatus: 'extracting' as const } : s)
                )

                // Set up fallback to check status after extraction
                setTimeout(async () => {
                    setSegments(prev => {
                        const currentSegment = prev.find(s => s.id === segment.id)
                        if (currentSegment && currentSegment.extractionStatus === 'extracting') {
                            // Still extracting, refresh graph data
                            getSegmentGraphData(segment.id).then(graphData => {
                                setSegments(currentSegments =>
                                    currentSegments.map(s =>
                                        s.id === segment.id
                                            ? {
                                                ...s,
                                                graphNodes: graphData.nodes || [],
                                                graphEdges: graphData.edges || [],
                                                extractionStatus: (graphData.nodes?.length || 0) > 0 ? 'completed' as const : 'idle' as const,
                                                lastExtracted: graphData.lastExtracted || new Date(),
                                                isEmpty: graphData.isEmpty || false,
                                                error: graphData.error
                                            }
                                            : s
                                    )
                                )
                            }).catch(err => {
                                console.error(`Failed to refresh segment ${segment.id}:`, err)
                            })
                        }
                        return prev
                    })
                }, 5000)

                success('Segment Extraction Started', 'Graph extraction has been started. You will receive updates as it progresses.')
            } else {
                throw new Error(result.message)
            }
        } catch (err) {
            showError('Extraction Failed', err instanceof Error ? err.message : 'Failed to extract from segment')
            setSegments(prev =>
                prev.map(s => s.id === segment.id ? { ...s, extractionStatus: 'error' as const } : s)
            )
        } finally {
            setExtractingSegments(prev => {
                const newSet = new Set(prev)
                newSet.delete(segment.id)
                return newSet
            })
        }
    }

    // Batch extract from selected segments
    const extractBatch = async (segmentIds: string[]) => {
        if (segmentIds.length === 0) return

        try {
            setIsExtractingBatch(true)
            const config: GraphExtractionConfig = { syncMode: false }

            // Group segments by document
            const segmentsByDocument = new Map<string, string[]>()
            segments.forEach(segment => {
                if (segmentIds.includes(segment.id)) {
                    if (!segmentsByDocument.has(segment.documentId)) {
                        segmentsByDocument.set(segment.documentId, [])
                    }
                    segmentsByDocument.get(segment.documentId)!.push(segment.id)
                }
            })

            // Extract from each document
            const promises = Array.from(segmentsByDocument.entries()).map(([documentId, segIds]) =>
                graphApi.triggerSegmentExtraction(documentId, segIds, config)
            )

            const results = await Promise.all(promises)
            console.log('📤 Extraction API responses:', results)

            // Update segment statuses to extracting
            setSegments(prev =>
                prev.map(s => segmentIds.includes(s.id) ? { ...s, extractionStatus: 'extracting' as const } : s)
            )

            // Set up a fallback mechanism to check status after extraction
            // This handles cases where notifications might not be received
            const checkStatusAfterDelay = async () => {
                // Wait 5 seconds, then check if segments are still extracting
                setTimeout(async () => {
                    setSegments(prev => {
                        const stillExtracting = prev.filter(s =>
                            segmentIds.includes(s.id) && s.extractionStatus === 'extracting'
                        )

                        if (stillExtracting.length > 0) {
                            console.log('⏰ Fallback: Checking status for segments still extracting:', stillExtracting.map(s => s.id))
                            // Refresh graph data for segments still extracting
                            stillExtracting.forEach(async (segment) => {
                                try {
                                    const graphData = await getSegmentGraphData(segment.id)
                                    setSegments(currentSegments =>
                                        currentSegments.map(s =>
                                            s.id === segment.id
                                                ? {
                                                    ...s,
                                                    graphNodes: graphData.nodes || [],
                                                    graphEdges: graphData.edges || [],
                                                    extractionStatus: (graphData.nodes?.length || 0) > 0 ? 'completed' as const : 'idle' as const,
                                                    lastExtracted: graphData.lastExtracted || new Date(),
                                                    isEmpty: graphData.isEmpty || false,
                                                    error: graphData.error
                                                }
                                                : s
                                        )
                                    )
                                } catch (err) {
                                    console.error(`Failed to refresh segment ${segment.id}:`, err)
                                    // Keep as extracting if refresh fails - will retry on next check
                                }
                            })
                        }
                        return prev
                    })
                }, 5000) // Check after 5 seconds
            }

            checkStatusAfterDelay()

            success('Batch Extraction Started', `Graph extraction started for ${segmentIds.length} segment(s).`)
            setSelectedSegmentIds(new Set())
        } catch (err) {
            console.error('❌ Extraction error:', err)
            // On error, update segments to error state
            setSegments(prev =>
                prev.map(s => segmentIds.includes(s.id) ? { ...s, extractionStatus: 'error' as const } : s)
            )
            showError('Batch Extraction Failed', err instanceof Error ? err.message : 'Failed to extract from segments')
        } finally {
            setIsExtractingBatch(false)
        }
    }

    // Extract all segments from dataset (respecting filters)
    const extractAll = async () => {
        if (totalSegments === 0) return

        try {
            setIsExtractingBatch(true)
            const config: GraphExtractionConfig = { syncMode: false }

            // Get all segment IDs that match current filters
            const allSegmentIds: string[] = []
            const segmentsByDocument = new Map<string, string[]>()
            let page = 1
            let hasMore = true
            const hasGraphDataParam = nodeFilter === 'with-nodes' ? 'true' : nodeFilter === 'without-nodes' ? 'false' : 'all'

            while (hasMore) {
                let response: {
                    data: DocumentSegment[]
                    pageCount: number
                }

                if (selectedDocumentId) {
                    response = await documentSegmentApi.getByDocumentWithFilters(selectedDocumentId, {
                        page,
                        limit: 100,
                        search: searchQuery.trim() || undefined,
                        hasGraphData: hasGraphDataParam
                    })
                } else {
                    const searchFilter = searchQuery.trim()
                        ? `&filter=content||cont||${encodeURIComponent(searchQuery.trim())}`
                        : ''
                    const crudResponse = await apiClient.get(
                        `/document-segments?filter=datasetId||eq||${datasetId}${searchFilter}&page=${page}&limit=100&sort=position,ASC`
                    )
                    const crudData = crudResponse.data?.data || crudResponse.data || []
                    const crudPageCount = crudResponse.data?.pageCount || Math.ceil((crudResponse.data?.total || crudData.length) / 100)

                    let paginatedData = crudData

                    // Apply node filter if needed
                    if (hasGraphDataParam !== 'all') {
                        const segmentsWithGraphData = await Promise.all(
                            paginatedData.map(async (seg: DocumentSegment) => {
                                try {
                                    const graphData = await getSegmentGraphData(seg.id)
                                    const hasNodes = (graphData?.nodes?.length || 0) > 0
                                    return { segment: seg, hasNodes }
                                } catch {
                                    return { segment: seg, hasNodes: false }
                                }
                            })
                        )

                        if (hasGraphDataParam === 'true') {
                            paginatedData = segmentsWithGraphData
                                .filter(item => item.hasNodes)
                                .map(item => item.segment)
                        } else {
                            paginatedData = segmentsWithGraphData
                                .filter(item => !item.hasNodes)
                                .map(item => item.segment)
                        }
                    }

                    response = {
                        data: paginatedData,
                        pageCount: crudPageCount
                    }
                }

                if (response.data && response.data.length > 0) {
                    response.data.forEach(seg => {
                        allSegmentIds.push(seg.id)
                        if (!segmentsByDocument.has(seg.documentId)) {
                            segmentsByDocument.set(seg.documentId, [])
                        }
                        segmentsByDocument.get(seg.documentId)!.push(seg.id)
                    })
                    page++
                    hasMore = page <= response.pageCount
                } else {
                    hasMore = false
                }
            }

            if (allSegmentIds.length === 0) {
                showError('No Segments', 'No segments match the current filters.')
                return
            }

            // Extract from each document
            const promises = Array.from(segmentsByDocument.entries()).map(([documentId, segIds]) =>
                graphApi.triggerSegmentExtraction(documentId, segIds, config)
            )

            const results = await Promise.all(promises)
            console.log('📤 Extract All API responses:', results)

            // Update segment statuses to extracting
            setSegments(prev =>
                prev.map(s => allSegmentIds.includes(s.id) ? { ...s, extractionStatus: 'extracting' as const } : s)
            )

            // Set up fallback mechanism to check status after extraction
            setTimeout(async () => {
                setSegments(prev => {
                    const stillExtracting = prev.filter(s =>
                        allSegmentIds.includes(s.id) && s.extractionStatus === 'extracting'
                    )

                    if (stillExtracting.length > 0) {
                        stillExtracting.forEach(async (segment) => {
                            try {
                                const graphData = await getSegmentGraphData(segment.id)
                                setSegments(currentSegments =>
                                    currentSegments.map(s =>
                                        s.id === segment.id
                                            ? {
                                                ...s,
                                                graphNodes: graphData.nodes || [],
                                                graphEdges: graphData.edges || [],
                                                extractionStatus: (graphData.nodes?.length || 0) > 0 ? 'completed' as const : 'idle' as const,
                                                lastExtracted: graphData.lastExtracted || new Date(),
                                                isEmpty: graphData.isEmpty || false,
                                                error: graphData.error
                                            }
                                            : s
                                    )
                                )
                            } catch (err) {
                                console.error(`Failed to refresh segment ${segment.id}:`, err)
                            }
                        })
                    }
                    return prev
                })
            }, 5000)

            success('Extraction Started', `Graph extraction started for ${allSegmentIds.length} filtered segment(s).`)
        } catch (err) {
            showError('Extraction Failed', err instanceof Error ? err.message : 'Failed to extract all segments')
        } finally {
            setIsExtractingBatch(false)
        }
    }

    // Remove graph data from selected segments
    const removeSelectedGraphs = async () => {
        if (selectedSegmentIds.size === 0) return

        const segmentIds = Array.from(selectedSegmentIds)
        const confirmed = window.confirm(
            `Are you sure you want to remove graph data from ${segmentIds.length} selected segment(s)?`
        )
        if (!confirmed) return

        try {
            setIsExtractingBatch(true)

            await Promise.all(
                segmentIds.map(async (segmentId) => {
                    try {
                        const result = await graphApi.clearSegmentGraph(segmentId)
                        if (result.success) {
                            // Update segment state
                            setSegments(prev =>
                                prev.map(s =>
                                    s.id === segmentId
                                        ? {
                                            ...s,
                                            graphNodes: [],
                                            graphEdges: [],
                                            extractionStatus: 'idle' as const,
                                            isEmpty: true,
                                            lastExtracted: undefined
                                        }
                                        : s
                                )
                            )
                        }
                    } catch (err) {
                        console.error(`Failed to remove graph for segment ${segmentId}:`, err)
                    }
                })
            )

            success('Graph Data Removed', `Removed graph data from ${segmentIds.length} segment(s)`)
            setSelectedSegmentIds(new Set())
        } catch (err) {
            showError('Removal Failed', err instanceof Error ? err.message : 'Failed to remove graph data')
        } finally {
            setIsExtractingBatch(false)
        }
    }

    // Remove graph data from all segments in dataset (respecting filters)
    const removeAllGraphs = async () => {
        const confirmed = window.confirm(
            `Are you sure you want to remove graph data from all ${totalSegments} filtered segment(s)?`
        )
        if (!confirmed) return

        try {
            setIsExtractingBatch(true)

            // Get all segment IDs that match current filters
            const allSegmentIds: string[] = []
            let page = 1
            let hasMore = true
            const hasGraphDataParam = nodeFilter === 'with-nodes' ? 'true' : nodeFilter === 'without-nodes' ? 'false' : 'all'

            while (hasMore) {
                let response: {
                    data: DocumentSegment[]
                    pageCount: number
                }

                if (selectedDocumentId) {
                    response = await documentSegmentApi.getByDocumentWithFilters(selectedDocumentId, {
                        page,
                        limit: 100,
                        search: searchQuery.trim() || undefined,
                        hasGraphData: hasGraphDataParam
                    })
                } else {
                    const searchFilter = searchQuery.trim()
                        ? `&filter=content||cont||${encodeURIComponent(searchQuery.trim())}`
                        : ''
                    const crudResponse = await apiClient.get(
                        `/document-segments?filter=datasetId||eq||${datasetId}${searchFilter}&page=${page}&limit=100&sort=position,ASC`
                    )
                    const crudData = crudResponse.data?.data || crudResponse.data || []
                    const crudPageCount = crudResponse.data?.pageCount || Math.ceil((crudResponse.data?.total || crudData.length) / 100)

                    let paginatedData = crudData

                    // Apply node filter if needed
                    if (hasGraphDataParam !== 'all') {
                        const segmentsWithGraphData = await Promise.all(
                            paginatedData.map(async (seg: DocumentSegment) => {
                                try {
                                    const graphData = await getSegmentGraphData(seg.id)
                                    const hasNodes = (graphData?.nodes?.length || 0) > 0
                                    return { segment: seg, hasNodes }
                                } catch {
                                    return { segment: seg, hasNodes: false }
                                }
                            })
                        )

                        if (hasGraphDataParam === 'true') {
                            paginatedData = segmentsWithGraphData
                                .filter(item => item.hasNodes)
                                .map(item => item.segment)
                        } else {
                            paginatedData = segmentsWithGraphData
                                .filter(item => !item.hasNodes)
                                .map(item => item.segment)
                        }
                    }

                    response = {
                        data: paginatedData,
                        pageCount: crudPageCount
                    }
                }

                if (response.data && response.data.length > 0) {
                    allSegmentIds.push(...response.data.map(s => s.id))
                    page++
                    hasMore = page <= response.pageCount
                } else {
                    hasMore = false
                }
            }

            if (allSegmentIds.length === 0) {
                showError('No Segments', 'No segments match the current filters.')
                return
            }

            // Remove graph data from all filtered segments
            await Promise.all(
                allSegmentIds.map(async (segmentId) => {
                    try {
                        await graphApi.clearSegmentGraph(segmentId)
                    } catch (err) {
                        console.error(`Failed to remove graph for segment ${segmentId}:`, err)
                    }
                })
            )

            // Refresh current page segments
            await loadSegments(selectedDocumentId || null, currentPage)

            success('Graph Data Removed', `Removed graph data from ${allSegmentIds.length} filtered segment(s)`)
        } catch (err) {
            showError('Removal Failed', err instanceof Error ? err.message : 'Failed to remove graph data')
        } finally {
            setIsExtractingBatch(false)
        }
    }

    // Load documents on mount
    useEffect(() => {
        loadDocuments()
    }, [datasetId, loadDocuments])

    // Debounced search query reload
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            loadSegments(selectedDocumentId || null, 1)
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [searchQuery, selectedDocumentId, loadSegments])

    // Load segments when document or filters change (including initial load)
    useEffect(() => {
        loadSegments(selectedDocumentId || null, currentPage)
    }, [selectedDocumentId, currentPage, nodeFilter, loadSegments])

    const selectedDocument = documents.find(doc => doc.id === selectedDocumentId)
    const selectedCount = selectedSegmentIds.size

    // Update document search query when document is selected
    useEffect(() => {
        if (selectedDocument) {
            setDocumentSearchQuery(selectedDocument.name)
        }
    }, [selectedDocument])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Document & Segment Explorer</h2>
                    <p className="text-sm text-gray-600">
                        Explore all segments and extract graphs from specific segments
                    </p>
                </div>
                <Button
                    onClick={() => loadSegments(selectedDocumentId || null, currentPage)}
                    variant="outline"
                    size="sm"
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <span>Filters</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Document Autocomplete */}
                        <div className="space-y-2" ref={documentSearchRef}>
                            <Label>Document</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <div className="flex items-center">
                                    <Input
                                        placeholder="Search documents..."
                                        value={showDocumentDropdown ? documentSearchQuery : (selectedDocument ? selectedDocument.name : '')}
                                        onChange={(e) => {
                                            setDocumentSearchQuery(e.target.value)
                                            setShowDocumentDropdown(true)
                                        }}
                                        onFocus={() => {
                                            if (selectedDocument) {
                                                setDocumentSearchQuery(selectedDocument.name)
                                            }
                                            setShowDocumentDropdown(true)
                                        }}
                                        onBlur={() => {
                                            // Delay to allow click on dropdown items
                                            setTimeout(() => setShowDocumentDropdown(false), 200)
                                        }}
                                        className="pl-10 cursor-pointer"
                                    />
                                    {selectedDocumentId && (
                                        <button
                                            onClick={handleClearDocument}
                                            className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                                            title="Clear document selection"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                {showDocumentDropdown && filteredDocuments.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                        {filteredDocuments.map((doc) => (
                                            <button
                                                key={doc.id}
                                                onClick={() => handleDocumentSelect(doc.id)}
                                                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between"
                                            >
                                                <span>{doc.name}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {doc.indexingStatus}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Segment Search */}
                        <div className="space-y-2">
                            <Label>Search Segments</Label>
                            <Input
                                placeholder="Search segment content..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Node Filter */}
                        <div className="space-y-2">
                            <Label>Has Nodes</Label>
                            <select
                                value={nodeFilter}
                                onChange={(e) => handleNodeFilterChange(e.target.value as 'all' | 'with-nodes' | 'without-nodes')}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="all">All segments</option>
                                <option value="with-nodes">With nodes only</option>
                                <option value="without-nodes">Without nodes only</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Segments List */}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center space-x-2">
                            <CardTitle className="flex items-center space-x-2">
                                <Database className="h-5 w-5" />
                                <span>Segments</span>
                                <Badge variant="outline">{totalSegments}</Badge>
                            </CardTitle>
                        </div>

                        {/* Batch Actions */}
                        <div className="flex items-center space-x-2 flex-wrap gap-2">
                            {selectedCount > 0 && (
                                <>
                                    <Button
                                        onClick={() => extractBatch(Array.from(selectedSegmentIds))}
                                        disabled={isExtractingBatch}
                                        size="sm"
                                        variant="default"
                                    >
                                        {isExtractingBatch ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Play className="h-4 w-4 mr-2" />
                                        )}
                                        Extract Selected ({selectedCount})
                                    </Button>
                                    <Button
                                        onClick={removeSelectedGraphs}
                                        disabled={isExtractingBatch}
                                        size="sm"
                                        variant="destructive"
                                    >
                                        {isExtractingBatch ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4 mr-2" />
                                        )}
                                        Remove Selected ({selectedCount})
                                    </Button>
                                </>
                            )}
                            {allPageSelected && totalSegments > 0 && (
                                <>
                                    <Button
                                        onClick={extractAll}
                                        disabled={isExtractingBatch || totalSegments === 0}
                                        size="sm"
                                        variant="outline"
                                    >
                                        {isExtractingBatch ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Play className="h-4 w-4 mr-2" />
                                        )}
                                        Extract All ({totalSegments})
                                    </Button>
                                    <Button
                                        onClick={removeAllGraphs}
                                        disabled={isExtractingBatch}
                                        size="sm"
                                        variant="destructive"
                                    >
                                        {isExtractingBatch ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4 mr-2" />
                                        )}
                                        Remove All ({totalSegments})
                                    </Button>
                                </>
                            )}
                        </div>
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
                            {/* Select All Checkbox */}
                            {segments.length > 0 && (
                                <div className="flex items-center space-x-2 pb-2 border-b">
                                    <Checkbox
                                        checked={allPageSelected}
                                        onCheckedChange={handleSelectAllPage}
                                    />
                                    <Label className="text-sm font-medium">
                                        Select all on this page ({segments.length})
                                    </Label>
                                    {selectedCount > 0 && (
                                        <span className="text-sm text-gray-500 ml-2">
                                            ({selectedCount} selected)
                                        </span>
                                    )}
                                </div>
                            )}

                            {segments.map((segment) => (
                                <div
                                    key={segment.id}
                                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start space-x-3 flex-1">
                                            <Checkbox
                                                checked={selectedSegmentIds.has(segment.id)}
                                                onCheckedChange={() => handleSegmentToggle(segment.id)}
                                                className="mt-1"
                                            />
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

                                                {/* Graph Data - Lazy loaded only when needed */}
                                                {loadingGraphData.has(segment.id) && (
                                                    <div className="flex items-center space-x-2 text-xs text-gray-500 mt-2">
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                        <span>Loading graph data...</span>
                                                    </div>
                                                )}

                                                {/* Show graph data if loaded or extracting */}
                                                {(segment.extractionStatus === 'extracting' ||
                                                    (segment.graphNodes !== undefined || segment.graphEdges !== undefined)) && (
                                                        <div className="space-y-2 mt-2">
                                                            {((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
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
                                                            )}

                                                            {/* Detailed Graph Data - Only show if expanded or has data */}
                                                            {(expandedSegments.has(segment.id) ||
                                                                (segment.graphNodes !== undefined || segment.graphEdges !== undefined) ||
                                                                segment.extractionStatus === 'extracting') && (
                                                                    <div className="bg-gray-50 rounded-md p-3 space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="text-xs font-medium text-gray-700">
                                                                                {segment.extractionStatus === 'extracting' ? 'Extracting Graph Data...' :
                                                                                    segment.isEmpty ? 'No Graph Data Found' : 'Extracted Graph Data:'}
                                                                            </div>
                                                                            <div className="flex items-center space-x-2">
                                                                                {!expandedSegments.has(segment.id) && segment.graphNodes === undefined && segment.graphEdges === undefined && (
                                                                                    <Button
                                                                                        onClick={() => toggleSegmentExpansion(segment.id)}
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        className="h-6 px-2 text-xs"
                                                                                        disabled={loadingGraphData.has(segment.id)}
                                                                                    >
                                                                                        {loadingGraphData.has(segment.id) ? (
                                                                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                                                        ) : (
                                                                                            <Eye className="h-3 w-3 mr-1" />
                                                                                        )}
                                                                                        Load Graph Data
                                                                                    </Button>
                                                                                )}
                                                                                {(segment.graphNodes !== undefined || segment.graphEdges !== undefined) && (
                                                                                    <>
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
                                                                                    </>
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
                                                                                            {segment.graphNodes.slice(0, 5).map((node, index) => (
                                                                                                <div key={`node-${node.id || index}`} className="flex items-center space-x-2 text-xs">
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
                                                                                            ))}
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
                                                                )}
                                                        </div>
                                                    )}

                                                {/* Show button to load graph data if not loaded yet */}
                                                {segment.graphNodes === undefined && segment.graphEdges === undefined && segment.extractionStatus !== 'extracting' && !loadingGraphData.has(segment.id) && (
                                                    <Button
                                                        onClick={() => toggleSegmentExpansion(segment.id)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="mt-2"
                                                    >
                                                        <Network className="h-3 w-3 mr-1" />
                                                        Load Graph Data
                                                    </Button>
                                                )}
                                            </div>

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

                                            {(segment.graphNodes !== undefined || segment.graphEdges !== undefined) &&
                                                ((segment.graphNodes?.length || 0) > 0 || (segment.graphEdges?.length || 0) > 0) && (
                                                    <Button
                                                        onClick={() => {
                                                            // Ensure graph data is loaded before opening modal
                                                            if (segment.graphNodes === undefined && segment.graphEdges === undefined) {
                                                                loadSegmentGraphData(segment.id).then(() => {
                                                                    const updatedSegment = segments.find(s => s.id === segment.id)
                                                                    if (updatedSegment) {
                                                                        handleOpenDetailModal(updatedSegment)
                                                                    }
                                                                })
                                                            } else {
                                                                handleOpenDetailModal(segment)
                                                            }
                                                        }}
                                                        size="sm"
                                                        variant="secondary"
                                                        disabled={loadingGraphData.has(segment.id)}
                                                    >
                                                        {loadingGraphData.has(segment.id) ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Network className="h-4 w-4" />
                                                                <span className="ml-1">View Graph</span>
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {segments.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    {searchQuery
                                        ? 'No segments match your search.'
                                        : nodeFilter === 'with-nodes'
                                            ? 'No segments with nodes found. Try changing the filter or extract graph data from segments.'
                                            : nodeFilter === 'without-nodes'
                                                ? 'No segments without nodes found. All segments have graph data.'
                                                : selectedDocumentId
                                                    ? 'No segments found in this document.'
                                                    : 'No segments found in this dataset.'
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
                                    onClick={() => setCurrentPage(currentPage - 1)}
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
                                    onClick={() => setCurrentPage(currentPage + 1)}
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

