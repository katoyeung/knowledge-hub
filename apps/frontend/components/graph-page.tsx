'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
    RefreshCw,
    Play,
    Download,
    AlertCircle,
    CheckCircle,
    Loader2,
    Trash2,
    Settings
} from 'lucide-react'
import { GraphVisualization } from './graph-visualization'
import { GraphStats } from './graph-stats'
import { GraphSettingsPopup } from './graph-settings-popup'
import { DocumentSegmentExplorer } from './document-segment-explorer'
import { EntityDictionaryManager } from './entity-dictionary-manager'
import { EntitySuggestionsPanel } from './entity-suggestions-panel'
import { EntityAutoDiscovery } from './entity-auto-discovery'
import { EntityNormalizationPanel } from './entity-normalization-panel'
import { EntityDictionaryImportModal } from './entity-dictionary-import-modal'
import { DuplicateEntitiesModal } from './duplicate-entities-modal'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { graphApi, datasetApi, type GraphData, type GraphExtractionConfig, type GraphNode, type GraphEdge } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'

interface GraphPageProps {
    datasetId: string
    datasetName?: string
}

interface GraphSettings {
    aiProviderId?: string
    model?: string
    promptId?: string
    temperature?: number
    useHybridExtraction?: boolean
    entityMatchingThreshold?: number
    autoNormalization?: boolean
    continuousLearning?: boolean
}

