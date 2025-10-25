'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, Square, Eye } from 'lucide-react';
import { WorkflowExecution } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';

interface WorkflowExecutionMonitorProps {
    executionId: string;
    onViewDetails?: () => void;
    autoRefresh?: boolean;
    refreshInterval?: number;
}

export function WorkflowExecutionMonitor({
    executionId,
    onViewDetails,
    autoRefresh = true,
    refreshInterval = 5000,
}: WorkflowExecutionMonitorProps) {
    const { success, error } = useToast();
    const [execution, setExecution] = useState<WorkflowExecution | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (executionId) {
            loadExecution();
        }
    }, [executionId]);

    useEffect(() => {
        if (!autoRefresh || !executionId) return;

        const interval = setInterval(() => {
            if (execution?.status === 'running' || execution?.status === 'pending') {
                loadExecution();
            }
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, execution?.status, executionId]);

    const loadExecution = async () => {
        try {
            const data = await workflowApi.getExecutionStatus(executionId);
            setExecution(data);
        } catch (error) {
            console.error('Failed to load execution:', error);
            if (!refreshing) {
                error('Failed to load workflow execution');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadExecution();
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

    const formatTimestamp = (timestamp?: string) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString();
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Loading execution...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!execution) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <div className="text-lg font-medium mb-2">Execution not found</div>
                        <div className="text-gray-600">The requested workflow execution could not be found.</div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {execution.workflow?.name || 'Unknown Workflow'}
                            <Badge className={getStatusColor(execution.status)}>
                                {execution.status}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            Execution ID: {execution.id}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                        {execution.status === 'running' && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                            >
                                <Square className="h-4 w-4" />
                            </Button>
                        )}
                        {onViewDetails && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onViewDetails}
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Progress Bar */}
                    {execution.progress && (
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
                            <p className="text-sm text-gray-600 mt-2">
                                {execution.progress.message}
                            </p>
                        </div>
                    )}

                    {/* Status Information */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <div className="text-sm font-medium text-gray-600">Duration</div>
                            <div className="text-lg font-semibold">
                                {formatDuration(execution.durationMs)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-gray-600">Started</div>
                            <div className="text-sm">
                                {formatTimestamp(execution.startedAt)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-gray-600">Completed</div>
                            <div className="text-sm">
                                {formatTimestamp(execution.completedAt)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-gray-600">Progress</div>
                            <div className="text-lg font-semibold">
                                {execution.progress?.overallProgress || 0}%
                            </div>
                        </div>
                    </div>

                    {/* Error Display */}
                    {execution.error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="text-sm font-medium text-red-800 mb-1">Error:</div>
                            <div className="text-sm text-red-700">{execution.error}</div>
                        </div>
                    )}

                    {/* Node Snapshots Summary */}
                    {execution.nodeSnapshots && execution.nodeSnapshots.length > 0 && (
                        <div>
                            <div className="text-sm font-medium text-gray-600 mb-2">Node Status:</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {execution.nodeSnapshots.map((snapshot, index) => (
                                    <div
                                        key={snapshot.nodeId}
                                        className="flex items-center gap-2 p-2 bg-gray-50 rounded"
                                    >
                                        <Badge className={getStatusColor(snapshot.status)}>
                                            {snapshot.status}
                                        </Badge>
                                        <span className="text-sm truncate">{snapshot.nodeName}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
