'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
    BarChart3,
    Network,
    TrendingUp,
    Users,
    Hash,
    Target,
    Activity
} from 'lucide-react'
import { type GraphData } from '@/lib/api'

interface GraphStatsProps {
    data: GraphData
    className?: string
}

export function GraphStats({ data, className }: GraphStatsProps) {
    const { stats, nodes, edges } = data

    // Calculate additional statistics
    const avgNodeConnections = edges.length > 0 ? (edges.length * 2) / nodes.length : 0
    const mostConnectedNode = nodes.reduce((max, node) => {
        const connections = edges.filter(e =>
            e.sourceNodeId === node.id || e.targetNodeId === node.id
        ).length
        return connections > max.connections ? { node, connections } : max
    }, { node: nodes[0], connections: 0 })

    // Get top node types by count
    const nodeTypeStats = stats.nodeTypeDistribution
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    // Get top edge types by count
    const edgeTypeStats = stats.edgeTypeDistribution
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    // Get top brands by mention count
    const topBrands = stats.topBrands.slice(0, 5)

    return (
        <div className={`space-y-6 ${className}`}>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-2">
                            <Network className="h-5 w-5 text-blue-500" />
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Nodes</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.totalNodes}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-2">
                            <Activity className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Edges</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.totalEdges}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-2">
                            <TrendingUp className="h-5 w-5 text-purple-500" />
                            <div>
                                <p className="text-sm font-medium text-gray-600">Avg Connections</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {avgNodeConnections.toFixed(1)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-2">
                            <Target className="h-5 w-5 text-orange-500" />
                            <div>
                                <p className="text-sm font-medium text-gray-600">Most Connected</p>
                                <p className="text-lg font-bold text-gray-900">
                                    {mostConnectedNode.node?.label || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {mostConnectedNode.connections} connections
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Node Type Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Hash className="h-5 w-5" />
                            <span>Node Types</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {nodeTypeStats.map(({ type, count }) => {
                                const percentage = (count / stats.totalNodes) * 100
                                return (
                                    <div key={type} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium capitalize">
                                                {type.replace('_', ' ')}
                                            </span>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm text-gray-600">{count}</span>
                                                <Badge variant="secondary" className="text-xs">
                                                    {percentage.toFixed(1)}%
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress value={percentage} className="h-2" />
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Edge Type Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <BarChart3 className="h-5 w-5" />
                            <span>Edge Types</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {edgeTypeStats.map(({ type, count }) => {
                                const percentage = (count / stats.totalEdges) * 100
                                return (
                                    <div key={type} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium capitalize">
                                                {type.replace('_', ' ')}
                                            </span>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm text-gray-600">{count}</span>
                                                <Badge variant="secondary" className="text-xs">
                                                    {percentage.toFixed(1)}%
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress value={percentage} className="h-2" />
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top Brands */}
            {topBrands.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Users className="h-5 w-5" />
                            <span>Top Brands</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {topBrands.map(({ brand, mentionCount }, index) => {
                                const maxMentions = topBrands[0]?.mentionCount || 1
                                const percentage = (mentionCount / maxMentions) * 100
                                return (
                                    <div key={brand} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm font-medium text-gray-500">
                                                    #{index + 1}
                                                </span>
                                                <span className="text-sm font-medium">{brand}</span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm text-gray-600">{mentionCount}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    mentions
                                                </Badge>
                                            </div>
                                        </div>
                                        <Progress value={percentage} className="h-2" />
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Graph Density */}
            <Card>
                <CardHeader>
                    <CardTitle>Graph Density</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">
                                    {((edges.length * 2) / (nodes.length * (nodes.length - 1)) * 100).toFixed(2)}%
                                </p>
                                <p className="text-sm text-gray-600">Density</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">
                                    {nodes.length > 0 ? (edges.length / nodes.length).toFixed(2) : 0}
                                </p>
                                <p className="text-sm text-gray-600">Edges per Node</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-gray-900">
                                    {nodeTypeStats.length}
                                </p>
                                <p className="text-sm text-gray-600">Node Types</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