export function GraphPage({ datasetId, datasetName }: GraphPageProps) {
    const [graphData, setGraphData] = useState<GraphData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isExtracting, setIsExtracting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [extractionStatus, setExtractionStatus] = useState<'idle' | 'extracting' | 'completed' | 'error'>('idle')
    const [graphSettings, setGraphSettings] = useState<GraphSettings>({})
    const [showClearDialog, setShowClearDialog] = useState(false)
    const [isClearing, setIsClearing] = useState(false)
    const [selectedNode, setSelectedNode] = useState<any>(null)
    const [selectedEdge, setSelectedEdge] = useState<any>(null)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
    const { success, error: showError, warning } = useToast()


    // Load graph data
    const loadGraphData = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const data = await graphApi.getGraphData(datasetId)
            setGraphData(data)
            setLastUpdated(new Date())
        } catch (err) {
            console.error('Failed to load graph data:', err)
            setError(err instanceof Error ? err.message : 'Failed to load graph data')
        } finally {
            setIsLoading(false)
        }
    }

    // Load graph settings
    const loadGraphSettings = async () => {
        try {
            const response = await datasetApi.getGraphSettings(datasetId)
            setGraphSettings(response.graphSettings || {})
        } catch (err) {
            console.error('Failed to load graph settings:', err)
            // Don't show error for settings load failure
        }
    }

    // Trigger graph extraction (async)
    const triggerExtraction = async () => {
        try {
            setIsExtracting(true)
            setExtractionStatus('extracting')

            const config: GraphExtractionConfig = {
                // Use default settings - the backend will use dataset chat settings
            }

            const result = await graphApi.triggerExtraction(datasetId, config)

            if (result.success) {
                success(
                    'Graph Extraction Started',
                    `${result.jobCount} jobs queued for processing`
                )

                // Poll for completion
                pollForCompletion()
            } else {
                throw new Error(result.message)
            }
        } catch (err) {
            console.error('Failed to trigger extraction:', err)
            setExtractionStatus('error')
            showError(
                'Extraction Failed',
                err instanceof Error ? err.message : 'Failed to start extraction'
            )
        } finally {
            setIsExtracting(false)
        }
    }

    // Trigger synchronous graph extraction
    const triggerSyncExtraction = async () => {
        try {
            setIsExtracting(true)
            setExtractionStatus('extracting')

            const config: GraphExtractionConfig = {
                syncMode: true, // Enable synchronous mode
                // Use default settings - the backend will use dataset graph settings
            }

            const result = await graphApi.triggerExtraction(datasetId, config)

            if (result.success) {
                // Reload graph data to show new nodes/edges
                await loadGraphData()

                setExtractionStatus('completed')
                success(
                    'Sync Extraction Complete',
                    `Created ${(result as { totalNodesCreated?: number }).totalNodesCreated || 0} nodes and ${(result as { totalEdgesCreated?: number }).totalEdgesCreated || 0} edges`
                )
            } else {
                throw new Error(result.message)
            }
        } catch (err) {
            console.error('Failed to trigger sync extraction:', err)
            setExtractionStatus('error')
            showError(
                'Sync Extraction Failed',
                err instanceof Error ? err.message : 'Failed to complete sync extraction'
            )
        } finally {
            setIsExtracting(false)
        }
    }

    // Poll for extraction completion
    const pollForCompletion = async () => {
        const maxAttempts = 30 // 5 minutes max
        let attempts = 0

        const poll = async () => {
            try {
                const data = await graphApi.getGraphData(datasetId)
                const hasNewData = data.nodes.length > (graphData?.nodes.length || 0)

                if (hasNewData) {
                    setGraphData(data)
                    setLastUpdated(new Date())
                    setExtractionStatus('completed')
                    success(
                        'Extraction Complete',
                        'Graph data has been updated'
                    )
                    return
                }

                attempts++
                if (attempts < maxAttempts) {
                    setTimeout(poll, 10000) // Poll every 10 seconds
                } else {
                    setExtractionStatus('error')
                    warning(
                        'Extraction Timeout',
                        'Extraction is taking longer than expected'
                    )
                }
            } catch (err) {
                console.error('Polling error:', err)
                setExtractionStatus('error')
            }
        }

        poll()
    }

    // Handle settings change
    const handleSettingsChange = (newSettings: GraphSettings) => {
        setGraphSettings(newSettings)
    }

    // Handle settings save
    const handleSaveSettings = async (newSettings: GraphSettings) => {
        try {
            await datasetApi.updateGraphSettings(datasetId, newSettings)
            setGraphSettings(newSettings)
            success('Graph settings saved successfully')
        } catch (err) {
            console.error('Failed to save graph settings:', err)
            showError('Failed to save graph settings')
        }
    }

    // Load data on mount
    useEffect(() => {
        loadGraphData()
        loadGraphSettings()
    }, [datasetId])

    // Handle node click
    const handleNodeClick = (node: unknown) => {
        console.log('Node clicked:', node)
        // You can add more detailed node inspection here
    }

    // Handle edge click
    const handleEdgeClick = (edge: unknown) => {
        console.log('Edge clicked:', edge)
        // You can add more detailed edge inspection here
    }

    // Handle node selection for right panel
    const handleNodeSelect = (node: any) => {
        setSelectedNode(node)
        setSelectedEdge(null) // Clear edge selection when node is selected
    }

    // Handle edge selection for right panel
    const handleEdgeSelect = (edge: any) => {
        setSelectedEdge(edge)
        setSelectedNode(null) // Clear node selection when edge is selected
    }


    // Download graph data
    const handleDownload = () => {
        if (!graphData) return

        const dataStr = JSON.stringify(graphData, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `graph-data-${datasetId}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    // Clear graph data
    const handleClearGraphData = async () => {
        try {
            setIsClearing(true)
            await graphApi.deleteGraphData(datasetId)

            // Clear local state
            setGraphData(null)
            setLastUpdated(null)
            setExtractionStatus('idle')

            success('Graph Data Cleared', 'All graph data has been successfully removed')
        } catch (err) {
            console.error('Failed to clear graph data:', err)
            showError(
                'Clear Failed',
                err instanceof Error ? err.message : 'Failed to clear graph data'
            )
        } finally {
            setIsClearing(false)
            setShowClearDialog(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex items-center space-x-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading graph data...</span>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center space-x-2 text-red-600 mb-4">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">Error loading graph data</span>
                    </div>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Button onClick={loadGraphData} variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {datasetName ? `${datasetName} - Graph` : 'Graph Visualization'}
                    </h1>
                    {lastUpdated && (
                        <p className="text-sm text-gray-500 mt-1">
                            Last updated: {lastUpdated.toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    <Badge
                        variant={extractionStatus === 'completed' ? 'default' :
                            extractionStatus === 'extracting' ? 'secondary' :
                                extractionStatus === 'error' ? 'destructive' : 'outline'}
                        className="flex items-center space-x-1"
                    >
                        {extractionStatus === 'completed' && <CheckCircle className="h-3 w-3" />}
                        {extractionStatus === 'extracting' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {extractionStatus === 'error' && <AlertCircle className="h-3 w-3" />}
                        <span className="capitalize">{extractionStatus}</span>
                    </Badge>
                </div>
            </div>

            {/* Graph Data */}
            <Tabs defaultValue="visualization" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="visualization">Visualization</TabsTrigger>
                    <TabsTrigger value="statistics">Statistics</TabsTrigger>
                    <TabsTrigger value="explorer">Document Explorer</TabsTrigger>
                    <TabsTrigger value="entities">Entity Dictionary</TabsTrigger>
                    <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
                    <TabsTrigger value="discovery">Auto-Discovery</TabsTrigger>
                    <TabsTrigger value="normalization">Normalization</TabsTrigger>
                    <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
                </TabsList>

                <TabsContent value="visualization">
                    {graphData ? (
                        <div className="grid grid-cols-10 gap-4">
                            {/* Left side - Canvas (8 columns) */}
                            <div className="col-span-8" data-graph-container>
                                <GraphVisualization
                                    data={graphData}
                                    onNodeClick={handleNodeClick}
                                    onEdgeClick={handleEdgeClick}
                                    onNodeSelect={handleNodeSelect}
                                    onEdgeSelect={handleEdgeSelect}
                                    height={800}
                                    width={1200}
                                />
                            </div>

                            {/* Right side - Node Types & Sizes (2 columns) */}
                            <div className="col-span-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Node Types & Sizes</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {/* Node Types */}
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Node Types</h4>
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                        <span className="text-xs">Author</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                        <span className="text-xs">Brand</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                        <span className="text-xs">Topic</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                                        <span className="text-xs">Hashtag</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                        <span className="text-xs">Influencer</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                                                        <span className="text-xs">Location</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-lime-500"></div>
                                                        <span className="text-xs">Organization</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                                                        <span className="text-xs">Product</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                                                        <span className="text-xs">Event</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Node Sizes */}
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Node Sizes</h4>
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                        <span className="text-xs">Small (Low importance)</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-4 h-4 rounded-full bg-gray-400"></div>
                                                        <span className="text-xs">Medium (Normal)</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-6 h-6 rounded-full bg-gray-400"></div>
                                                        <span className="text-xs">Large (High importance)</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-8 h-8 rounded-full bg-gray-400"></div>
                                                        <span className="text-xs">Extra Large (Very important)</span>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    Size based on confidence, engagement, verification, and mention frequency
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Node/Edge Details */}
                                {(selectedNode || selectedEdge) && (
                                    <Card className="mt-4">
                                        <CardHeader>
                                            <CardTitle className="text-lg">
                                                {selectedNode ? 'Node Details' : 'Edge Details'}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {selectedNode && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center space-x-2">
                                                        <Badge variant="outline" className="capitalize">
                                                            {selectedNode.nodeType}
                                                        </Badge>
                                                        <span className="font-medium text-sm">{selectedNode.label}</span>
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
                                                    <div className="flex flex-wrap gap-1">
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
                                                        <div className="text-xs text-gray-600">
                                                            <div className="font-medium mb-1">Properties:</div>
                                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                                {Object.entries(selectedNode.properties).map(([key, value]) => (
                                                                    <div key={key} className="flex justify-between text-xs">
                                                                        <span className="capitalize truncate">{key.replace('_', ' ')}:</span>
                                                                        <span className="truncate ml-2">{String(value)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {selectedEdge && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center space-x-2">
                                                        <Badge variant="outline" className="capitalize">
                                                            {selectedEdge.edgeType}
                                                        </Badge>
                                                        <span className="font-medium text-sm">Weight: {selectedEdge.weight}</span>
                                                    </div>
                                                    {selectedEdge.properties && Object.keys(selectedEdge.properties).length > 0 && (
                                                        <div className="text-xs text-gray-600">
                                                            <div className="font-medium mb-1">Properties:</div>
                                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                                {Object.entries(selectedEdge.properties).map(([key, value]) => (
                                                                    <div key={key} className="flex justify-between text-xs">
                                                                        <span className="capitalize truncate">{key.replace('_', ' ')}:</span>
                                                                        <span className="truncate ml-2">{String(value)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="space-y-4">
                                    <div className="text-gray-400">
                                        <Settings className="h-12 w-12 mx-auto" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                                            No Graph Data Available
                                        </h3>
                                        <p className="text-gray-600 mb-4">
                                            This dataset doesn&apos;t have any graph data yet. Start by extracting the graph from your documents.
                                        </p>
                                        <Button
                                            onClick={triggerExtraction}
                                            disabled={isExtracting}
                                            className="flex items-center space-x-2"
                                        >
                                            {isExtracting ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                            <span>Extract Graph</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="statistics">
                    {graphData ? (
                        <GraphStats data={graphData} />
                    ) : (
                        <Card>
                            <CardContent className="p-6 text-center">
                                <p className="text-gray-600">No graph data available for statistics.</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="explorer">
                    <DocumentSegmentExplorer
                        datasetId={datasetId}
                        onSegmentExtraction={(segmentId, result) => {
                            // Reload graph data when a segment is extracted
                            loadGraphData()
                            success(
                                'Segment Extraction Complete',
                                `Extracted ${result.nodesCreated || 0} nodes and ${result.edgesCreated || 0} edges from segment`
                            )
                        }}
                    />
                </TabsContent>

                <TabsContent value="entities">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Entity Dictionary</h2>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => setShowImportModal(true)}
                                    variant="outline"
                                    size="sm"
                                >
                                    Import/Export
                                </Button>
                                <Button
                                    onClick={() => setShowDuplicatesModal(true)}
                                    variant="outline"
                                    size="sm"
                                >
                                    Find Duplicates
                                </Button>
                            </div>
                        </div>
                        <EntityDictionaryManager datasetId={datasetId} />
                    </div>
                </TabsContent>

                <TabsContent value="suggestions">
                    <EntitySuggestionsPanel
                        datasetId={datasetId}
                        onSuggestionApproved={(suggestion) => {
                            success('Suggestion Approved', `Added "${suggestion.canonicalName}" to dictionary`);
                            loadGraphData(); // Refresh graph data
                        }}
                        onSuggestionRejected={(suggestion) => {
                            success('Suggestion Rejected', `Rejected "${suggestion.canonicalName}"`);
                        }}
                    />
                </TabsContent>

                <TabsContent value="discovery">
                    <EntityAutoDiscovery
                        datasetId={datasetId}
                        onDiscoveryComplete={(result) => {
                            success('Discovery Complete', `Found ${result.entities.length} entities`);
                        }}
                    />
                </TabsContent>

                <TabsContent value="normalization">
                    <EntityNormalizationPanel
                        datasetId={datasetId}
                        onNormalizationComplete={(result) => {
                            success('Normalization Complete', `Normalized ${result.normalized || 0} entities`);
                            loadGraphData(); // Refresh graph data
                        }}
                    />
                </TabsContent>

                <TabsContent value="raw-data">
                    {graphData ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Raw Graph Data</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-96 text-sm">
                                    {JSON.stringify(graphData, null, 2)}
                                </pre>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="p-6 text-center">
                                <p className="text-gray-600">No graph data available to display.</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Modals */}
            <EntityDictionaryImportModal
                datasetId={datasetId}
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportComplete={(result) => {
                    success('Import Complete', `Imported ${result.created} entities, skipped ${result.skipped}`);
                    loadGraphData(); // Refresh graph data
                }}
            />

            <DuplicateEntitiesModal
                datasetId={datasetId}
                isOpen={showDuplicatesModal}
                onClose={() => setShowDuplicatesModal(false)}
                onMergeComplete={(result) => {
                    success('Merge Complete', `Merged ${result.merged} entities`);
                    loadGraphData(); // Refresh graph data
                }}
            />

            {/* Clear Graph Data Confirmation Dialog */}
            <ConfirmationDialog
                open={showClearDialog}
                onOpenChange={setShowClearDialog}
                title="Clear Graph Data"
                description="Are you sure you want to clear all graph data for this dataset? This action cannot be undone and will permanently remove all nodes and edges."
                confirmText="Clear Data"
                cancelText="Cancel"
                onConfirm={handleClearGraphData}
                variant="destructive"
                isLoading={isClearing}
            />

        </div>
    )
}
