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
import { Badge } from '@/components/ui/badge'
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
}

interface EdgeData extends GraphEdge {
    source: string | NodeData
    target: string | NodeData
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
    height = 600,
    width = 800
}: GraphVisualizationProps) {
    // Calculate responsive dimensions
    const canvasHeight = Math.floor(height / 1.5) // Reduce height by 1.5x
    const fgRef = useRef<any>()
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([])
    const [selectedEdgeTypes, setSelectedEdgeTypes] = useState<string[]>([])
    const [showLabels, setShowLabels] = useState(true)
    const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
    const [selectedEdge, setSelectedEdge] = useState<EdgeData | null>(null)
    const [containerWidth, setContainerWidth] = useState(width)

    // Handle container resize - use ResizeObserver to get actual container width
    useEffect(() => {
        const container = document.querySelector('[data-graph-container]')
        if (!container) return

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                // Calculate 80% of container width (8 out of 10 columns)
                const newWidth = Math.floor(entry.contentRect.width * 0.8)
                setContainerWidth(newWidth)
            }
        })

        resizeObserver.observe(container)
        return () => resizeObserver.disconnect()
    }, [])

    // Use container width for canvas
    const currentCanvasWidth = containerWidth

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
        const nodes = filteredData.nodes.map((node, index) => {
            // Calculate base size from confidence
            const confidence = node.properties?.confidence || 0.5
            let baseSize = Math.max(6, Math.min(20, confidence * 16 + 6))

            // Add size boost for high-engagement entities
            if (node.properties?.engagement_rate && node.properties.engagement_rate > 0.1) {
                baseSize *= 1.3
            }

            // Add size boost for verified entities
            if (node.properties?.verified) {
                baseSize *= 1.2
            }

            // Add size boost for high follower count (influencers, brands)
            if (node.properties?.follower_count && node.properties.follower_count > 10000) {
                baseSize *= 1.4
            }

            // Add size boost for frequently mentioned entities
            if (node.properties?.temporal_data?.mention_count && node.properties.temporal_data.mention_count > 5) {
                baseSize *= 1.2
            }

            // Add size boost for high sentiment entities (positive or negative)
            if (node.properties?.sentiment_score && Math.abs(node.properties.sentiment_score) > 0.7) {
                baseSize *= 1.1
            }

            // Ensure size is within reasonable bounds
            const finalSize = Math.max(4, Math.min(25, baseSize))

            return {
                ...node,
                id: node.id,
                group: node.nodeType,
                color: NODE_TYPE_COLORS[node.nodeType] || NODE_TYPE_COLORS.default,
                size: finalSize,
                // Add visual emphasis for important nodes
                opacity: confidence > 0.8 ? 1.0 : 0.8,
                // Add initial random positioning to keep clusters together but spaced
                x: (Math.random() - 0.5) * 400,
                y: (Math.random() - 0.5) * 400
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

    // Auto-spread nodes when graph data changes
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            // Wait a bit for the graph to initialize, then spread nodes
            const timer = setTimeout(() => {
                try {
                    // Simple approach - just restart the simulation without custom forces
                    if (fgRef.current?.d3Reheat) {
                        fgRef.current.d3Reheat()
                    }
                } catch (error) {
                    console.warn('Force simulation error:', error)
                }
            }, 1000)

            return () => clearTimeout(timer)
        }
    }, [graphData])

    // Handle node click
    const handleNodeClick = useCallback((node: NodeData) => {
        setSelectedNode(node)
        onNodeClick?.(node)
    }, [onNodeClick])

    // Handle edge click
    const handleEdgeClick = useCallback((edge: EdgeData) => {
        setSelectedEdge(edge)
        onEdgeClick?.(edge)
    }, [onEdgeClick])

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
        if (fgRef.current?.d3Reheat) {
            fgRef.current.d3Reheat()
        }
    }, [])

    const handleSpreadNodes = useCallback(() => {
        try {
            // Simple approach - just restart the simulation and zoom out
            if (fgRef.current?.d3Reheat) {
                fgRef.current.d3Reheat()
            }

            // Zoom out to see the full spread
            setTimeout(() => {
                fgRef.current?.zoomToFit(1200)
            }, 500)
        } catch (error) {
            console.warn('Force simulation error:', error)
        }
    }, [])

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
                    <div className="relative">
                        {ForceGraph2D && (
                            <ForceGraph2D
                                key={`${currentCanvasWidth}-${canvasHeight}`}
                                ref={fgRef}
                                graphData={graphData}
                                height={canvasHeight}
                                width={currentCanvasWidth}
                                nodeLabel={showLabels ? (node: NodeData) => `${node.label} (${node.nodeType})` : undefined}
                                nodeColor={(node: NodeData) => node.color}
                                nodeCanvasObject={(node: NodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
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
                                    if (showLabels && globalScale > 0.5) {
                                        const fontSize = Math.max(8, 12 / globalScale)
                                        ctx.font = `${fontSize}px Sans-Serif`
                                        ctx.textAlign = 'center'
                                        ctx.textBaseline = 'middle'

                                        // Draw text background for better readability
                                        const textMetrics = ctx.measureText(label)
                                        const textWidth = textMetrics.width
                                        const textHeight = fontSize
                                        const padding = 2

                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
                                        ctx.fillRect(
                                            x - textWidth / 2 - padding,
                                            y + nodeSize + 2 - textHeight / 2 - padding,
                                            textWidth + padding * 2,
                                            textHeight + padding * 2
                                        )

                                        // Draw text
                                        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
                                        ctx.fillText(label, x, y + nodeSize + 2)
                                    }
                                }}
                                linkLabel={(edge: EdgeData) => `${edge.edgeType} (${edge.weight})`}
                                linkColor={(edge: EdgeData) => edge.color}
                                linkWidth={(edge: EdgeData) => edge.width}
                                linkCanvasObject={(link: EdgeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
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
                                onNodeClick={handleNodeClick}
                                onLinkClick={handleEdgeClick}
                                onNodeHover={(node: NodeData) => {
                                    if (node) {
                                        // Could add tooltip or highlight effect here
                                        console.log('Hovering over node:', node.label, 'Type:', node.nodeType)
                                    }
                                }}
                                cooldownTicks={150}
                                d3AlphaDecay={0.03}
                                d3VelocityDecay={0.4}
                                d3AlphaMin={0.2}
                                d3AlphaTarget={0.4}
                                enableZoomInteraction={true}
                                enablePanInteraction={true}
                                enableNodeDrag={true}
                                linkDirectionalArrowLength={6}
                                linkDirectionalArrowRelPos={1}
                                linkCurvature={0.1}
                                linkDirectionalArrowColor={(link: EdgeData) => link.color}
                                nodePointerAreaPaint={(node: NodeData, color: string, ctx: CanvasRenderingContext2D) => {
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

            {/* Node/Edge Details */}
            {(selectedNode || selectedEdge) && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {selectedNode ? 'Node Details' : 'Edge Details'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedNode && (
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Badge variant="outline" className="capitalize">
                                        {selectedNode.nodeType}
                                    </Badge>
                                    <span className="font-medium">{selectedNode.label}</span>
                                    <div className="flex items-center space-x-1">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: selectedNode.color }}
                                        />
                                        <span className="text-xs text-gray-500">
                                            Size: {Math.round(selectedNode.size || 5)}px
                                        </span>
                                    </div>
                                </div>

                                {/* Importance indicators */}
                                <div className="flex flex-wrap gap-2">
                                    {selectedNode.properties?.verified && (
                                        <Badge variant="secondary" className="text-xs">✓ Verified</Badge>
                                    )}
                                    {selectedNode.properties?.confidence && selectedNode.properties.confidence > 0.8 && (
                                        <Badge variant="secondary" className="text-xs">High Confidence</Badge>
                                    )}
                                    {selectedNode.properties?.engagement_rate && selectedNode.properties.engagement_rate > 0.1 && (
                                        <Badge variant="secondary" className="text-xs">High Engagement</Badge>
                                    )}
                                    {selectedNode.properties?.follower_count && selectedNode.properties.follower_count > 10000 && (
                                        <Badge variant="secondary" className="text-xs">Large Following</Badge>
                                    )}
                                </div>

                                {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                                    <div className="text-sm text-gray-600">
                                        <div className="font-medium mb-1">Properties:</div>
                                        {Object.entries(selectedNode.properties).map(([key, value]) => (
                                            <div key={key} className="flex justify-between">
                                                <span className="capitalize">{key.replace('_', ' ')}:</span>
                                                <span>{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {selectedEdge && (
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Badge variant="outline" className="capitalize">
                                        {selectedEdge.edgeType}
                                    </Badge>
                                    <span className="font-medium">Weight: {selectedEdge.weight}</span>
                                </div>
                                {selectedEdge.properties && Object.keys(selectedEdge.properties).length > 0 && (
                                    <div className="text-sm text-gray-600">
                                        <div className="font-medium mb-1">Properties:</div>
                                        {Object.entries(selectedEdge.properties).map(([key, value]) => (
                                            <div key={key} className="flex justify-between">
                                                <span className="capitalize">{key.replace('_', ' ')}:</span>
                                                <span>{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
