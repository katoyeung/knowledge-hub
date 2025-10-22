'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import ForceGraph2D with SSR disabled
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-64">Loading graph...</div>
})
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Search,
    Download,
    Settings
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { type GraphNode, type GraphEdge, type GraphData } from '@/lib/api'

interface GraphVisualizationProps {
    data: GraphData
    onNodeClick?: (node: GraphNode) => void
    onEdgeClick?: (edge: GraphEdge) => void
    onNodeSelect?: (node: NodeData | null) => void
    onEdgeSelect?: (edge: EdgeData | null) => void
    height?: number
    width?: number
}

interface NodeData extends GraphNode {
    x?: number
    y?: number
    vx?: number
    vy?: number
    fx?: number
    fy?: number
    color?: string
    size?: number
    opacity?: number
    isIsolated?: boolean
}

interface EdgeData extends GraphEdge {
    source: string | NodeData
    target: string | NodeData
    color?: string
    width?: number
}

// Color mapping for different node types
const NODE_TYPE_COLORS = {
    author: '#3B82F6',      // Blue
    brand: '#10B981',       // Green
    topic: '#F59E0B',       // Yellow
    hashtag: '#8B5CF6',     // Purple
    influencer: '#EF4444',  // Red
    location: '#06B6D4',    // Cyan
    organization: '#84CC16', // Lime
    product: '#F97316',     // Orange
    event: '#EC4899',       // Pink
    default: '#6B7280'      // Gray
}

// Color mapping for different edge types
const EDGE_TYPE_COLORS = {
    mentions: '#3B82F6',
    sentiment: '#10B981',
    interacts_with: '#F59E0B',
    competes_with: '#EF4444',
    discusses: '#8B5CF6',
    shares_topic: '#06B6D4',
    follows: '#84CC16',
    collaborates: '#F97316',
    influences: '#EC4899',
    located_in: '#14B8A6',
    part_of: '#A78BFA',
    related_to: '#6B7280',
    default: '#9CA3AF'
}

