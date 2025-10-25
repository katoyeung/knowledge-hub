'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Clock, Timer, Eye, Play, Pause, Square, RefreshCw, Activity } from 'lucide-react';
import { WorkflowExecution, NodeExecutionSnapshot } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';

export interface WorkflowExecutionListProps {
    workflowId: string;
    onExecutionSelect?: (execution: WorkflowExecution) => void;
    onNodeSnapshotSelect?: (executionId: string, nodeId: string) => void;
    autoRefresh?: boolean;
    refreshInterval?: number;
}

export interface WorkflowExecutionListRef {
    refresh: () => void;
}

export const WorkflowExecutionList = forwardRef<WorkflowExecutionListRef, WorkflowExecutionListProps>(({
    workflowId,
    onExecutionSelect,
    onNodeSnapshotSelect,
    autoRefresh = true,
    refreshInterval = 10000,
}, ref) => {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        total: 0,
        running: 0,
        completed: 0,
        failed: 0,
        pending: 0,
    });

    // Expose refresh method to parent component
    useImperativeHandle(ref, () => ({
        refresh: loadExecutions,
    }));

    useEffect(() => {
        loadExecutions();
    }, [workflowId]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            loadExecutions();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, workflowId]);

    const loadExecutions = async () => {
        try {
            setRefreshing(true);
            const data = await workflowApi.getExecutionHistory(workflowId, { limit: 50 });
            setExecutions(data);
            updateStats(data);
        } catch (error) {
            console.error('Failed to load executions:', error);
            if (!refreshing) {
                showError('Failed to load workflow executions');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const updateStats = (executions: WorkflowExecution[]) => {
        const stats = {
            total: executions.length,
            running: executions.filter(e => e.status === 'running').length,
            completed: executions.filter(e => e.status === 'completed').length,
            failed: executions.filter(e => e.status === 'failed').length,
            pending: executions.filter(e => e.status === 'pending').length,
        };
        setStats(stats);
    };

    const handleRefresh = async () => {
        await loadExecutions();
    };

    const handleCancel = async (execution: WorkflowExecution) => {
        try {
            await workflowApi.cancelExecution(execution.id, {
                reason: 'Cancelled by user'
            });
            success('Workflow execution cancelled');
            loadExecutions();
        } catch (error) {
            console.error('Failed to cancel execution:', error);
            showError('Failed to cancel workflow execution');
        }
    };

    const handleExecutionClick = (execution: WorkflowExecution) => {
        // Navigate to execution details page
        router.push(`/workflows/executions/${execution.id}`);
        onExecutionSelect?.(execution);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running':
                return <Play className="h-4 w-4 text-blue-500" />;
            case 'completed':
                return <Activity className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <Square className="h-4 w-4 text-red-500" />;
            case 'pending':
                return <Clock className="h-4 w-4 text-yellow-500" />;
            default:
                return <Clock className="h-4 w-4 text-gray-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running':
                return 'bg-blue-100 text-blue-800';
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatTimestamp = (timestamp: string | Date) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const formatDuration = (durationMs?: number) => {
        if (!durationMs) return 'N/A';
        const seconds = Math.floor(durationMs / 1000);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                        <div className="text-sm text-gray-500">Total</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                        <div className="text-sm text-gray-500">Pending</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
                        <div className="text-sm text-gray-500">Running</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                        <div className="text-sm text-gray-500">Completed</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                        <div className="text-sm text-gray-500">Failed</div>
                    </CardContent>
                </Card>
            </div>

            {/* Executions Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Workflow Executions</CardTitle>
                            <CardDescription>
                                Recent workflow execution history and status
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {executions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No workflow executions found
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Started</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Progress</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {executions.map((execution) => (
                                    <TableRow
                                        key={execution.id}
                                        className="cursor-pointer hover:bg-gray-50"
                                        onClick={() => handleExecutionClick(execution)}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(execution.status)}
                                                <Badge className={getStatusColor(execution.status)}>
                                                    {execution.status}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-gray-400" />
                                                <span className="text-sm">
                                                    {formatTimestamp(execution.startedAt || execution.createdAt)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Timer className="h-3 w-3 text-gray-400" />
                                                <span className="text-sm">
                                                    {formatDuration(execution.durationMs)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {execution.progress ? (
                                                <div className="w-24">
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span>{execution.progress.overallProgress}%</span>
                                                    </div>
                                                    <Progress value={execution.progress.overallProgress} className="h-2" />
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-500">N/A</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleExecutionClick(execution);
                                                    }}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                {execution.status === 'running' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCancel(execution);
                                                        }}
                                                    >
                                                        <Square className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
});
