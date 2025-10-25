'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Search, Filter, Download } from 'lucide-react';
import { WorkflowExecution } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { WorkflowExecutionDashboard } from '@/components/workflow-execution-dashboard';
import { useToast } from '@/components/ui/simple-toast';

export default function WorkflowExecutionsPage() {
    const { success, error } = useToast();
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [workflowFilter, setWorkflowFilter] = useState<string>('all');

    useEffect(() => {
        loadExecutions();
    }, []);

    const loadExecutions = async () => {
        try {
            // This would need to be implemented in the API to get all executions
            setExecutions([]);
        } catch (error) {
            console.error('Failed to load executions:', error);
            error('Failed to load workflow executions');
        } finally {
            setLoading(false);
        }
    };

    const filteredExecutions = executions.filter(execution => {
        const matchesSearch = execution.workflow?.name
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
        const matchesWorkflow = workflowFilter === 'all' || execution.workflowId === workflowFilter;

        return matchesSearch && matchesStatus && matchesWorkflow;
    });

    const handleExport = () => {
        // Implement export functionality
        success('Export functionality will be implemented');
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-lg">Loading executions...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Workflow Executions</h1>
                    <p className="text-gray-600">Monitor and manage workflow executions</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <Button variant="outline" onClick={loadExecutions}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="list">Execution List</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-4">
                    <WorkflowExecutionDashboard />
                </TabsContent>

                <TabsContent value="list" className="space-y-4">
                    {/* Filters */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                    <Input
                                        placeholder="Search executions..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="running">Running</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="Workflow" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Workflows</SelectItem>
                                        {/* Add workflow options here */}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Executions List */}
                    {filteredExecutions.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <div className="text-lg font-medium mb-2">No executions found</div>
                                <div className="text-gray-600">
                                    {searchTerm || statusFilter !== 'all' || workflowFilter !== 'all'
                                        ? 'No executions match your filters.'
                                        : 'No workflow executions have been created yet.'
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {filteredExecutions.map((execution) => (
                                <Card key={execution.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div>
                                                    <div className="font-medium">
                                                        {execution.workflow?.name || 'Unknown Workflow'}
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                        {new Date(execution.startedAt || execution.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-sm text-gray-600">
                                                    {execution.durationMs ? `${Math.round(execution.durationMs / 1000)}s` : 'N/A'}
                                                </div>
                                                <Button variant="outline" size="sm">
                                                    View Details
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