export function GraphVisualization({
    data,
    onNodeClick,
    onEdgeClick,
    onNodeSelect,
    onEdgeSelect,
    height = 600,
    width = 800
}: GraphVisualizationProps) {
    // Calculate responsive dimensions
    const canvasHeight = Math.floor(height / 1.5) // Reduce height by 1.5x
    const fgRef = useRef<any>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([])
    const [selectedEdgeTypes, setSelectedEdgeTypes] = useState<string[]>([])
    const [showLabels, setShowLabels] = useState(true)
    const [containerWidth, setContainerWidth] = useState(width)
    const [spreadShape, setSpreadShape] = useState<'left' | 'right' | 'follow' | 'circle'>('left')

    // Handle container resize - use ResizeObserver to get actual container width
    useEffect(() => {
        const container = document.querySelector('[data-graph-container]')
        if (!container) {
            // Fallback: use the parent container or calculate based on viewport
            const parentContainer = document.querySelector('.col-span-8')
            if (parentContainer) {
                const resizeObserver = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        // Use full width of the 8-column container
                        const newWidth = Math.floor(entry.contentRect.width)
                        setContainerWidth(newWidth)
                    }
                })
                resizeObserver.observe(parentContainer)
                return () => resizeObserver.disconnect()
            } else {
                // Final fallback: use the passed width prop
                setContainerWidth(width)
            }
            return
        }

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                // Use full width of the container
                const newWidth = Math.floor(entry.contentRect.width)
                setContainerWidth(newWidth)
            }
        })

        resizeObserver.observe(container)
        return () => resizeObserver.disconnect()
    }, [width])

    // Use container width for canvas with maximum constraint
    const currentCanvasWidth = Math.min(containerWidth, 1200) // Max width of 1200px

    // Get unique node and edge types
    const nodeTypes = Array.from(new Set(data.nodes.map(n => n.nodeType)))
    const edgeTypes = Array.from(new Set(data.edges.map(e => e.edgeType)))

    // Filter data based on search and type filters
    const filteredData = React.useMemo(() => {
        let filteredNodes = data.nodes
        let filteredEdges = data.edges

        // Filter by search term
        if (searchTerm) {
            filteredNodes = filteredNodes.filter(node =>
                node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                node.nodeType.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        // Filter by node types
        if (selectedNodeTypes.length > 0) {
            filteredNodes = filteredNodes.filter(node =>
                selectedNodeTypes.includes(node.nodeType)
            )
        }

        // Filter by edge types
        if (selectedEdgeTypes.length > 0) {
            filteredEdges = filteredEdges.filter(edge =>
                selectedEdgeTypes.includes(edge.edgeType)
            )
        }

        // Only include edges where both source and target nodes are in filtered nodes
        const nodeIds = new Set(filteredNodes.map(n => n.id))
        filteredEdges = filteredEdges.filter(edge =>
            nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)
        )

        return {
            nodes: filteredNodes,
            edges: filteredEdges
        }
    }, [data, searchTerm, selectedNodeTypes, selectedEdgeTypes])

    // Transform data for react-force-graph-2d
    const graphData = React.useMemo(() => {
        // First, identify which nodes are isolated (have no connections)
        const connectedNodeIds = new Set<string>()
        filteredData.edges.forEach(edge => {
            connectedNodeIds.add(edge.sourceNodeId)
            connectedNodeIds.add(edge.targetNodeId)
        })

        const nodes = filteredData.nodes.map((node) => {
            // Calculate base size from confidence - smaller base sizes
            const confidence = node.properties?.confidence || 0.5
            let baseSize = Math.max(4, Math.min(12, confidence * 8 + 4))

            // Add size boost for high-engagement entities
            if (node.properties?.engagement_rate && node.properties.engagement_rate > 0.1) {
                baseSize *= 1.2
            }

            // Add size boost for verified entities
            if (node.properties?.verified) {
                baseSize *= 1.1
            }

            // Add size boost for high follower count (influencers, brands)
            if (node.properties?.follower_count && node.properties.follower_count > 10000) {
                baseSize *= 1.3
            }

            // Add size boost for frequently mentioned entities
            if (node.properties?.temporal_data?.mention_count && node.properties.temporal_data.mention_count > 5) {
                baseSize *= 1.1
            }

            // Add size boost for high sentiment entities (positive or negative)
            if (node.properties?.sentiment_score && Math.abs(node.properties.sentiment_score) > 0.7) {
                baseSize *= 1.05
            }

            // Ensure size is within reasonable bounds - smaller maximum
            const finalSize = Math.max(3, Math.min(15, baseSize))

            // Check if this node is isolated (no connections)
            const isIsolated = !connectedNodeIds.has(node.id)

            // Different positioning strategy for isolated vs connected nodes
            let x, y
            if (isIsolated) {
                // Isolated nodes: very close together in a tight cluster at top-left
                const isolatedNodes = filteredData.nodes.filter(n => !connectedNodeIds.has(n.id))
                const isolatedIndex = isolatedNodes.findIndex(n => n.id === node.id)
                const angle = (isolatedIndex / Math.max(1, isolatedNodes.length)) * 2 * Math.PI
                const radius = 8 // Very small radius for tight clustering
                x = -150 + Math.cos(angle) * radius // Position at left side
                y = -100 + Math.sin(angle) * radius // Position at top
            } else {
                // Connected nodes: spread out in the center area
                const connectedNodes = filteredData.nodes.filter(n => connectedNodeIds.has(n.id))
                const connectedIndex = connectedNodes.findIndex(n => n.id === node.id)
                const angle = (connectedIndex / Math.max(1, connectedNodes.length)) * 2 * Math.PI
                const radius = Math.min(150, Math.sqrt(connectedNodes.length) * 30)
                x = Math.cos(angle) * radius // Position at center
                y = Math.sin(angle) * radius
            }

            return {
                ...node,
                id: node.id,
                group: node.nodeType,
                color: isIsolated ? '#ff6b6b' : (NODE_TYPE_COLORS[node.nodeType] || NODE_TYPE_COLORS.default), // Red for isolated nodes
                size: finalSize,
                // Add visual emphasis for important nodes
                opacity: confidence > 0.8 ? 1.0 : 0.8,
                // Custom positioning based on connection status
                x: x,
                y: y,
                isIsolated: isIsolated
            }
        })

        const links = filteredData.edges.map(edge => ({
            ...edge,
            id: edge.id,
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
            color: EDGE_TYPE_COLORS[edge.edgeType] || EDGE_TYPE_COLORS.default,
            width: Math.max(0.5, Math.min(2, edge.weight * 0.5 + 0.5))
        }))

        return { nodes, links }
    }, [filteredData])

    // Handle node click with shape spreading
    const handleNodeClick = useCallback((node: NodeData) => {
        onNodeClick?.(node)
        onNodeSelect?.(node)

        // Find connected nodes
        const connectedNodeIds = new Set<string>()
        filteredData.edges.forEach(edge => {
            if (edge.sourceNodeId === node.id) {
                connectedNodeIds.add(edge.targetNodeId)
            }
            if (edge.targetNodeId === node.id) {
                connectedNodeIds.add(edge.sourceNodeId)
            }
        })

        if (connectedNodeIds.size > 0) {
            // Get current graph data from the component state
            const nodes = graphData.nodes
            const centerX = node.x || 0
            const centerY = node.y || 0

            // Spread connected nodes in the selected shape
            const connectedNodes = nodes.filter((n: NodeData) => connectedNodeIds.has(n.id))
            connectedNodes.forEach((connectedNode: NodeData, index: number) => {
                let angle: number
                let distance: number

                switch (spreadShape) {
                    case 'left':
                        // Left arrow shape (180-360 degrees)
                        angle = (index / connectedNodes.length) * Math.PI + Math.PI
                        distance = 100 + (index * 20)
                        break
                    case 'right':
                        // Right arrow shape (0-180 degrees)
                        angle = (index / connectedNodes.length) * Math.PI
                        distance = 100 + (index * 20)
                        break
                    case 'follow':
                        // Follow shape (vertical line)
                        angle = Math.PI / 2 // 90 degrees (up)
                        distance = 80 + (index * 30)
                        break
                    case 'circle':
                        // Circle shape
                        angle = (index / connectedNodes.length) * 2 * Math.PI
                        distance = 120
                        break
                    default:
                        angle = (index / connectedNodes.length) * Math.PI + Math.PI
                        distance = 100 + (index * 20)
                }

                connectedNode.x = centerX + Math.cos(angle) * distance
                connectedNode.y = centerY + Math.sin(angle) * distance
            })

            // Let the natural force simulation handle the positioning
            // No need to manually restart the simulation
        }
    }, [onNodeClick, onNodeSelect, filteredData, graphData, spreadShape])

    // Handle edge click
    const handleEdgeClick = useCallback((edge: EdgeData) => {
        onEdgeClick?.(edge)
        onEdgeSelect?.(edge)
    }, [onEdgeClick, onEdgeSelect])

    // Handle zoom controls
    const handleZoomIn = useCallback(() => {
        fgRef.current?.zoom(1.2, 1000)
    }, [])

    const handleZoomOut = useCallback(() => {
        fgRef.current?.zoom(0.8, 1000)
    }, [])

    const handleReset = useCallback(() => {
        fgRef.current?.zoomToFit(1000)
        // Restart the force simulation to redistribute nodes
        // Let the natural force simulation handle the positioning
        // No need to manually restart the simulation
    }, [])

    const handleSpreadNodes = useCallback(() => {
        try {
            if (fgRef.current) {
                // Get current graph data
                const graphData = fgRef.current.graphData()
                const nodes = graphData.nodes
                const centerX = currentCanvasWidth / 2
                const centerY = canvasHeight / 2
                const spreadRadius = Math.min(currentCanvasWidth, canvasHeight) * 0.15

                // Reposition nodes with different strategies for isolated vs connected
                const isolatedNodes = nodes.filter((node: NodeData) => node.isIsolated)
                const connectedNodes = nodes.filter((node: NodeData) => !node.isIsolated)

                // Isolated nodes: very tight cluster at top-left
                isolatedNodes.forEach((node: NodeData, index: number) => {
                    const angle = (index / Math.max(1, isolatedNodes.length)) * 2 * Math.PI
                    const radius = 10 // Very small radius for tight clustering
                    node.x = centerX - 200 + Math.cos(angle) * radius
                    node.y = centerY - 150 + Math.sin(angle) * radius
                })

                // Connected nodes: spread out in center area
                connectedNodes.forEach((node: NodeData, index: number) => {
                    const angle = (index / Math.max(1, connectedNodes.length)) * 2 * Math.PI
                    const radius = spreadRadius * 0.5
                    node.x = centerX + Math.cos(angle) * radius
                    node.y = centerY + Math.sin(angle) * radius
                })

                // Let the natural force simulation handle the positioning
                // No need to manually restart the simulation

                // Zoom out to see the full spread
                setTimeout(() => {
                    fgRef.current?.zoomToFit(1200)
                }, 500)
            }
        } catch (error) {
            console.warn('Force simulation error:', error)
        }
    }, [currentCanvasWidth, canvasHeight])

    // Auto-spread nodes when graph data changes
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            // Wait for the graph to be ready, then spread nodes
            const timer = setTimeout(() => {
                handleSpreadNodes()
            }, 1000)

            return () => clearTimeout(timer)
        }
    }, [graphData, handleSpreadNodes])

    // Handle node type filter
    const handleNodeTypeToggle = useCallback((nodeType: string) => {
        setSelectedNodeTypes(prev =>
            prev.includes(nodeType)
                ? prev.filter(t => t !== nodeType)
                : [...prev, nodeType]
        )
    }, [])

    // Handle edge type filter
    const handleEdgeTypeToggle = useCallback((edgeType: string) => {
        setSelectedEdgeTypes(prev =>
            prev.includes(edgeType)
                ? prev.filter(t => t !== edgeType)
                : [...prev, edgeType]
        )
    }, [])

    // Clear all filters
    const handleClearFilters = useCallback(() => {
        setSearchTerm('')
        setSelectedNodeTypes([])
        setSelectedEdgeTypes([])
    }, [])

    // Download graph data
    const handleDownload = useCallback(() => {
        const dataStr = JSON.stringify(graphData, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'graph-data.json'
        link.click()
        URL.revokeObjectURL(url)
    }, [graphData])

    return (
        <div className="w-full space-y-4">
            {/* Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Graph Controls</span>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownload}
                                className="flex items-center space-x-1"
                            >
                                <Download className="h-4 w-4" />
                                <span>Export</span>
                            </Button>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search */}
                    <div className="flex items-center space-x-2">
                        <Search className="h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Search nodes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearFilters}
                        >
                            Clear
                        </Button>
                    </div>

                    {/* Node Type Filters */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Node Types
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {nodeTypes.map(nodeType => (
                                <div key={nodeType} className="flex items-center space-x-1">
                                    <Checkbox
                                        id={`node-${nodeType}`}
                                        checked={selectedNodeTypes.includes(nodeType)}
                                        onCheckedChange={() => handleNodeTypeToggle(nodeType)}
                                    />
                                    <label
                                        htmlFor={`node-${nodeType}`}
                                        className="text-sm flex items-center space-x-1 cursor-pointer"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: NODE_TYPE_COLORS[nodeType] || NODE_TYPE_COLORS.default }}
                                        />
                                        <span className="capitalize">{nodeType.replace('_', ' ')}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Edge Type Filters */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Edge Types
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {edgeTypes.map(edgeType => (
                                <div key={edgeType} className="flex items-center space-x-1">
                                    <Checkbox
                                        id={`edge-${edgeType}`}
                                        checked={selectedEdgeTypes.includes(edgeType)}
                                        onCheckedChange={() => handleEdgeTypeToggle(edgeType)}
                                    />
                                    <label
                                        htmlFor={`edge-${edgeType}`}
                                        className="text-sm flex items-center space-x-1 cursor-pointer"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: EDGE_TYPE_COLORS[edgeType] || EDGE_TYPE_COLORS.default }}
                                        />
                                        <span className="capitalize">{edgeType.replace('_', ' ')}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* View Controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleZoomIn}
                                >
                                    <ZoomIn className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleZoomOut}
                                >
                                    <ZoomOut className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleReset}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSpreadNodes}
                                    title="Spread nodes apart"
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>

                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Shape:</span>
                                    <select
                                        value={spreadShape}
                                        onChange={(e) => setSpreadShape(e.target.value as 'left' | 'right' | 'follow' | 'circle')}
                                        className="text-sm border rounded px-2 py-1"
                                    >
                                        <option value="left">Left Arrow</option>
                                        <option value="right">Right Arrow</option>
                                        <option value="follow">Follow Line</option>
                                        <option value="circle">Circle</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="show-labels"
                                    checked={showLabels}
                                    onCheckedChange={(checked) => setShowLabels(checked as boolean)}
                                />
                                <label htmlFor="show-labels" className="text-sm cursor-pointer">
                                    Show Labels
                                </label>
                            </div>
                        </div>
                        <div className="text-sm text-gray-500">
                            {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
                        </div>
                    </div>
                </CardContent>
            </Card>


            {/* Graph Visualization */}
            <Card>
                <CardContent className="p-0">
                    <div className="relative overflow-hidden">
                        {ForceGraph2D && (
                            <ForceGraph2D
                                key={`${currentCanvasWidth}-${canvasHeight}`}
                                ref={fgRef}
                                graphData={graphData}
                                height={canvasHeight}
                                width={currentCanvasWidth}
                                nodeLabel={showLabels ? (node: any) => `${node.label} (${node.nodeType})` : undefined}
                                nodeColor={(node: any) => node.color}
                                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                                    const label = node.label
                                    const nodeSize = node.size || 5
                                    const x = node.x || 0
                                    const y = node.y || 0
                                    const opacity = node.opacity || 1.0

                                    // Draw glow effect for important nodes
                                    if (nodeSize > 15) {
                                        ctx.shadowColor = node.color || NODE_TYPE_COLORS.default
                                        ctx.shadowBlur = 10
                                    }

                                    // Draw node circle
                                    ctx.beginPath()
                                    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI)
                                    ctx.fillStyle = node.color || NODE_TYPE_COLORS.default
                                    ctx.globalAlpha = opacity
                                    ctx.fill()

                                    // Reset shadow and alpha
                                    ctx.shadowBlur = 0
                                    ctx.globalAlpha = 1.0

                                    // Draw node border with different thickness based on importance
                                    const borderWidth = nodeSize > 15 ? 3 : 2
                                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
                                    ctx.lineWidth = borderWidth / globalScale
                                    ctx.stroke()

                                    // Add inner highlight for important nodes
                                    if (nodeSize > 12) {
                                        ctx.beginPath()
                                        ctx.arc(x, y, nodeSize * 0.6, 0, 2 * Math.PI)
                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
                                        ctx.fill()
                                    }

                                    // Draw label if showLabels is true and scale is appropriate
                                    if (showLabels && globalScale > 0.3) {
                                        const fontSize = Math.max(8, 10 / globalScale)
                                        ctx.font = `bold ${fontSize}px Sans-Serif`
                                        ctx.textAlign = 'center'
                                        ctx.textBaseline = 'middle'

                                        // Draw text background for better readability
                                        const textMetrics = ctx.measureText(label)
                                        const textWidth = textMetrics.width
                                        const textHeight = fontSize
                                        const padding = 3
                                        const labelY = y + nodeSize + 8

                                        // Draw rounded rectangle background
                                        const bgX = x - textWidth / 2 - padding
                                        const bgY = labelY - textHeight / 2 - padding
                                        const bgWidth = textWidth + padding * 2
                                        const bgHeight = textHeight + padding * 2

                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
                                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
                                        ctx.lineWidth = 1

                                        // Draw rounded rectangle
                                        ctx.beginPath()
                                        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 4)
                                        ctx.fill()
                                        ctx.stroke()

                                        // Draw text
                                        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
                                        ctx.fillText(label, x, labelY)
                                    }
                                }}
                                linkLabel={(edge: any) => `${edge.edgeType} (${edge.weight})`}
                                linkColor={(edge: any) => edge.color}
                                linkWidth={(edge: any) => edge.width}
                                linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                                    // Draw custom link with much better visibility
                                    const source = link.source as NodeData
                                    const target = link.target as NodeData

                                    if (!source || !target) return

                                    const sourceX = source.x || 0
                                    const sourceY = source.y || 0
                                    const targetX = target.x || 0
                                    const targetY = target.y || 0

                                    // Calculate line properties - make lines much thinner
                                    const lineWidth = Math.max(1, (link.width || 1) * 0.5 / globalScale)
                                    const color = link.color || EDGE_TYPE_COLORS.default

                                    // Draw thin background line for visibility
                                    ctx.beginPath()
                                    ctx.moveTo(sourceX, sourceY)
                                    ctx.lineTo(targetX, targetY)
                                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
                                    ctx.lineWidth = lineWidth + 1
                                    ctx.stroke()

                                    // Draw main link line
                                    ctx.beginPath()
                                    ctx.moveTo(sourceX, sourceY)
                                    ctx.lineTo(targetX, targetY)
                                    ctx.strokeStyle = color
                                    ctx.lineWidth = lineWidth
                                    ctx.stroke()

                                    // Draw arrow head with better visibility
                                    const angle = Math.atan2(targetY - sourceY, targetX - sourceX)
                                    const arrowLength = Math.max(12, 15 / globalScale)
                                    const arrowAngle = Math.PI / 5

                                    // Draw arrow background
                                    ctx.beginPath()
                                    ctx.moveTo(targetX, targetY)
                                    ctx.lineTo(
                                        targetX - arrowLength * Math.cos(angle - arrowAngle),
                                        targetY - arrowLength * Math.sin(angle - arrowAngle)
                                    )
                                    ctx.moveTo(targetX, targetY)
                                    ctx.lineTo(
                                        targetX - arrowLength * Math.cos(angle + arrowAngle),
                                        targetY - arrowLength * Math.sin(angle + arrowAngle)
                                    )
                                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
                                    ctx.lineWidth = lineWidth + 0.5
                                    ctx.stroke()

                                    // Draw arrow foreground
                                    ctx.beginPath()
                                    ctx.moveTo(targetX, targetY)
                                    ctx.lineTo(
                                        targetX - arrowLength * Math.cos(angle - arrowAngle),
                                        targetY - arrowLength * Math.sin(angle - arrowAngle)
                                    )
                                    ctx.moveTo(targetX, targetY)
                                    ctx.lineTo(
                                        targetX - arrowLength * Math.cos(angle + arrowAngle),
                                        targetY - arrowLength * Math.sin(angle + arrowAngle)
                                    )
                                    ctx.strokeStyle = color
                                    ctx.lineWidth = lineWidth
                                    ctx.stroke()
                                }}
                                onNodeClick={(node: any) => handleNodeClick(node as NodeData)}
                                onLinkClick={(edge: any) => handleEdgeClick(edge as EdgeData)}
                                onNodeHover={(node: any) => {
                                    if (node) {
                                        // Could add tooltip or highlight effect here
                                        console.log('Hovering over node:', node.label, 'Type:', node.nodeType)
                                    }
                                }}
                                cooldownTicks={300}
                                d3AlphaDecay={0.01}
                                d3VelocityDecay={0.2}
                                d3AlphaMin={0.1}
                                enableZoomInteraction={true}
                                enablePanInteraction={true}
                                enableNodeDrag={true}
                                linkDirectionalArrowLength={6}
                                linkDirectionalArrowRelPos={1}
                                linkCurvature={0.1}
                                linkDirectionalArrowColor={(link: any) => link.color}
                                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                                    // This ensures the clickable area matches the visual node
                                    const nodeSize = node.size || 5
                                    ctx.fillStyle = color
                                    ctx.beginPath()
                                    ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI)
                                    ctx.fill()
                                }}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}
