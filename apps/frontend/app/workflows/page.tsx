'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Play, Settings, History, Trash2, Edit, Copy, MoreVertical } from 'lucide-react';
import { Workflow, WorkflowExecution, WorkflowExecutionInput } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { useToast } from '@/components/ui/simple-toast';
import { WorkflowExecutionModal } from '@/components/workflow-execution-modal';

export default function WorkflowsPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('workflows');

    // Execution modal state
    const [executionModal, setExecutionModal] = useState<{
        workflow: Workflow | null;
        isOpen: boolean;
    }>({
        workflow: null,
        isOpen: false,
    });

    // Dropdown state for each workflow
    const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
    const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);

    // Multiple selection state
    const [selectedWorkflows, setSelectedWorkflows] = useState<Set<string>>(new Set());
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

    useEffect(() => {
        loadWorkflows();
    }, []);

    useEffect(() => {
        if (workflows.length > 0) {
            loadRecentExecutions();
        }
    }, [workflows]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            const isClickInsideDropdown = Array.from(dropdownRefs.current.values()).some(ref =>
                ref && ref.contains(target)
            );

            if (!isClickInsideDropdown) {
                setOpenDropdowns(new Set());
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const loadWorkflows = async () => {
        try {
            const data = await workflowApi.getAll();
            setWorkflows(data);
        } catch (error: any) {
            console.error('Failed to load workflows:', error);
            showError('Failed to load workflows');
        } finally {
            setLoading(false);
        }
    };

    const loadRecentExecutions = async () => {
        try {
            // Load recent executions from all workflows
            const allExecutions: WorkflowExecution[] = [];
            for (const workflow of workflows) {
                const history = await workflowApi.getExecutionHistory(workflow.id, { limit: 5 });
                allExecutions.push(...history.executions);
            }
            setExecutions(allExecutions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (error: any) {
            console.error('Failed to load executions:', error);
        }
    };

    const handleCreateWorkflow = async () => {
        try {
            const newWorkflow = await workflowApi.create({
                name: 'my workflow',
                description: 'this is my workflow',
                nodes: [],
                edges: [],
                settings: {
                    errorHandling: 'stop',
                    maxRetries: 3,
                    parallelExecution: false,
                    notifyOnCompletion: true,
                    notifyOnFailure: true,
                },
            });
            router.push(`/workflows/${newWorkflow.id}/canvas`);
        } catch (error: any) {
            console.error('Failed to create workflow:', error);
            const errorMessage = error?.response?.data?.message ||
                error?.message ||
                'Failed to create workflow. Please check if the backend is running.';
            showError(errorMessage);
        }
    };


    const handleViewWorkflow = (workflowId: string) => {
        router.push(`/workflows/${workflowId}/canvas`);
    };

    const handleDuplicateWorkflow = async (workflowId: string) => {
        try {
            await workflowApi.duplicate(workflowId);
            success('Workflow duplicated successfully');
            loadWorkflows();
        } catch (error: any) {
            console.error('Failed to duplicate workflow:', error);
            const errorMessage = error?.response?.data?.message ||
                error?.message ||
                'Failed to duplicate workflow. Please check if the backend is running.';
            showError(errorMessage);
        }
    };

    const toggleDropdown = (workflowId: string) => {
        setOpenDropdowns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(workflowId)) {
                newSet.delete(workflowId);
            } else {
                newSet.add(workflowId);
            }
            return newSet;
        });
    };

    const closeDropdown = (workflowId: string) => {
        setOpenDropdowns(prev => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
        });
    };

    const handleExecuteWorkflow = (workflow: Workflow) => {
        setExecutionModal({
            workflow,
            isOpen: true,
        });
    };

    const handleExecuteWithInput = async (inputData: WorkflowExecutionInput) => {
        if (!executionModal.workflow) return;

        try {
            const response = await workflowApi.execute({
                workflowId: executionModal.workflow.id,
                ...inputData,
            });
            success(`Workflow execution started: ${response.executionId}`);
            loadRecentExecutions();
        } catch (error: any) {
            console.error('Failed to execute workflow:', error);
            showError('Failed to execute workflow');
        }
    };

    const handleDeleteWorkflow = (workflow: Workflow) => {
        setWorkflowToDelete(workflow);
        setDeleteDialogOpen(true);
    };

    const confirmDeleteWorkflow = async () => {
        if (!workflowToDelete) return;

        try {
            await workflowApi.delete(workflowToDelete.id);
            success('Workflow deleted successfully');
            loadWorkflows();
            setDeleteDialogOpen(false);
            setWorkflowToDelete(null);
        } catch (error: any) {
            console.error('Failed to delete workflow:', error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete workflow';
            showError(errorMessage);
        }
    };

    // Multiple selection handlers
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedWorkflows(new Set(filteredWorkflows.map(w => w.id)));
        } else {
            setSelectedWorkflows(new Set());
        }
    };

    const handleSelectWorkflow = (workflowId: string, checked: boolean) => {
        setSelectedWorkflows(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(workflowId);
            } else {
                newSet.delete(workflowId);
            }
            return newSet;
        });
    };

    const handleBulkDelete = () => {
        if (selectedWorkflows.size === 0) return;
        setBulkDeleteDialogOpen(true);
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedWorkflows).map(workflowId =>
                workflowApi.delete(workflowId)
            );
            await Promise.all(deletePromises);
            success(`${selectedWorkflows.size} workflows deleted successfully`);
            setSelectedWorkflows(new Set());
            setBulkDeleteDialogOpen(false);
            loadWorkflows();
        } catch (error: any) {
            console.error('Failed to delete workflows:', error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete workflows';
            showError(errorMessage);
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
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const filteredWorkflows = workflows.filter(workflow =>
        workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        workflow.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-lg">Loading workflows...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Workflows</h1>
                    <p className="text-gray-600">Manage and execute your data processing workflows</p>
                </div>
                <Button onClick={handleCreateWorkflow} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Workflow
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="workflows">Workflows</TabsTrigger>
                    <TabsTrigger value="executions">Recent Executions</TabsTrigger>
                </TabsList>

                <TabsContent value="workflows" className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                                placeholder="Search workflows..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {selectedWorkflows.size > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">
                                    {selectedWorkflows.size} selected
                                </span>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleBulkDelete}
                                    className="flex items-center gap-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Selected
                                </Button>
                            </div>
                        )}
                    </div>

                    {filteredWorkflows.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Settings className="h-12 w-12 text-gray-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No workflows found</h3>
                                <p className="text-gray-600 mb-4">
                                    {searchTerm ? 'No workflows match your search.' : 'Create your first workflow to get started.'}
                                </p>
                                {!searchTerm && (
                                    <Button onClick={handleCreateWorkflow} className="flex items-center gap-2">
                                        <Plus className="h-4 w-4" />
                                        Create Workflow
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedWorkflows.size === filteredWorkflows.length && filteredWorkflows.length > 0}
                                                onCheckedChange={handleSelectAll}
                                                aria-label="Select all workflows"
                                            />
                                        </TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Nodes</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="w-12">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredWorkflows.map((workflow) => (
                                        <TableRow
                                            key={workflow.id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => handleViewWorkflow(workflow.id)}
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={selectedWorkflows.has(workflow.id)}
                                                    onCheckedChange={(checked) => handleSelectWorkflow(workflow.id, checked as boolean)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium">{workflow.name}</div>
                                                    {workflow.isTemplate && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Template
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm text-gray-600 max-w-xs truncate">
                                                    {workflow.description || 'No description'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={workflow.isActive ? 'default' : 'secondary'}
                                                    className="text-xs"
                                                >
                                                    {workflow.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm text-gray-600">
                                                    {workflow.nodes.length} nodes, {workflow.edges.length} edges
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm text-gray-600">
                                                    {new Date(workflow.createdAt).toLocaleDateString()}
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <div className="relative">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => toggleDropdown(workflow.id)}
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                    {openDropdowns.has(workflow.id) && (
                                                        <div
                                                            ref={(el) => {
                                                                if (el) {
                                                                    dropdownRefs.current.set(workflow.id, el);
                                                                }
                                                            }}
                                                            className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                                                        >
                                                            <div className="py-1">
                                                                <div
                                                                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleViewWorkflow(workflow.id);
                                                                        closeDropdown(workflow.id);
                                                                    }}
                                                                >
                                                                    <Edit className="h-4 w-4 mr-2 inline" />
                                                                    View/Edit
                                                                </div>
                                                                <div
                                                                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleExecuteWorkflow(workflow);
                                                                        closeDropdown(workflow.id);
                                                                    }}
                                                                >
                                                                    <Play className="h-4 w-4 mr-2 inline" />
                                                                    Execute
                                                                </div>
                                                                <div
                                                                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDuplicateWorkflow(workflow.id);
                                                                        closeDropdown(workflow.id);
                                                                    }}
                                                                >
                                                                    <Copy className="h-4 w-4 mr-2 inline" />
                                                                    Duplicate
                                                                </div>
                                                                <div
                                                                    className="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 hover:text-red-700 cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteWorkflow(workflow);
                                                                        closeDropdown(workflow.id);
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-4 w-4 mr-2 inline" />
                                                                    Delete
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="executions" className="space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                        <History className="h-5 w-5" />
                        <h2 className="text-xl font-semibold">Recent Executions</h2>
                    </div>

                    {executions.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <History className="h-12 w-12 text-gray-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No executions yet</h3>
                                <p className="text-gray-600">Execute a workflow to see execution history here.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {executions.map((execution) => (
                                <Card key={execution.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold">
                                                        {execution.workflow?.name || 'Unknown Workflow'}
                                                    </h3>
                                                    <Badge className={getStatusColor(execution.status)}>
                                                        {execution.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-gray-600">
                                                    Started: {new Date(execution.startedAt || execution.createdAt).toLocaleString()}
                                                </p>
                                                {execution.progress && (
                                                    <div className="mt-2">
                                                        <div className="flex items-center justify-between text-sm mb-1">
                                                            <span>{execution.progress.message}</span>
                                                            <span>{execution.progress.overallProgress}%</span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                                style={{ width: `${execution.progress.overallProgress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {execution.durationMs && (
                                                    <span className="text-sm text-gray-500">
                                                        {Math.round(execution.durationMs / 1000)}s
                                                    </span>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => router.push(`/workflows/executions/${execution.id}`)}
                                                >
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

            {/* Workflow Execution Modal */}
            <WorkflowExecutionModal
                workflow={executionModal.workflow}
                isOpen={executionModal.isOpen}
                onClose={() => setExecutionModal({ workflow: null, isOpen: false })}
                onExecute={handleExecuteWithInput}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Workflow</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &quot;{workflowToDelete?.name}&quot;? This action cannot be undone and will also delete all associated executions.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDeleteWorkflow}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Delete Confirmation Dialog */}
            <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Multiple Workflows</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {selectedWorkflows.size} workflow{selectedWorkflows.size > 1 ? 's' : ''}? This action cannot be undone and will also delete all associated executions.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setBulkDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmBulkDelete}
                        >
                            Delete {selectedWorkflows.size} Workflow{selectedWorkflows.size > 1 ? 's' : ''}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
