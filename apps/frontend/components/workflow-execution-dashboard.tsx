'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Play,
    Pause,
    Square,
    RefreshCw,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    TrendingUp,
    Activity
} from 'lucide-react';
import { WorkflowExecution } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';

interface WorkflowExecutionDashboardProps {
    workflowId?: string;
    autoRefresh?: boolean;
    refreshInterval?: number;
    maxExecutions?: number;
}

export function WorkflowExecutionDashboard({
    workflowId,
    autoRefresh = true,
    refreshInterval = 10000,
    maxExecutions = 10,
}: WorkflowExecutionDashboardProps) {
    const { success, error } = useToast();
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
            if (workflowId) {
                const history = await workflowApi.getExecutionHistory(workflowId, {
                    limit: maxExecutions,
                });
                setExecutions(history.executions);
            } else {
                // Load recent executions from all workflows
                const allExecutions: WorkflowExecution[] = [];
                // This would need to be implemented in the API
                setExecutions(allExecutions);
            }
        } catch (error) {
            console.error('Failed to load executions:', error);
            if (!refreshing) {
                error('Failed to load workflow executions');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadExecutions();
    };

    const handleCancelExecution = async (executionId: string) => {
        try {
            await workflowApi.cancelExecution(executionId, {
                reason: 'Cancelled from dashboard'
            });
            success('Workflow execution cancelled');
            loadExecutions();
        } catch (error) {
            console.error('Failed to cancel execution:', error);
            error('Failed to cancel workflow execution');
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'running':
                return <Activity className="h-4 w-4 text-blue-600 animate-pulse" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'pending':
                return <Clock className="h-4 w-4 text-yellow-600" />;
            case 'cancelled':
                return <Square className="h-4 w-4 text-gray-600" />;
            case 'paused':
                return <Pause className="h-4 w-4 text-orange-600" />;
            default:
                return <AlertCircle className="h-4 w-4 text-gray-600" />;
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
            return `${hours}h ${minutes % 60}m`;
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

    // Calculate stats
    useEffect(() => {
        const newStats = executions.reduce(
            (acc, execution) => {
                acc.total++;
                acc[execution.status as keyof typeof acc]++;
                return acc;
            },
            { total: 0, running: 0, completed: 0, failed: 0, pending: 0 }
        );
        setStats(newStats);
    }, [executions]);

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Loading executions...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-gray-600" />
                            <div>
                                <div className="text-2xl font-bold">{stats.total}</div>
                                <div className="text-sm text-gray-600">Total</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-blue-600" />
                            <div>
                                <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
                                <div className="text-sm text-gray-600">Running</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <div>
                                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                                <div className="text-sm text-gray-600">Completed</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <div>
                                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                                <div className="text-sm text-gray-600">Failed</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-600" />
                            <div>
                                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                                <div className="text-sm text-gray-600">Pending</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Executions List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Recent Executions</CardTitle>
                            <CardDescription>
                                {workflowId ? 'Executions for this workflow' : 'All recent executions'}
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
                        <div className="text-center py-8">
                            <div className="text-gray-600">No executions found</div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {executions.map((execution) => (
                                <div
                                    key={execution.id}
                                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(execution.status)}
                                            <div>
                                                <div className="font-medium">
                                                    {execution.workflow?.name || 'Unknown Workflow'}
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    {formatTimestamp(execution.startedAt || execution.createdAt)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge className={getStatusColor(execution.status)}>
                                                {execution.status}
                                            </Badge>
                                            <div className="text-sm text-gray-600">
                                                {formatDuration(execution.durationMs)}
                                            </div>
                                            {execution.status === 'running' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleCancelExecution(execution.id)}
                                                >
                                                    <Square className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {execution.progress && (
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between text-sm mb-1">
                                                <span>{execution.progress.message}</span>
                                                <span>{execution.progress.overallProgress}%</span>
                                            </div>
                                            <Progress value={execution.progress.overallProgress} className="w-full" />
                                        </div>
                                    )}

                                    {execution.error && (
                                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                                            <div className="text-sm text-red-800">{execution.error}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
