'use client'

import React from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Network, X, Users, Link, TrendingUp, Building, Package, Calendar, Hash } from 'lucide-react'

interface GraphNode {
    id: string
    label: string
    type?: string
    properties?: {
        confidence?: number
        normalized_name?: string
        channel?: string
        platform?: string
        verified?: boolean
        follower_count?: number
        engagement_rate?: number
        sentiment_score?: number
        temporal_data?: {
            first_mentioned?: string
            last_mentioned?: string
            mention_count?: number
        }
        [key: string]: any
    }
}

interface GraphEdge {
    id: string
    from: string
    to: string
    type?: string
    weight?: number
    properties?: {
        context?: string
        sentiment?: string
        confidence?: number
        sentiment_score?: number
        [key: string]: any
    }
}

interface SegmentGraphDetailModalProps {
    isOpen: boolean
    onClose: () => void
    segmentId: string
    segmentContent: string
    nodes: GraphNode[]
    edges: GraphEdge[]
    extractionStatus?: 'idle' | 'extracting' | 'completed' | 'error'
    lastExtracted?: Date
}

const getNodeIcon = (type?: string) => {
    if (!type) return <Network className="h-4 w-4" />

    switch (type.toLowerCase()) {
        case 'person':
        case 'author':
            return <Users className="h-4 w-4" />
        case 'organization':
        case 'brand':
            return <Building className="h-4 w-4" />
        case 'product':
            return <Package className="h-4 w-4" />
        case 'event':
            return <Calendar className="h-4 w-4" />
        case 'topic':
            return <Hash className="h-4 w-4" />
        default:
            return <Network className="h-4 w-4" />
    }
}

const getNodeTypeColor = (type?: string) => {
    if (!type) return 'bg-gray-100 text-gray-800'

    switch (type.toLowerCase()) {
        case 'person':
        case 'author':
            return 'bg-blue-100 text-blue-800'
        case 'organization':
        case 'brand':
            return 'bg-green-100 text-green-800'
        case 'product':
            return 'bg-purple-100 text-purple-800'
        case 'event':
            return 'bg-orange-100 text-orange-800'
        case 'topic':
            return 'bg-gray-100 text-gray-800'
        default:
            return 'bg-gray-100 text-gray-800'
    }
}

const getEdgeTypeColor = (type?: string) => {
    if (!type) return 'bg-gray-100 text-gray-800'

    switch (type.toLowerCase()) {
        case 'mentions':
            return 'bg-blue-100 text-blue-800'
        case 'interacts_with':
            return 'bg-green-100 text-green-800'
        case 'competes_with':
            return 'bg-red-100 text-red-800'
        case 'collaborates':
            return 'bg-purple-100 text-purple-800'
        case 'discusses':
            return 'bg-yellow-100 text-yellow-800'
        case 'shares_topic':
            return 'bg-indigo-100 text-indigo-800'
        case 'follows':
            return 'bg-pink-100 text-pink-800'
        case 'influences':
            return 'bg-orange-100 text-orange-800'
        case 'located_in':
            return 'bg-teal-100 text-teal-800'
        case 'part_of':
            return 'bg-cyan-100 text-cyan-800'
        case 'related_to':
            return 'bg-gray-100 text-gray-800'
        default:
            return 'bg-gray-100 text-gray-800'
    }
}

