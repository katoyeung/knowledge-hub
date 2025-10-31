'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Clock, Timer, Eye, Play, Square, RefreshCw, Activity, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [selectedExecutions, setSelectedExecutions] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Pagination state
    const [executionPage, setExecutionPage] = useState(0);
    const [executionPageSize] = useState(10); // 10 per page
    const [executionTotal, setExecutionTotal] = useState(0);

    // Expose refresh method to parent component
    useImperativeHandle(ref, () => ({
        refresh: loadExecutions,
    }));

    useEffect(() => {
        loadExecutions();
    }, [workflowId, executionPage]);

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
            const offset = executionPage * executionPageSize;
            const response = await workflowApi.getExecutionHistory(workflowId, {
                limit: executionPageSize,
                offset: offset,
            });
            // Handle both array and object response formats
            const executions = Array.isArray(response) ? response : response.executions || [];
            const total = Array.isArray(response) ? executions.length : response.total || 0;
            setExecutions(executions);
            setExecutionTotal(total);
            updateStats(executions);
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

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedExecutions(new Set(executions.map(e => e.id)));
        } else {
            setSelectedExecutions(new Set());
        }
    };

    const handleSelectExecution = (executionId: string, checked: boolean) => {
        setSelectedExecutions(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(executionId);
            } else {
                newSet.delete(executionId);
            }
            return newSet;
        });
    };

    const handleDeleteSelected = () => {
        setDeleteDialogOpen(true);
    };

    const confirmDeleteSelected = async () => {
        if (selectedExecutions.size === 0) return;

        try {
            setDeleting(true);
            const executionIds = Array.from(selectedExecutions);

            if (executionIds.length === 1) {
                await workflowApi.deleteExecution(executionIds[0]);
                success('Execution deleted successfully');
            } else {
                const result = await workflowApi.deleteExecutions(executionIds);
                success(`${result.deletedCount} executions deleted successfully`);
            }

            setSelectedExecutions(new Set());
            setDeleteDialogOpen(false);
            loadExecutions();
        } catch (error) {
            console.error('Failed to delete executions:', error);
            showError('Failed to delete executions');
        } finally {
            setDeleting(false);
        }
    };

    const isAllSelected = executions.length > 0 && selectedExecutions.size === executions.length;
    const isIndeterminate = selectedExecutions.size > 0 && selectedExecutions.size < executions.length;

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
                                {selectedExecutions.size > 0 && (
                                    <span className="ml-2 text-blue-600 font-medium">
                                        ({selectedExecutions.size} selected)
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedExecutions.size > 0 && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleDeleteSelected}
                                    disabled={deleting}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Selected
                                </Button>
                            )}
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
                                    <TableHead className="w-12">
                                        <Checkbox
                                            checked={isAllSelected}
                                            onCheckedChange={handleSelectAll}
                                            ref={(el) => {
                                                if (el) {
                                                    el.indeterminate = isIndeterminate;
                                                }
                                            }}
                                        />
                                    </TableHead>
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
                                        className={`hover:bg-gray-50 ${selectedExecutions.has(execution.id) ? 'bg-blue-50' : ''}`}
                                    >
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedExecutions.has(execution.id)}
                                                onCheckedChange={(checked) => handleSelectExecution(execution.id, checked as boolean)}
                                            />
                                        </TableCell>
                                        <TableCell
                                            className="cursor-pointer"
                                            onClick={() => handleExecutionClick(execution)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(execution.status)}
                                                <Badge className={getStatusColor(execution.status)}>
                                                    {execution.status}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell
                                            className="cursor-pointer"
                                            onClick={() => handleExecutionClick(execution)}
                                        >
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-gray-400" />
                                                <span className="text-sm">
                                                    {formatTimestamp(execution.startedAt || execution.createdAt)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell
                                            className="cursor-pointer"
                                            onClick={() => handleExecutionClick(execution)}
                                        >
                                            <div className="flex items-center gap-1">
                                                <Timer className="h-3 w-3 text-gray-400" />
                                                <span className="text-sm">
                                                    {formatDuration(execution.durationMs)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell
                                            className="cursor-pointer"
                                            onClick={() => handleExecutionClick(execution)}
                                        >
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

                    {/* Pagination Controls */}
                    {executions.length > 0 && (
                        <div className="flex items-center justify-between mt-4 px-4 pb-4">
                            <div className="text-sm text-gray-600">
                                Showing {executionPage * executionPageSize + 1} to {Math.min((executionPage + 1) * executionPageSize, executionTotal)} of {executionTotal} executions
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setExecutionPage(p => Math.max(0, p - 1))}
                                    disabled={executionPage === 0}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Previous
                                </Button>
                                <span className="text-sm text-gray-600">
                                    Page {executionPage + 1} of {Math.ceil(executionTotal / executionPageSize) || 1}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setExecutionPage(p => p + 1)}
                                    disabled={(executionPage + 1) * executionPageSize >= executionTotal}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Executions</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {selectedExecutions.size} execution{selectedExecutions.size > 1 ? 's' : ''}?
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDeleteSelected}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
});
