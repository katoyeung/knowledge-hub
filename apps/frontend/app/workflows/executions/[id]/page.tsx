'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Square, RefreshCw, Download, Eye, ExternalLink, Copy, Check, ChevronDown, ChevronRight, Settings, Loader2 } from 'lucide-react';
import { WorkflowExecution, NodeExecutionSnapshot } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';
import { useNotifications } from '@/lib/hooks/use-notifications';
// Temporary type workaround for React 19 JSX typing issues on some UI components
const ProgressAny: any = Progress as any;
const DialogContentAny: any = DialogContent as any;
const DialogTitleAny: any = DialogTitle as any;

export default function WorkflowExecutionPage() {
    const params = useParams();
    const router = useRouter();
    const { success, error: showError } = useToast();
    const executionId = params.id as string;

    // Real-time notifications
    const { getExecutionNotifications, notifications } = useNotifications();

    // Track individual node statuses for real-time updates
    const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>>({});

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
    const [collapsedSections, setCollapsedSections] = useState<{ settings: boolean; metrics: boolean }>({
        settings: true,
        metrics: true,
    });

    // Define loadExecution first so it can be used in useEffect hooks
    const loadExecution = useCallback(async () => {
        if (!executionId) return;
        try {
            const data = await workflowApi.getExecutionStatus(executionId);
            setExecution(data);
        } catch (err) {
            console.error('Failed to load execution:', err);
            showError('Failed to load workflow execution');
        } finally {
            setLoading(false);
        }
    }, [executionId]);

    // Initialize node statuses from execution node snapshots
    useEffect(() => {
        if (execution?.nodeSnapshots) {
            const initialStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'> = {};
            execution.nodeSnapshots.forEach((snapshot) => {
                initialStatuses[snapshot.nodeId] = snapshot.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
            });
            setNodeStatuses(initialStatuses);
        }
    }, [execution?.nodeSnapshots]);

    useEffect(() => {
        if (executionId) {
            loadExecution();
        }
    }, [executionId, loadExecution]);

    // Listen for real-time notification updates for this execution
    useEffect(() => {
        if (!executionId) return;

        const executionNotifications = getExecutionNotifications(executionId);

        // Process the latest notifications
        executionNotifications.forEach((notification) => {
            const data = notification.data;

            // Handle WORKFLOW_EXECUTION_COMPLETED notification
            if (notification.type === 'WORKFLOW_EXECUTION_COMPLETED') {
                // Refresh execution data to get final state
                loadExecution();
                return;
            }

            // Handle WORKFLOW_EXECUTION_FAILED notification
            if (notification.type === 'WORKFLOW_EXECUTION_FAILED') {
                // Refresh execution data to get error details
                loadExecution();
                return;
            }

            // Handle WORKFLOW_EXECUTION_UPDATE notifications
            if (notification.type === 'WORKFLOW_EXECUTION_UPDATE') {
                // Update node status if currentNodeId is provided
                if (data.currentNodeId && data.currentNodeStatus) {
                    setNodeStatuses((prev) => ({
                        ...prev,
                        [data.currentNodeId]: data.currentNodeStatus,
                    }));
                }

                // Update overall execution status if status changed
                if (data.status && execution) {
                    const newStatus = data.status as WorkflowExecution['status'];
                    if (execution.status !== newStatus) {
                        // Refresh execution data to get latest state
                        loadExecution();
                    } else if (
                        // If status is still running but progress changed, update progress
                        newStatus === 'running' &&
                        data.progress &&
                        execution.progress?.overallProgress !== data.progress.percentage
                    ) {
                        setExecution((prev) => {
                            if (!prev) return prev;
                            return {
                                ...prev,
                                progress: {
                                    ...prev.progress,
                                    currentNodeId: data.currentNodeId,
                                    currentNodeName: data.currentNode || data.currentNodeName,
                                    completedNodes: data.progress?.completedNodes || prev.progress?.completedNodes || 0,
                                    totalNodes: data.progress?.totalNodes || prev.progress?.totalNodes || 0,
                                    message: data.message || prev.progress?.message || '',
                                    overallProgress: data.progress?.percentage || prev.progress?.overallProgress || 0,
                                },
                            };
                        });
                    }
                }

                // If a new node started and we don't have it yet in snapshots, refresh to show it immediately
                if (data.currentNodeId && (!execution?.nodeSnapshots || !execution.nodeSnapshots.some(n => n.nodeId === data.currentNodeId))) {
                    loadExecution();
                }

                // Update execution if completed or failed
                if (data.status === 'completed' || data.status === 'failed') {
                    loadExecution();
                }
            }
        });
    }, [executionId, notifications, getExecutionNotifications, execution?.status, loadExecution, execution]);

    // Auto-refresh execution when it's running
    useEffect(() => {
        if (!execution || execution.status !== 'running') return;

        const interval = setInterval(() => {
            loadExecution();
        }, 3000); // Refresh every 3 seconds when running

        return () => clearInterval(interval);
    }, [execution?.status, executionId, loadExecution, execution]);

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
        } catch (err) {
            console.error('Failed to cancel execution:', err);
            showError('Failed to cancel workflow execution');
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

    // Calculate duration from timestamps
    const calculateDuration = (execution: WorkflowExecution | null): number | undefined => {
        if (!execution) return undefined;

        // If durationMs is already provided, use it
        if (execution.durationMs) return execution.durationMs;

        // Calculate from timestamps
        if (execution.startedAt) {
            const startTime = new Date(execution.startedAt).getTime();
            const endTime = execution.completedAt
                ? new Date(execution.completedAt).getTime()
                : execution.status === 'running'
                    ? Date.now() // Use current time for running executions
                    : undefined;

            if (endTime !== undefined) {
                return endTime - startTime;
            }
        }

        return undefined;
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
            showError('Failed to copy data');
        }
    };

    const openDataDrawer = (type: 'input' | 'output', data: any, nodeName: string) => {
        setSelectedData({ type, data, nodeName });
    };

    const openNodeDetails = (node: NodeExecutionSnapshot) => {
        setSelectedNode(node);
    };

    const selectNode = async (nodeId: string) => {
        setSelectedNodeId(nodeId);

        try {
            // Fetch full node details including large output data
            const fullNodeDetails = await workflowApi.getNodeSnapshot(executionId, nodeId);
            setSelectedNode(fullNodeDetails);

            // Initialize edited rules when selecting a rule-based filter node
            const nodeConfig = getNodeConfiguration(nodeId);
            if (nodeConfig?.type === 'rule_based_filter') {
                setEditedRules(JSON.stringify(nodeConfig.config.rules || [], null, 2));
            }
            // Auto-expand JSON paths for input/output data
            const newExpanded = new Set(expandedJsonPaths);
            newExpanded.add('inputData');
            newExpanded.add('outputData');
            setExpandedJsonPaths(newExpanded);
        } catch (err) {
            console.error('Failed to load node details:', err);
            // Fallbacks: use existing snapshot if present, else construct a pending placeholder from workflow graph so it is clickable immediately
            const node = execution?.nodeSnapshots?.find(n => n.nodeId === nodeId);
            if (node) {
                setSelectedNode(node);
                return;
            }
            const wfNode = execution?.workflow?.nodes?.find(n => n.id === nodeId);
            const status = nodeStatuses[nodeId] || 'pending';
            if (wfNode) {
                setSelectedNode({
                    nodeId,
                    nodeName: wfNode.name || nodeId,
                    timestamp: new Date() as any,
                    status: status as any,
                    inputData: [] as any,
                    outputData: [] as any,
                    metrics: { processingTime: 0, memoryUsage: 0, cpuUsage: 0, dataSize: 0 } as any,
                    progress: status === 'completed' ? 100 : 0,
                } as any);
                return;
            }
            // Defer error toast; placeholder view is shown instead
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
        } catch (err) {
            console.error('Error saving rules:', err);
            showError('Failed to save rules. Please check the JSON format.');
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

    // Utility: get count without changing the data shape; supports arrays, {hits: []}, or {count}
    const getCount = (data: any): number => {
        if (Array.isArray(data)) return data.length;
        if (data && typeof data === 'object') {
            if (Array.isArray((data as any).hits)) return (data as any).hits.length;
            if (typeof (data as any).count === 'number') return (data as any).count as number;
        }
        return 0;
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
            return (
                <div className="inline-block">
                    <button
                        onClick={() => toggleJsonPath(path)}
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="text-gray-600">[</span>
                        <span className="text-gray-500">{`${data.length} items`}</span>
                        <span className="text-gray-600">]</span>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1">
                            {data.map((item: any, index: number) => (
                                <div key={index} className="flex items-start gap-2">
                                    <span className="text-gray-500 text-sm">{index}:</span>
                                    <div className="flex-1">
                                        {renderInteractiveJson(item, `${path}[${index}]`, level + 1, showLimited)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof data === 'object') {
            const isExpanded = expandedJsonPaths.has(path);
            const displayData = data;
            const keys = Object.keys(displayData);
            const originalKeys = Object.keys(data);
            const isLimited = false;

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

                        </div>
                    )}
                </div>
            );
        }

        return <span className="text-gray-500">{String(data)}</span>;
    };

    const formatTimestamp = (timestamp?: string | Date) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleString();
        } catch {
            return 'N/A';
        }
    };

    // Note: Do not manipulate input/output/result data; always display raw server response

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
        } catch (err) {
            console.error('Failed to export data:', err);
            showError('Failed to export data');
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

    // Build a complete sequence from workflow nodes, overlaying snapshots and notification statuses
    const mergedSnapshots: NodeExecutionSnapshot[] = (() => {
        const snapshots = execution.nodeSnapshots || [];
        const byId = new Map<string, NodeExecutionSnapshot>();
        snapshots.forEach(s => byId.set(s.nodeId, s));

        const workflowNodes = execution.workflow?.nodes || [];
        if (workflowNodes.length > 0) {
            return workflowNodes.map((n) => {
                const snap = byId.get(n.id);
                if (snap) {
                    // Overlay real-time status if present
                    const rt = nodeStatuses[n.id];
                    return rt ? { ...snap, status: rt as any } : snap;
                }
                const rt = nodeStatuses[n.id] || 'pending';
                return {
                    nodeId: n.id,
                    nodeName: n.name || n.id,
                    timestamp: new Date() as any,
                    status: rt as any,
                    inputData: [] as any,
                    outputData: [] as any,
                    metrics: { processingTime: 0, memoryUsage: 0, cpuUsage: 0, dataSize: 0 },
                    progress: rt === 'completed' ? 100 : 0,
                } as any;
            });
        }

        // Fallback to previous behavior if workflow.nodes not available
        const seenIds = new Set(snapshots.map(s => s.nodeId));
        const extras: NodeExecutionSnapshot[] = [] as any;
        Object.entries(nodeStatuses).forEach(([nodeId, status]) => {
            if (!seenIds.has(nodeId)) {
                extras.push({
                    nodeId,
                    nodeName: nodeId,
                    timestamp: new Date() as any,
                    status: status as any,
                    inputData: [] as any,
                    outputData: [] as any,
                    metrics: { processingTime: 0, memoryUsage: 0, cpuUsage: 0, dataSize: 0 },
                    progress: status === 'completed' ? 100 : 0,
                } as any);
            }
        });
        return [...snapshots, ...extras];
    })();

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
                                    {formatDuration(calculateDuration(execution))}
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
                                        <ProgressAny value={execution.progress.overallProgress} className="w-full" />
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
                {(mergedSnapshots && mergedSnapshots.length > 0) || execution.status === 'running' ? (
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
                                <div className="flex items-start space-x-4 overflow-x-auto pb-6 pt-4 min-h-[200px]">
                                    {(mergedSnapshots || []).map((snapshot, index) => {
                                        // Use real-time status from nodeStatuses if available, otherwise fall back to snapshot status
                                        const realTimeStatus = nodeStatuses[snapshot.nodeId] || snapshot.status;
                                        const displayStatus = (realTimeStatus === 'skipped' || realTimeStatus === 'pending') ? 'pending' : realTimeStatus;
                                        const isClickable = displayStatus !== 'pending';
                                        return (
                                            <div key={snapshot.nodeId} className="flex items-start">
                                                <div className="flex flex-col items-center min-w-[80px]">
                                                    <button
                                                        onClick={isClickable ? () => selectNode(snapshot.nodeId).catch(console.error) : undefined}
                                                        disabled={!isClickable}
                                                        className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all ${isClickable ? 'hover:scale-105 cursor-pointer' : 'cursor-default'} flex-shrink-0 ${selectedNodeId === snapshot.nodeId
                                                            ? 'ring-4 ring-blue-300 ring-offset-2'
                                                            : ''
                                                            } ${displayStatus === 'completed' ? 'bg-green-500 hover:bg-green-600' :
                                                                displayStatus === 'running' ? 'bg-blue-500 hover:bg-blue-600 animate-pulse' :
                                                                    displayStatus === 'failed' ? 'bg-red-500 hover:bg-red-600' :
                                                                        'bg-gray-400 hover:bg-gray-500'
                                                            }`}
                                                    >
                                                        {displayStatus === 'running' ? (
                                                            <Loader2 className="h-5 w-5 animate-spin" />
                                                        ) : (
                                                            index + 1
                                                        )}
                                                    </button>
                                                    <div className="text-xs text-center mt-3 w-full px-1">
                                                        <div className="font-medium break-words leading-tight mb-1">{snapshot.nodeName}</div>
                                                        <Badge className={`text-xs ${getStatusColor(displayStatus)}`}>
                                                            {displayStatus}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                {mergedSnapshots && index < mergedSnapshots.length - 1 && (
                                                    <div className={`w-8 h-0.5 mx-2 mt-6 ${displayStatus === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                                                        }`}></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {(!mergedSnapshots || mergedSnapshots.length === 0) && execution.status === 'running' && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Awaiting node snapshots...
                                        </div>
                                    )}
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
                                            <div className="font-medium">{formatDuration((selectedNode as any).durationMs)}</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Started</div>
                                            <div className="font-medium text-sm">{formatTimestamp((selectedNode as any).startedAt)}</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 border">
                                            <div className="text-sm text-gray-600">Completed</div>
                                            <div className="font-medium text-sm">{formatTimestamp((selectedNode as any).completedAt)}</div>
                                        </div>
                                    </div>


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
                                                                <div className="text-sm text-gray-600 mb-2">Count: {getCount(selectedNode.inputData)}</div>
                                                                {!Array.isArray(selectedNode.inputData) && selectedNode.inputData?.schema && (
                                                                    <div className="text-xs text-gray-500">
                                                                        Schema: {Object.keys(selectedNode.inputData.schema).length} fields
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">Output Data Summary</div>
                                                            <div className="bg-gray-50 rounded p-3 border">
                                                                <div className="text-sm text-gray-600 mb-2">Count: {getCount(selectedNode.outputData)}</div>
                                                                {!Array.isArray(selectedNode.outputData) && selectedNode.outputData?.schema && (
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


                                    {/* Input/Output Data */}
                                    {(selectedNode.inputData || selectedNode.outputData) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {selectedNode.inputData && (
                                                <div>
                                                    <h4 className="text-lg font-medium text-gray-700 mb-4">Input Data</h4>
                                                    <div className="bg-white rounded-lg p-4 border">
                                                        {(selectedNode.inputData.count && selectedNode.inputData.count > 0) && (
                                                            <div className="text-sm text-gray-600 mb-3">
                                                                Count: {Array.isArray(selectedNode.inputData) ? selectedNode.inputData.length : selectedNode.inputData.count}
                                                            </div>
                                                        )}
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
                                                        {(selectedNode.outputData.count && selectedNode.outputData.count > 0) && (
                                                            <div className="text-sm text-gray-600 mb-3">
                                                                Count: {Array.isArray(selectedNode.outputData) ? selectedNode.outputData.length : selectedNode.outputData.count}
                                                            </div>
                                                        )}
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

                                    {/* Node Configuration & Settings */}
                                    {(getNodeConfiguration(selectedNode.nodeId) || selectedNode) && (
                                        <div>
                                            <button
                                                onClick={() => setCollapsedSections(prev => ({ ...prev, settings: !prev.settings }))}
                                                className="w-full flex items-center justify-between text-lg font-medium text-gray-700 mb-4 hover:text-gray-900 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Settings className="h-5 w-5" />
                                                    Node Settings & Configuration
                                                </div>
                                                {collapsedSections.settings ? (
                                                    <ChevronRight className="h-5 w-5" />
                                                ) : (
                                                    <ChevronDown className="h-5 w-5" />
                                                )}
                                            </button>
                                            {!collapsedSections.settings && (
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
                                            )}
                                        </div>
                                    )}

                                    {/* Metrics Grid */}
                                    {selectedNode.metrics && Object.keys(selectedNode.metrics).length > 0 && (
                                        <div>
                                            <button
                                                onClick={() => setCollapsedSections(prev => ({ ...prev, metrics: !prev.metrics }))}
                                                className="w-full flex items-center justify-between text-lg font-medium text-gray-700 mb-4 hover:text-gray-900 transition-colors"
                                            >
                                                <span>Performance Metrics</span>
                                                {collapsedSections.metrics ? (
                                                    <ChevronRight className="h-5 w-5" />
                                                ) : (
                                                    <ChevronDown className="h-5 w-5" />
                                                )}
                                            </button>
                                            {!collapsedSections.metrics && (
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
                                            )}
                                        </div>
                                    )}

                                    {/* Log Messages */}
                                    {(selectedNode as any).logMessages && (selectedNode as any).logMessages.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-700 mb-4">Execution Logs</h4>
                                            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
                                                {(selectedNode as any).logMessages.map((log: any, logIndex: number) => (
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
                ) : null}

                {/* Results Section (only show if results exist) */}
                {execution.results && (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-gray-900">Results</h2>
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
                    </div>
                )}

                {/* Logs Section (only show if there is something meaningful) */}
                {((execution.progress && execution.progress.message) || execution.error || (execution as any).logs?.length) && (
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
                                    {execution.startedAt && (
                                        <div>Workflow execution started at {formatTimestamp(execution.startedAt)}</div>
                                    )}
                                    {execution.progress?.message && (
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
                )}
            </div>

            {/* Data Viewer Dialog */}
            <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
                <DialogContentAny className="max-w-4xl max-h-[80vh] overflow-hidden">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitleAny className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                {selectedData?.type === 'input' ? 'Input Data' : 'Output Data'} - {selectedData?.nodeName}
                            </DialogTitleAny>
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
                                        <div className="font-medium">{getCount(selectedData.data)}</div>
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
                                        <div className="text-sm text-gray-600 mb-3">Click on objects and arrays to expand/collapse them</div>
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
                                            {JSON.stringify(selectedData.data, null, 2)}
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
                </DialogContentAny>
            </Dialog>

        </div>
    );
}
