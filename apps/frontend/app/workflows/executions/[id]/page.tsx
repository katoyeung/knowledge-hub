'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Square, RefreshCw, Download, Eye, ExternalLink, Copy, Check, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { WorkflowExecution, NodeExecutionSnapshot } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';

export default function WorkflowExecutionPage() {
    const params = useParams();
    const router = useRouter();
    const { success, error } = useToast();
    const executionId = params.id as string;

    const [execution, setExecution] = useState<WorkflowExecution | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedData, setSelectedData] = useState<{ type: 'input' | 'output'; data: any; nodeName: string } | null>(null);
    const [selectedNode, setSelectedNode] = useState<NodeExecutionSnapshot | null>(null);
    const [copied, setCopied] = useState(false);
    const [expandedJsonPaths, setExpandedJsonPaths] = useState<Set<string>>(new Set());
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [editedRules, setEditedRules] = useState<string>('');
    const [isSavingRules, setIsSavingRules] = useState(false);

    useEffect(() => {
        if (executionId) {
            loadExecution();
        }
    }, [executionId]);

    const loadExecution = async () => {
        try {
            const data = await workflowApi.getExecutionStatus(executionId);
            setExecution(data);
        } catch (error) {
            console.error('Failed to load execution:', error);
            error('Failed to load workflow execution');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadExecution();
        setRefreshing(false);
    };

    const handleCancel = async () => {
        if (!execution) return;

        try {
            await workflowApi.cancelExecution(execution.id, {
                reason: 'Cancelled by user'
            });
            success('Workflow execution cancelled');
            loadExecution();
        } catch (error) {
            console.error('Failed to cancel execution:', error);
            error('Failed to cancel workflow execution');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'running':
                return 'bg-blue-100 text-blue-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-gray-100 text-gray-800';
            case 'paused':
                return 'bg-orange-100 text-orange-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const truncateString = (str: string, maxLength: number = 100) => {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    };

    const handleCopyToClipboard = async (data: any) => {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            await navigator.clipboard.writeText(jsonString);
            setCopied(true);
            success('Data copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            error('Failed to copy data');
        }
    };

    const openDataDrawer = (type: 'input' | 'output', data: any, nodeName: string) => {
        setSelectedData({ type, data, nodeName });
    };

    const openNodeDetails = (node: NodeExecutionSnapshot) => {
        setSelectedNode(node);
    };

    const selectNode = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        const node = execution?.nodeSnapshots?.find(n => n.nodeId === nodeId);
        if (node) {
            setSelectedNode(node);
            // Initialize edited rules when selecting a rule-based filter node
            const nodeConfig = getNodeConfiguration(nodeId);
            if (nodeConfig?.type === 'rule_based_filter') {
                setEditedRules(JSON.stringify(nodeConfig.config.rules || [], null, 2));
            }
        }
    };

    const saveRules = async () => {
        if (!execution?.workflow?.id || !selectedNodeId) return;

        try {
            setIsSavingRules(true);
            const newRules = JSON.parse(editedRules);

            // Get the current workflow configuration
            const currentWorkflow = await workflowApi.getById(execution.workflow.id);

            // Find and update the rule-based filter node
            const updatedWorkflow = {
                ...currentWorkflow,
                nodes: currentWorkflow.nodes.map(node => {
                    if (node.id === selectedNodeId && node.type === 'rule_based_filter') {
                        return {
                            ...node,
                            config: {
                                ...node.config,
                                rules: newRules
                            }
                        };
                    }
                    return node;
                })
            };

            // Update the workflow
            await workflowApi.update(execution.workflow.id, updatedWorkflow);

            // Refresh the execution to get updated data
            await loadExecution();

            success('Rules updated successfully!');
        } catch (error) {
            console.error('Error saving rules:', error);
            error('Failed to save rules. Please check the JSON format.');
        } finally {
            setIsSavingRules(false);
        }
    };

    const toggleJsonPath = (path: string) => {
        const newExpanded = new Set(expandedJsonPaths);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedJsonPaths(newExpanded);
    };

    const getNodeConfiguration = (nodeId: string) => {
        if (!execution?.workflow?.nodes) {
            return null;
        }

        const node = execution.workflow.nodes.find(node => node.id === nodeId);
        return node;
    };

    const renderInteractiveJson = (data: any, path: string = '', level: number = 0, showLimited: boolean = true) => {
        if (data === null || data === undefined) {
            return <span className="text-gray-500">null</span>;
        }

        if (typeof data === 'string') {
            return <span className="text-green-600">"{data}"</span>;
        }

        if (typeof data === 'number') {
            return <span className="text-blue-600">{data}</span>;
        }

        if (typeof data === 'boolean') {
            return <span className="text-purple-600">{data.toString()}</span>;
        }

        if (Array.isArray(data)) {
            const isExpanded = expandedJsonPaths.has(path);
            const displayData = showLimited ? limitLargeDataset(data) : data;
            const isLimited = showLimited && data.length > 10;

            return (
                <div className="inline-block">
                    <button
                        onClick={() => toggleJsonPath(path)}
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="text-gray-600">[</span>
                        <span className="text-gray-500">
                            {isLimited ? `${displayData.items?.length || displayData.length} of ${data.length} items` : `${data.length} items`}
                        </span>
                        {isLimited && <span className="text-orange-500 text-xs ml-1">(limited)</span>}
                        <span className="text-gray-600">]</span>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1">
                            {(displayData.items || displayData).map((item: any, index: number) => (
                                <div key={index} className="flex items-start gap-2">
                                    <span className="text-gray-500 text-sm">{index}:</span>
                                    <div className="flex-1">
                                        {renderInteractiveJson(item, `${path}[${index}]`, level + 1, showLimited)}
                                    </div>
                                </div>
                            ))}
                            {isLimited && (
                                <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                    Showing first 10 of {data.length} items. Use "View Full Data" to see all.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof data === 'object') {
            const isExpanded = expandedJsonPaths.has(path);
            const displayData = showLimited ? limitLargeDataset(data) : data;
            const keys = Object.keys(displayData);
            const originalKeys = Object.keys(data);
            const isLimited = showLimited && originalKeys.length !== keys.length;

            return (
                <div className="inline-block">
                    <button
                        onClick={() => toggleJsonPath(path)}
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="text-gray-600">{'{'}</span>
                        <span className="text-gray-500">
                            {isLimited ? `${keys.length} of ${originalKeys.length} properties` : `${keys.length} properties`}
                        </span>
                        {isLimited && <span className="text-orange-500 text-xs ml-1">(limited)</span>}
                        <span className="text-gray-600">{'}'}</span>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1">
                            {keys.map((key) => (
                                <div key={key} className="flex items-start gap-2">
                                    <span className="text-blue-600 text-sm">"{key}":</span>
                                    <div className="flex-1">
                                        {renderInteractiveJson(displayData[key], `${path}.${key}`, level + 1, showLimited)}
                                    </div>
                                </div>
                            ))}
                            {isLimited && (
                                <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                    Showing limited data. Use "View Full Data" to see complete dataset.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        return <span className="text-gray-500">{String(data)}</span>;
    };

    const formatTimestamp = (timestamp?: string) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString();
    };

    // Utility function to limit large datasets to 10 records
    const limitLargeDataset = (data: any, maxItems: number = 10) => {
        if (!data || typeof data !== 'object') return data;

        // If it's an array, limit to maxItems
        if (Array.isArray(data)) {
            if (data.length <= maxItems) return data;
            return {
                ...data,
                items: data.slice(0, maxItems),
                meta: {
                    ...data.meta,
                    totalCount: data.length,
                    sampleCount: maxItems,
                    hasMoreData: true,
                    lastUpdated: new Date().toISOString()
                }
            };
        }

        // If it's an object with items array, limit the items
        if (data.items && Array.isArray(data.items)) {
            if (data.items.length <= maxItems) return data;
            return {
                ...data,
                items: data.items.slice(0, maxItems),
                meta: {
                    ...data.meta,
                    totalCount: data.items.length,
                    sampleCount: maxItems,
                    hasMoreData: true,
                    lastUpdated: new Date().toISOString()
                }
            };
        }

        // If it's an object with other array properties, limit them
        const result = { ...data };
        Object.keys(result).forEach(key => {
            if (Array.isArray(result[key]) && result[key].length > maxItems) {
                result[key] = {
                    items: result[key].slice(0, maxItems),
                    meta: {
                        totalCount: result[key].length,
                        sampleCount: maxItems,
                        hasMoreData: true,
                        lastUpdated: new Date().toISOString()
                    }
                };
            }
        });

        return result;
    };

    // Export data as JSON file
    const exportDataAsJson = (data: any, filename: string) => {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            success('Data exported successfully');
        } catch (error) {
            console.error('Failed to export data:', error);
            error('Failed to export data');
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-lg">Loading execution details...</div>
                </div>
            </div>
        );
    }

    if (!execution) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="text-lg font-semibold mb-2">Execution not found</div>
                    <Button onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Go Back
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold">
                            {execution.workflow?.name || 'Unknown Workflow'}
                        </h1>
                        <Badge className={getStatusColor(execution.status)}>
                            {execution.status}
                        </Badge>
                    </div>
                    <p className="text-gray-600">
                        Execution ID: {execution.id}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    {execution.status === 'running' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                        >
                            <Square className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                {/* Overview Section */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Status</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Badge className={getStatusColor(execution.status)}>
                                    {execution.status}
                                </Badge>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Duration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatDuration(execution.durationMs)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Started</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm">
                                    {formatTimestamp(execution.startedAt)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm">
                                    {formatTimestamp(execution.completedAt)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {execution.progress && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Current Progress</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium">
                                                {execution.progress.currentNodeName || 'Processing...'}
                                            </span>
                                            <span className="text-sm text-gray-600">
                                                {execution.progress.completedNodes} / {execution.progress.totalNodes} nodes
                                            </span>
                                        </div>
                                        <Progress value={execution.progress.overallProgress} className="w-full" />
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {execution.progress.message}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {execution.error && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-red-600">Error Details</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <pre className="text-sm text-red-800 whitespace-pre-wrap">
                                        {execution.error}
                                    </pre>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Execution Flow Section */}
                {execution.nodeSnapshots && execution.nodeSnapshots.length > 0 && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Execution Flow</h2>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    Node Execution Sequence
                                </CardTitle>
                                <CardDescription>
                                    Click on any node to view detailed execution information below
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center space-x-4 overflow-x-auto pb-4">
                                    {execution.nodeSnapshots.map((snapshot, index) => (
                                        <div key={snapshot.nodeId} className="flex items-center">
                                            <div className="flex flex-col items-center">
                                                <button
                                                    onClick={() => selectNode(snapshot.nodeId)}
                                                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all hover:scale-105 cursor-pointer ${selectedNodeId === snapshot.nodeId
                                                        ? 'ring-4 ring-blue-300 ring-offset-2'
                                                        : ''
                                                        } ${snapshot.status === 'completed' ? 'bg-green-500 hover:bg-green-600' :
                                                            snapshot.status === 'running' ? 'bg-blue-500 hover:bg-blue-600' :
                                                                snapshot.status === 'failed' ? 'bg-red-500 hover:bg-red-600' :
                                                                    'bg-gray-400 hover:bg-gray-500'
                                                        }`}
                                                >
                                                    {index + 1}
                                                </button>
                                                <div className="text-xs text-center mt-2 max-w-20">
                                                    <div className="font-medium truncate">{snapshot.nodeName}</div>
                                                    <Badge className={`text-xs mt-1 ${getStatusColor(snapshot.status)}`}>
                                                        {snapshot.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                            {index < execution.nodeSnapshots.length - 1 && (
                                                <div className={`w-8 h-0.5 mx-2 ${snapshot.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                                                    }`}></div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Selected Node Details */}
                        {selectedNode && (
                            <Card className="border-2 border-blue-200 bg-blue-50/30">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${selectedNode.status === 'completed' ? 'bg-green-500' :
                                                selectedNode.status === 'running' ? 'bg-blue-500' :
                                                    selectedNode.status === 'failed' ? 'bg-red-500' :
                                                        'bg-gray-400'
                                                }`}></div>
                                            {selectedNode.nodeName} - Execution Details
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getStatusColor(selectedNode.status)}>
                                                {selectedNode.status}
                                            </Badge>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedNodeId(null)}
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Node Summary */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Node ID</div>
                                            <div className="font-medium text-sm">{selectedNode.nodeId}</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Duration</div>
                                            <div className="font-medium">{formatDuration(selectedNode.durationMs)}</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Started</div>
                                            <div className="font-medium text-sm">{formatTimestamp(selectedNode.startedAt)}</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Completed</div>
                                            <div className="font-medium text-sm">{formatTimestamp(selectedNode.completedAt)}</div>
                                        </div>
                                    </div>

                                    {/* Node Configuration & Settings */}
                                    {(getNodeConfiguration(selectedNode.nodeId) || selectedNode) && (
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-700 mb-4 flex items-center gap-2">
                                                <Settings className="h-5 w-5" />
                                                Node Settings & Configuration
                                            </h4>
                                            <div className="bg-white rounded-lg p-4 border">
                                                <div className="space-y-4">
                                                    {/* Basic Settings */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-gray-50 rounded-lg p-3">
                                                            <div className="text-sm text-gray-600">Node Type</div>
                                                            <div className="font-medium text-lg">{getNodeConfiguration(selectedNode.nodeId)?.type}</div>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-3">
                                                            <div className="text-sm text-gray-600">Enabled</div>
                                                            <div className="font-medium">
                                                                <Badge className={getNodeConfiguration(selectedNode.nodeId)?.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                                                    {getNodeConfiguration(selectedNode.nodeId)?.enabled ? 'Yes' : 'No'}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-3">
                                                            <div className="text-sm text-gray-600">Node ID</div>
                                                            <div className="font-medium text-sm font-mono">{getNodeConfiguration(selectedNode.nodeId)?.id}</div>
                                                        </div>
                                                    </div>

                                                    {/* Position Settings */}
                                                    {getNodeConfiguration(selectedNode.nodeId)?.position && (
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Position</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <div className="text-xs text-gray-600">X Position</div>
                                                                        <div className="font-medium">{getNodeConfiguration(selectedNode.nodeId)?.position?.x}px</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs text-gray-600">Y Position</div>
                                                                        <div className="font-medium">{getNodeConfiguration(selectedNode.nodeId)?.position?.y}px</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Input Sources */}
                                                    {getNodeConfiguration(selectedNode.nodeId)?.inputSources && (
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Input Sources</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                {renderInteractiveJson(getNodeConfiguration(selectedNode.nodeId)?.inputSources, 'inputSources')}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Input/Output Mappings */}
                                                    {(getNodeConfiguration(selectedNode.nodeId)?.inputMapping || getNodeConfiguration(selectedNode.nodeId)?.outputMapping) && (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {getNodeConfiguration(selectedNode.nodeId)?.inputMapping && (
                                                                <div>
                                                                    <div className="text-sm font-medium text-gray-700 mb-2">Input Mapping</div>
                                                                    <div className="bg-gray-50 rounded p-3 border">
                                                                        {renderInteractiveJson(getNodeConfiguration(selectedNode.nodeId)?.inputMapping, 'inputMapping')}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {getNodeConfiguration(selectedNode.nodeId)?.outputMapping && (
                                                                <div>
                                                                    <div className="text-sm font-medium text-gray-700 mb-2">Output Mapping</div>
                                                                    <div className="bg-gray-50 rounded p-3 border">
                                                                        {renderInteractiveJson(getNodeConfiguration(selectedNode.nodeId)?.outputMapping, 'outputMapping')}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Conditions */}
                                                    {getNodeConfiguration(selectedNode.nodeId)?.conditions && (
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Conditions</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="text-sm font-mono">{getNodeConfiguration(selectedNode.nodeId)?.conditions}</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Test Output */}
                                                    {getNodeConfiguration(selectedNode.nodeId)?.testOutput && (
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Test Output</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                {renderInteractiveJson(getNodeConfiguration(selectedNode.nodeId)?.testOutput, 'testOutput')}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Main Configuration */}
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-700 mb-2">Configuration Settings</div>
                                                        <div className="bg-gray-50 rounded p-3 border max-h-64 overflow-y-auto">
                                                            {renderInteractiveJson(getNodeConfiguration(selectedNode.nodeId)?.config, 'config')}
                                                        </div>
                                                    </div>

                                                    {/* Filtering Rules Editor for Rule-Based Filter nodes */}
                                                    {getNodeConfiguration(selectedNode.nodeId)?.type === 'rule_based_filter' && (
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                                                                <span>Filtering Rules (JSON Editor)</span>
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(editedRules);
                                                                            setCopied(true);
                                                                            setTimeout(() => setCopied(false), 2000);
                                                                        }}
                                                                    >
                                                                        {copied ? 'Copied!' : 'Copy Rules'}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={saveRules}
                                                                        disabled={isSavingRules}
                                                                    >
                                                                        {isSavingRules ? 'Saving...' : 'Save Rules'}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="mb-2 text-xs text-gray-600">
                                                                    Edit the rules array below. Each rule should have: id, name, pattern, flags, action, description, enabled
                                                                </div>
                                                                <textarea
                                                                    className="w-full h-64 p-3 font-mono text-sm bg-white border rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                                    value={editedRules}
                                                                    onChange={(e) => setEditedRules(e.target.value)}
                                                                    placeholder="Enter valid JSON array of filtering rules..."
                                                                    spellCheck={false}
                                                                />
                                                                <div className="mt-2 text-xs text-gray-500">
                                                                    <strong>Example rule:</strong>
                                                                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                                                                        {`{
  "id": "credit-card-filter",
  "name": "Credit Card Content Filter",
  "pattern": "信用卡|credit card|中銀|BOC",
  "flags": "i",
  "action": "keep",
  "description": "Keep segments containing credit card related content",
  "enabled": true
}`}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Fallback: Basic Node Information when workflow config is not available */}
                                    {!getNodeConfiguration(selectedNode.nodeId) && (
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-700 mb-4 flex items-center gap-2">
                                                <Settings className="h-5 w-5" />
                                                Node Information
                                            </h4>
                                            <div className="bg-white rounded-lg p-4 border">
                                                <div className="space-y-4">
                                                    {/* Basic Info from Node Snapshot */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="bg-gray-50 rounded-lg p-3">
                                                            <div className="text-sm text-gray-600">Node ID</div>
                                                            <div className="font-medium text-sm font-mono">{selectedNode.nodeId}</div>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-3">
                                                            <div className="text-sm text-gray-600">Node Name</div>
                                                            <div className="font-medium text-lg">{selectedNode.nodeName}</div>
                                                        </div>
                                                    </div>

                                                    {/* Execution Status */}
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-700 mb-2">Execution Status</div>
                                                        <div className="bg-gray-50 rounded p-3 border">
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <div className="text-xs text-gray-600">Status</div>
                                                                    <div className="font-medium">
                                                                        <Badge className={getStatusColor(selectedNode.status)}>
                                                                            {selectedNode.status}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs text-gray-600">Progress</div>
                                                                    <div className="font-medium">{selectedNode.progress}%</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Data Information */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Input Data Summary</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="text-sm text-gray-600 mb-2">Count: {selectedNode.inputData?.count || 0}</div>
                                                                {selectedNode.inputData?.schema && (
                                                                    <div className="text-xs text-gray-500">
                                                                        Schema: {Object.keys(selectedNode.inputData.schema).length} fields
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Output Data Summary</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="text-sm text-gray-600 mb-2">Count: {selectedNode.outputData?.count || 0}</div>
                                                                {selectedNode.outputData?.schema && (
                                                                    <div className="text-xs text-gray-500">
                                                                        Schema: {Object.keys(selectedNode.outputData.schema).length} fields
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Note about missing configuration */}
                                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                <span className="text-white text-xs">!</span>
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-yellow-800 mb-1">Configuration Not Available</div>
                                                                <div className="text-sm text-yellow-700">
                                                                    The workflow configuration data is not included in this execution response.
                                                                    Node settings and configuration details are not available.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error Display */}
                                    {selectedNode.error && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-white text-xs">!</span>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-red-800 mb-1">Execution Error</div>
                                                    <div className="text-sm text-red-700">{selectedNode.error}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Metrics Grid */}
                                    {selectedNode.metrics && Object.keys(selectedNode.metrics).length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-700 mb-4">Performance Metrics</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {Object.entries(selectedNode.metrics).map(([key, value]) => (
                                                    <div key={key} className="bg-white rounded-lg p-4 border">
                                                        <div className="text-sm text-gray-600 mb-2 capitalize">
                                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                                        </div>
                                                        <div className="text-xl font-semibold text-gray-900">
                                                            {typeof value === 'number' ?
                                                                (key.includes('Time') ? `${value}ms` :
                                                                    key.includes('Memory') ? `${Math.round(value / 1024 / 1024)}MB` :
                                                                        key.includes('Size') ? `${Math.round(value / 1024)}KB` :
                                                                            value) :
                                                                String(value)
                                                            }
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Input/Output Data */}
                                    {(selectedNode.inputData || selectedNode.outputData) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {selectedNode.inputData && (
                                                <div>
                                                    <h4 className="text-lg font-medium text-gray-700 mb-4">Input Data</h4>
                                                    <div className="bg-white rounded-lg p-4 border">
                                                        <div className="text-sm text-gray-600 mb-3">
                                                            Count: {selectedNode.inputData.count || 0}
                                                            {selectedNode.inputData.items && selectedNode.inputData.items.length > 10 && (
                                                                <span className="text-orange-600 ml-2">
                                                                    (showing first 10 of {selectedNode.inputData.items.length})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="mb-4">
                                                            <div className="text-sm text-gray-600 mb-2">Data Structure</div>
                                                            <div className="bg-gray-50 rounded p-3 border max-h-48 overflow-y-auto">
                                                                {renderInteractiveJson(selectedNode.inputData, 'inputData', 0, true)}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openDataDrawer('input', selectedNode.inputData, selectedNode.nodeName)}
                                                                className="flex-1"
                                                            >
                                                                <ExternalLink className="h-3 w-3 mr-2" />
                                                                View Full Data
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => exportDataAsJson(selectedNode.inputData, `${selectedNode.nodeName}-input-data`)}
                                                            >
                                                                <Download className="h-3 w-3 mr-2" />
                                                                Export JSON
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {selectedNode.outputData && (
                                                <div>
                                                    <h4 className="text-lg font-medium text-gray-700 mb-4">Output Data</h4>
                                                    <div className="bg-white rounded-lg p-4 border">
                                                        <div className="text-sm text-gray-600 mb-3">
                                                            Count: {selectedNode.outputData.count || 0}
                                                            {selectedNode.outputData.items && selectedNode.outputData.items.length > 10 && (
                                                                <span className="text-orange-600 ml-2">
                                                                    (showing first 10 of {selectedNode.outputData.items.length})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="mb-4">
                                                            <div className="text-sm text-gray-600 mb-2">Data Structure</div>
                                                            <div className="bg-gray-50 rounded p-3 border max-h-48 overflow-y-auto">
                                                                {renderInteractiveJson(selectedNode.outputData, 'outputData', 0, true)}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openDataDrawer('output', selectedNode.outputData, selectedNode.nodeName)}
                                                                className="flex-1"
                                                            >
                                                                <ExternalLink className="h-3 w-3 mr-2" />
                                                                View Full Data
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => exportDataAsJson(selectedNode.outputData, `${selectedNode.nodeName}-output-data`)}
                                                            >
                                                                <Download className="h-3 w-3 mr-2" />
                                                                Export JSON
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Log Messages */}
                                    {selectedNode.logMessages && selectedNode.logMessages.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-700 mb-4">Execution Logs</h4>
                                            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
                                                {selectedNode.logMessages.map((log, logIndex) => (
                                                    <div key={logIndex} className="text-sm mb-3 font-mono">
                                                        <span className="text-gray-400">
                                                            [{new Date(log.timestamp).toLocaleTimeString()}]
                                                        </span>
                                                        <span className={`ml-2 ${log.level === 'error' ? 'text-red-400' :
                                                            log.level === 'warn' ? 'text-yellow-400' :
                                                                log.level === 'info' ? 'text-blue-400' :
                                                                    'text-gray-300'
                                                            }`}>
                                                            [{log.level.toUpperCase()}]
                                                        </span>
                                                        <span className="ml-2 text-gray-100">
                                                            {log.message}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

                {/* Results Section */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900">Results</h2>
                    {execution.results ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Execution Results</CardTitle>
                                <CardDescription>
                                    Output data and results from the workflow execution
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Interactive Results Explorer</h4>
                                        <div className="bg-gray-50 rounded-lg p-4 border">
                                            <div className="text-sm text-gray-600 mb-3">
                                                Click on objects and arrays to expand/collapse them
                                            </div>
                                            <div className="bg-white rounded p-3 border max-h-64 overflow-y-auto">
                                                {renderInteractiveJson(execution.results, 'results')}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Raw Results (JSON)</h4>
                                        <div className="bg-gray-900 rounded-lg p-4">
                                            <pre className="text-sm text-gray-100 font-mono overflow-x-auto">
                                                {JSON.stringify(execution.results, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <div className="text-lg font-medium mb-2">No results available</div>
                                <div className="text-gray-600">
                                    {execution.status === 'completed'
                                        ? 'This workflow did not produce any results.'
                                        : 'Results will appear here when the workflow completes.'
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Logs Section */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900">Execution Logs</h2>
                    <Card>
                        <CardHeader>
                            <CardTitle>System Logs</CardTitle>
                            <CardDescription>
                                Detailed logs from the workflow execution
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
                                <div className="text-gray-500 mb-2">// Execution logs will appear here</div>
                                <div>Workflow execution started at {formatTimestamp(execution.startedAt)}</div>
                                {execution.progress && (
                                    <div>Current status: {execution.progress.message}</div>
                                )}
                                {execution.completedAt && (
                                    <div>Workflow execution completed at {formatTimestamp(execution.completedAt)}</div>
                                )}
                                {execution.error && (
                                    <div className="text-red-400">Error: {execution.error}</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Data Viewer Dialog */}
            <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                {selectedData?.type === 'input' ? 'Input Data' : 'Output Data'} - {selectedData?.nodeName}
                            </DialogTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => selectedData && exportDataAsJson(selectedData.data, `${selectedData.nodeName}-${selectedData.type}-data`)}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export JSON
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => selectedData && handleCopyToClipboard(selectedData.data)}
                                >
                                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                                    {copied ? 'Copied!' : 'Copy JSON'}
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="overflow-auto max-h-[60vh]">
                        {selectedData && (
                            <div className="space-y-4">
                                {/* Data Summary */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-sm text-gray-600">Data Type</div>
                                        <div className="font-medium capitalize">{selectedData.type}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-sm text-gray-600">Count</div>
                                        <div className="font-medium">{selectedData.data.count || 0}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-sm text-gray-600">Node</div>
                                        <div className="font-medium">{selectedData.nodeName}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-sm text-gray-600">Size</div>
                                        <div className="font-medium">
                                            {Math.round(JSON.stringify(selectedData.data).length / 1024)}KB
                                        </div>
                                    </div>
                                </div>

                                {/* Interactive JSON Data Display */}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-3">Interactive Data Explorer</h4>
                                    <div className="bg-gray-50 rounded-lg p-4 border">
                                        <div className="text-sm text-gray-600 mb-3">
                                            Click on objects and arrays to expand/collapse them
                                            {selectedData.data.items && selectedData.data.items.length > 10 && (
                                                <span className="text-orange-600 ml-2">
                                                    (showing first 10 of {selectedData.data.items.length} items)
                                                </span>
                                            )}
                                        </div>
                                        <div className="bg-white rounded p-3 border max-h-96 overflow-y-auto">
                                            {renderInteractiveJson(selectedData.data, 'data', 0, true)}
                                        </div>
                                    </div>
                                </div>

                                {/* Raw JSON Data Display */}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-3">Raw Data (JSON)</h4>
                                    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
                                        <pre className="text-sm text-gray-100 font-mono">
                                            {JSON.stringify(limitLargeDataset(selectedData.data), null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {/* Sample Data if available */}
                                {selectedData.data.sample && (
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Sample Data</h4>
                                        <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-64">
                                            <pre className="text-sm text-gray-800 font-mono">
                                                {JSON.stringify(selectedData.data.sample, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {/* Schema if available */}
                                {selectedData.data.schema && (
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Schema</h4>
                                        <div className="bg-blue-50 rounded-lg p-4 overflow-auto max-h-64">
                                            <pre className="text-sm text-blue-800 font-mono">
                                                {JSON.stringify(selectedData.data.schema, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}