export function SegmentGraphDetailModal({
    isOpen,
    onClose,
    segmentId,
    segmentContent,
    nodes,
    edges,
    extractionStatus,
    lastExtracted,
}: SegmentGraphDetailModalProps) {
    const formatDate = (date: Date) => {
        return date.toLocaleString()
    }

    const formatConfidence = (confidence?: number) => {
        if (confidence === undefined) return 'N/A'
        return `${(confidence * 100).toFixed(1)}%`
    }

    const formatSentiment = (score?: number) => {
        if (score === undefined) return 'N/A'
        if (score > 0.1) return `+${score.toFixed(2)} (Positive)`
        if (score < -0.1) return `${score.toFixed(2)} (Negative)`
        return `${score.toFixed(2)} (Neutral)`
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center space-x-2">
                        <Network className="h-5 w-5" />
                        <span>Graph Data Details</span>
                    </DialogTitle>
                    <DialogDescription>
                        Detailed view of extracted entities and relationships from this segment
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Segment Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Segment Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="text-sm">
                                    <span className="font-medium">Status:</span>{' '}
                                    <Badge
                                        variant={
                                            extractionStatus === 'completed'
                                                ? 'default'
                                                : extractionStatus === 'extracting'
                                                    ? 'secondary'
                                                    : extractionStatus === 'error'
                                                        ? 'destructive'
                                                        : 'outline'
                                        }
                                    >
                                        {extractionStatus || 'idle'}
                                    </Badge>
                                </div>
                                {lastExtracted && (
                                    <div className="text-sm">
                                        <span className="font-medium">Last Extracted:</span>{' '}
                                        {formatDate(lastExtracted)}
                                    </div>
                                )}
                                <div className="text-sm">
                                    <span className="font-medium">Segment ID:</span> {segmentId}
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium">Content Preview:</span>
                                    <div className="mt-1 p-2 bg-gray-50 rounded text-xs max-h-20 overflow-y-auto">
                                        {segmentContent.substring(0, 200)}
                                        {segmentContent.length > 200 && '...'}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Graph Data Tabs */}
                    <Tabs defaultValue="nodes" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="nodes" className="flex items-center space-x-2">
                                <Users className="h-4 w-4" />
                                <span>Nodes ({nodes.length})</span>
                            </TabsTrigger>
                            <TabsTrigger value="edges" className="flex items-center space-x-2">
                                <Link className="h-4 w-4" />
                                <span>Relationships ({edges.length})</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Nodes Tab */}
                        <TabsContent value="nodes" className="space-y-4">
                            {nodes.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No nodes extracted from this segment
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {nodes.map((node, index) => (
                                        <Card key={node.id || index}>
                                            <CardContent className="p-4">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        {getNodeIcon(node.type)}
                                                        <div>
                                                            <div className="flex items-center space-x-2">
                                                                <h3 className="font-medium">{node.label}</h3>
                                                                <Badge className={getNodeTypeColor(node.type)}>
                                                                    {node.type || 'Unknown'}
                                                                </Badge>
                                                            </div>
                                                            {node.properties?.normalized_name && (
                                                                <p className="text-sm text-gray-600">
                                                                    Normalized: {node.properties.normalized_name}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right text-sm text-gray-500">
                                                        {node.properties?.confidence && (
                                                            <div>Confidence: {formatConfidence(node.properties.confidence)}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Node Properties */}
                                                {node.properties && Object.keys(node.properties).length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="text-xs font-medium text-gray-700">Properties:</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            {node.properties.channel && (
                                                                <div>
                                                                    <span className="font-medium">Channel:</span> {node.properties.channel}
                                                                </div>
                                                            )}
                                                            {node.properties.platform && (
                                                                <div>
                                                                    <span className="font-medium">Platform:</span> {node.properties.platform}
                                                                </div>
                                                            )}
                                                            {node.properties.verified !== undefined && (
                                                                <div>
                                                                    <span className="font-medium">Verified:</span>{' '}
                                                                    {node.properties.verified ? 'Yes' : 'No'}
                                                                </div>
                                                            )}
                                                            {node.properties.follower_count && (
                                                                <div>
                                                                    <span className="font-medium">Followers:</span>{' '}
                                                                    {node.properties.follower_count.toLocaleString()}
                                                                </div>
                                                            )}
                                                            {node.properties.engagement_rate && (
                                                                <div>
                                                                    <span className="font-medium">Engagement:</span>{' '}
                                                                    {(node.properties.engagement_rate * 100).toFixed(1)}%
                                                                </div>
                                                            )}
                                                            {node.properties.sentiment_score !== undefined && (
                                                                <div>
                                                                    <span className="font-medium">Sentiment:</span>{' '}
                                                                    {formatSentiment(node.properties.sentiment_score)}
                                                                </div>
                                                            )}
                                                            {node.properties.temporal_data && (
                                                                <div className="col-span-2">
                                                                    <span className="font-medium">Temporal Data:</span>
                                                                    <div className="ml-2 text-xs">
                                                                        {node.properties.temporal_data.mention_count && (
                                                                            <div>Mentions: {node.properties.temporal_data.mention_count}</div>
                                                                        )}
                                                                        {node.properties.temporal_data.first_mentioned && (
                                                                            <div>
                                                                                First: {new Date(node.properties.temporal_data.first_mentioned).toLocaleDateString()}
                                                                            </div>
                                                                        )}
                                                                        {node.properties.temporal_data.last_mentioned && (
                                                                            <div>
                                                                                Last: {new Date(node.properties.temporal_data.last_mentioned).toLocaleDateString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        {/* Edges Tab */}
                        <TabsContent value="edges" className="space-y-4">
                            {edges.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No relationships extracted from this segment
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {edges.map((edge, index) => (
                                        <Card key={edge.id || index}>
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="font-medium">{edge.from}</span>
                                                            <span className="text-gray-400">→</span>
                                                            <Badge className={getEdgeTypeColor(edge.type)}>
                                                                {edge.type || 'Unknown'}
                                                            </Badge>
                                                            <span className="font-medium">{edge.to}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right text-sm text-gray-500">
                                                        {edge.properties?.confidence && (
                                                            <div>Confidence: {formatConfidence(edge.properties.confidence)}</div>
                                                        )}
                                                        {edge.weight && typeof edge.weight === 'number' && (
                                                            <div>Weight: {edge.weight.toFixed(2)}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Edge Properties */}
                                                {edge.properties && Object.keys(edge.properties).length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="text-xs font-medium text-gray-700">Properties:</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            {edge.properties.context && (
                                                                <div className="col-span-2">
                                                                    <span className="font-medium">Context:</span> {edge.properties.context}
                                                                </div>
                                                            )}
                                                            {edge.properties.sentiment && (
                                                                <div>
                                                                    <span className="font-medium">Sentiment:</span> {edge.properties.sentiment}
                                                                </div>
                                                            )}
                                                            {edge.properties.sentiment_score !== undefined && (
                                                                <div>
                                                                    <span className="font-medium">Sentiment Score:</span>{' '}
                                                                    {formatSentiment(edge.properties.sentiment_score)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="flex justify-end">
                    <Button onClick={onClose} variant="outline">
                        <X className="h-4 w-4 mr-2" />
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
