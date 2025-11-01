'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Play, Settings, Plus, Trash2, Edit2, Zap, Database, Search, FileText, X } from 'lucide-react';
import { Workflow, WorkflowNode, PipelineStep } from '@/lib/api/workflow';
import { workflowApi } from '@/lib/api/workflow';
import { WorkflowNodeConfig } from '@/components/workflow-node-config';
import { WorkflowExecutionList, WorkflowExecutionListRef } from '@/components/workflow-execution-list';
import { useToast } from '@/components/ui/simple-toast';

export default function WorkflowCanvasPage() {
    const params = useParams();
    const router = useRouter();
    const { success, error } = useToast();
    const workflowId = params.id as string;
    const [activeTab, setActiveTab] = useState('nodes');
    const executionsListRef = useRef<WorkflowExecutionListRef>(null);

    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [availableSteps, setAvailableSteps] = useState<PipelineStep[]>([]);
    const [filteredSteps, setFilteredSteps] = useState<PipelineStep[]>([]);
    const [stepSearchTerm, setStepSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
    const [isNodeConfigOpen, setIsNodeConfigOpen] = useState(false);

    // Inline editing state
    const [editingName, setEditingName] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);
    const [tempName, setTempName] = useState('');
    const [tempDescription, setTempDescription] = useState('');

    // Drag-and-drop state
    const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [draggedStepType, setDraggedStepType] = useState<string | null>(null);

    // Auto-save debounce
    const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const nameDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const descriptionDebounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (workflowId) {
            loadWorkflow();
            loadAvailableSteps();
        }
    }, [workflowId]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
            if (nameDebounceRef.current) {
                clearTimeout(nameDebounceRef.current);
            }
            if (descriptionDebounceRef.current) {
                clearTimeout(descriptionDebounceRef.current);
            }
        };
    }, []);

    const loadWorkflow = async () => {
        try {
            const data = await workflowApi.getById(workflowId);

            // Remove manual trigger nodes and ensure schedule trigger is first if it exists
            const nodes = data.nodes || [];
            const scheduleTriggerNode = nodes.find(n => n.type === 'trigger_schedule');
            const otherNodes = nodes.filter(n => n.type !== 'trigger_schedule' && n.type !== 'trigger_manual');

            // If schedule trigger exists, ensure it's first
            let finalNodes: WorkflowNode[];
            let needsUpdate = false;

            if (scheduleTriggerNode) {
                finalNodes = [scheduleTriggerNode, ...otherNodes];
                // Check if schedule trigger is not first (needs reordering)
                if (nodes[0]?.id !== scheduleTriggerNode.id) {
                    needsUpdate = true;
                }
            } else {
                // No schedule trigger - keep nodes as is (just remove manual triggers)
                finalNodes = otherNodes;
                if (nodes.length !== otherNodes.length) {
                    needsUpdate = true; // Manual triggers were removed
                }
            }

            // Update workflow if changes were made
            if (needsUpdate) {
                const updatedWorkflow = { ...data, nodes: finalNodes };
                try {
                    await workflowApi.update(workflowId, updatedWorkflow);
                    setWorkflow(updatedWorkflow);
                } catch (updateErr) {
                    console.error('Failed to auto-update workflow:', updateErr);
                    // Still set workflow even if update fails
                    setWorkflow(updatedWorkflow);
                }
            } else {
                setWorkflow({ ...data, nodes: finalNodes });
            }

            setTempName(data.name);
            setTempDescription(data.description || '');
        } catch (err) {
            console.error('Failed to load workflow:', err);
            error('Failed to load workflow');
        } finally {
            setLoading(false);
        }
    };

    const loadAvailableSteps = async (): Promise<void> => {
        try {
            const steps = await workflowApi.getAvailableSteps();
            setAvailableSteps(steps);
            setFilteredSteps(steps);
        } catch (err) {
            console.error('Failed to load available steps:', err);
            error('Failed to load available pipeline steps');
        }
    };

    // Filter steps based on search term and remove manual trigger
    useEffect(() => {
        // Filter out manual trigger from available steps
        const stepsWithoutManualTrigger = availableSteps.filter(step => step.type !== 'trigger_manual');

        if (!stepSearchTerm.trim()) {
            setFilteredSteps(stepsWithoutManualTrigger);
        } else {
            const filtered = stepsWithoutManualTrigger.filter(step =>
                step.name.toLowerCase().includes(stepSearchTerm.toLowerCase()) ||
                step.description.toLowerCase().includes(stepSearchTerm.toLowerCase()) ||
                step.type.toLowerCase().includes(stepSearchTerm.toLowerCase())
            );
            setFilteredSteps(filtered);
        }
    }, [stepSearchTerm, availableSteps]);

    // Group steps by category
    const groupedSteps = filteredSteps.reduce((groups, step) => {
        let category = 'Processing';
        if (step.type.startsWith('trigger_')) {
            category = 'Triggers';
        } else if (step.type === 'datasource') {
            category = 'Data Sources';
        }

        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(step);
        return groups;
    }, {} as Record<string, PipelineStep[]>);

    const handleSave = async () => {
        if (!workflow) return;

        setSaving(true);
        try {
            await workflowApi.update(workflowId, workflow);
            success('Workflow updated successfully');
        } catch (err) {
            console.error('Failed to update workflow:', err);
            error('Failed to update workflow');
        } finally {
            setSaving(false);
        }
    };

    // Debounced auto-save function
    const debouncedAutoSave = useCallback(async (workflowData: Workflow) => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                await workflowApi.update(workflowId, workflowData);
                console.log('Workflow auto-saved with test output');
            } catch (error) {
                console.error('Failed to auto-save workflow:', error);
                // Don't show error toast for auto-save failures to avoid spam
            }
        }, 1000); // 1 second delay
    }, [workflowId]);

    const handleExecute = async () => {
        if (!workflow || executing) return;

        setExecuting(true);
        try {
            // Execute asynchronously - returns immediately
            const response = await workflowApi.execute({ workflowId });
            success(`Workflow execution started: ${response.executionId}`);
            // Navigate to execution detail page immediately
            router.push(`/workflows/executions/${response.executionId}`);
        } catch (err: any) {
            console.error('Failed to execute workflow:', err);
            error(`Failed to execute workflow: ${err?.response?.data?.message || err?.message || 'Unknown error'}`);
        } finally {
            setExecuting(false);
        }
    };

    const handleAddNode = (stepType: string) => {
        if (!workflow) return;

        // Prevent adding manual trigger
        if (stepType === 'trigger_manual') {
            return;
        }

        const step = availableSteps.find(s => s.type === stepType);
        if (!step) return;

        const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: stepType,
            name: step.name,
            position: { x: 100 + workflow.nodes.length * 200, y: 100 },
            config: {},
            enabled: true,
            inputSources: workflow.nodes.length > 0 ? [{
                type: 'previous_node',
                nodeId: workflow.nodes[workflow.nodes.length - 1].id,
                filters: []
            }] : [],
        };

        // If adding schedule trigger, place it first; otherwise add to end
        if (stepType === 'trigger_schedule') {
            setWorkflow(prev => ({
                ...prev!,
                nodes: [newNode, ...prev!.nodes],
            }));
        } else {
            setWorkflow(prev => ({
                ...prev!,
                nodes: [...prev!.nodes, newNode],
            }));
        }
    };

    const handleNodeClick = (node: WorkflowNode) => {
        setSelectedNode(node);
        setIsNodeConfigOpen(true);
    };

    const handleNodeSave = (updatedNode: WorkflowNode) => {
        if (!workflow) return;

        const updatedWorkflow = {
            ...workflow,
            nodes: workflow.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
        };

        setWorkflow(updatedWorkflow);
        setSelectedNode(null);
        setIsNodeConfigOpen(false);

        // Trigger debounced auto-save to persist test output
        debouncedAutoSave(updatedWorkflow);
    };

    const handleNodeAutoSave = (updatedNode: WorkflowNode) => {
        if (!workflow) return;

        const updatedWorkflow = {
            ...workflow,
            nodes: workflow.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
        };

        setWorkflow(updatedWorkflow);
        // Don't close the popup for auto-save
        // Trigger debounced auto-save to persist test output
        debouncedAutoSave(updatedWorkflow);
    };

    const handleNodeDelete = (nodeId: string) => {
        if (!workflow) return;

        // Allow deleting any node including schedule trigger
        setWorkflow({
            ...workflow,
            nodes: workflow.nodes.filter(n => n.id !== nodeId),
            edges: workflow.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
        });
        setSelectedNode(null);
        setIsNodeConfigOpen(false);
    };

    // Drag-and-drop handlers for node reordering
    const handleNodeDragStart = (e: React.DragEvent, index: number) => {
        setDraggedNodeIndex(index);
        setDraggedStepType(null);
        e.dataTransfer.effectAllowed = 'move';
        (e.target as HTMLElement).style.opacity = '0.5';
    };

    const handleNodeDragEnd = (e: React.DragEvent) => {
        (e.target as HTMLElement).style.opacity = '1';
        setDraggedNodeIndex(null);
        setDragOverIndex(null);
        setDraggedStepType(null);
    };

    const handleNodeDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedNodeIndex !== null && draggedNodeIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleNodeDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (!workflow || draggedNodeIndex === null || draggedNodeIndex === dropIndex) {
            setDraggedNodeIndex(null);
            setDragOverIndex(null);
            return;
        }

        const draggedNode = workflow.nodes[draggedNodeIndex];
        const newNodes = [...workflow.nodes];
        newNodes.splice(draggedNodeIndex, 1);

        // If dragging schedule trigger, force it to position 0
        // If dropping schedule trigger at any position, force it to position 0
        if (draggedNode.type === 'trigger_schedule') {
            newNodes.splice(0, 0, draggedNode);
        } else {
            // For other nodes, prevent dropping at position 0 if schedule trigger exists at position 0
            const scheduleTriggerAtFirst = newNodes[0]?.type === 'trigger_schedule';
            const insertIndex = scheduleTriggerAtFirst ? Math.max(1, dropIndex) : dropIndex;
            newNodes.splice(insertIndex, 0, draggedNode);
        }

        const updatedWorkflow = {
            ...workflow,
            nodes: newNodes
        };

        setWorkflow(updatedWorkflow);
        setDraggedNodeIndex(null);
        setDragOverIndex(null);

        debouncedAutoSave(updatedWorkflow);
    };

    // Drag-and-drop handlers for steps
    const handleStepDragStart = (e: React.DragEvent, stepType: string) => {
        setDraggedStepType(stepType);
        setDraggedNodeIndex(null);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleStepDragEnd = (e: React.DragEvent) => {
        setDraggedStepType(null);
    };

    const handleCanvasDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (draggedStepType && workflow) {
            // Prevent dropping manual trigger
            if (draggedStepType !== 'trigger_manual') {
                handleAddNode(draggedStepType);
            }
        }

        setDraggedStepType(null);
    };

    // Helper function to create update data
    const createUpdateData = (updates: Partial<Workflow>) => {
        if (!workflow) return null;
        return {
            id: workflow.id,
            name: updates.name ?? workflow.name,
            description: updates.description ?? workflow.description,
            nodes: updates.nodes ?? workflow.nodes,
            edges: updates.edges ?? workflow.edges,
            settings: updates.settings ?? workflow.settings,
            isActive: updates.isActive ?? workflow.isActive,
            isTemplate: updates.isTemplate ?? workflow.isTemplate,
            tags: updates.tags ?? workflow.tags,
            metadata: updates.metadata ?? workflow.metadata
        };
    };

    // Inline editing handlers
    const handleNameEdit = () => {
        setEditingName(true);
        setTempName(workflow?.name || '');
    };

    const handleNameChange = (value: string) => {
        setTempName(value);

        // Clear existing timeout
        if (nameDebounceRef.current) {
            clearTimeout(nameDebounceRef.current);
        }

        // Set new timeout for auto-save
        nameDebounceRef.current = setTimeout(async () => {
            const trimmedValue = value.trim();
            if (workflow && trimmedValue !== workflow.name && trimmedValue.length > 0) {
                try {
                    const updateData = createUpdateData({ name: trimmedValue });
                    if (updateData) {
                        await workflowApi.update(workflowId, updateData);
                        setWorkflow(prev => ({ ...prev!, name: trimmedValue }));
                    }
                } catch (err) {
                    console.error('Failed to save workflow name:', err);
                    error('Failed to save workflow name');
                    // Revert to original value on error
                    setTempName(workflow.name);
                }
            }
        }, 500); // 500ms debounce
    };

    const handleNameBlur = async () => {
        const trimmedValue = tempName.trim();
        if (workflow && trimmedValue !== workflow.name && trimmedValue.length > 0) {
            try {
                const updateData = createUpdateData({ name: trimmedValue });
                if (updateData) {
                    await workflowApi.update(workflowId, updateData);
                    setWorkflow(prev => ({ ...prev!, name: trimmedValue }));
                }
            } catch (err) {
                console.error('Failed to save workflow name:', err);
                error('Failed to save workflow name');
                // Revert to original value on error
                setTempName(workflow.name);
            }
        } else if (trimmedValue.length === 0) {
            // Revert to original value if empty after trimming
            setTempName(workflow?.name || '');
        }
        setEditingName(false);
    };

    const handleDescriptionEdit = () => {
        setEditingDescription(true);
        setTempDescription(workflow?.description || '');
    };

    const handleDescriptionChange = (value: string) => {
        setTempDescription(value);

        // Clear existing timeout
        if (descriptionDebounceRef.current) {
            clearTimeout(descriptionDebounceRef.current);
        }

        // Set new timeout for auto-save
        descriptionDebounceRef.current = setTimeout(async () => {
            const trimmedValue = value.trim();
            if (workflow && trimmedValue !== workflow.description) {
                try {
                    const updateData = createUpdateData({ description: trimmedValue });
                    if (updateData) {
                        await workflowApi.update(workflowId, updateData);
                        setWorkflow(prev => ({ ...prev!, description: trimmedValue }));
                    }
                } catch (err) {
                    console.error('Failed to save workflow description:', err);
                    error('Failed to save workflow description');
                    // Revert to original value on error
                    setTempDescription(workflow.description || '');
                }
            }
        }, 500); // 500ms debounce
    };

    const handleDescriptionBlur = async () => {
        const trimmedValue = tempDescription.trim();
        if (workflow && trimmedValue !== workflow.description) {
            try {
                const updateData = createUpdateData({ description: trimmedValue });
                if (updateData) {
                    await workflowApi.update(workflowId, updateData);
                    setWorkflow(prev => ({ ...prev!, description: trimmedValue }));
                }
            } catch (err) {
                console.error('Failed to save workflow description:', err);
                error('Failed to save workflow description');
                // Revert to original value on error
                setTempDescription(workflow.description || '');
            }
        }
        setEditingDescription(false);
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-lg">Loading workflow...</div>
                </div>
            </div>
        );
    }

    if (!workflow) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="text-lg font-semibold mb-2">Workflow not found</div>
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
                    {editingName ? (
                        <input
                            value={tempName}
                            onChange={(e) => handleNameChange(e.target.value)}
                            onBlur={handleNameBlur}
                            className="text-3xl font-bold border-none p-0 h-auto bg-transparent outline-none w-full"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setTempName(workflow?.name || '');
                                    setEditingName(false);
                                }
                            }}
                        />
                    ) : (
                        <h1 className="text-3xl font-bold">
                            <span
                                className="cursor-pointer hover:bg-gray-100 p-1 rounded inline-block"
                                onClick={handleNameEdit}
                            >
                                {workflow.name}
                                <Edit2 className="h-4 w-4 inline ml-2 opacity-50" />
                            </span>
                        </h1>
                    )}

                    {editingDescription ? (
                        <textarea
                            value={tempDescription}
                            onChange={(e) => handleDescriptionChange(e.target.value)}
                            onBlur={handleDescriptionBlur}
                            className="text-gray-600 border-none p-0 h-auto resize-none bg-transparent outline-none w-full mt-2"
                            rows={1}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setTempDescription(workflow?.description || '');
                                    setEditingDescription(false);
                                }
                            }}
                        />
                    ) : (
                        <p className="text-gray-600 mt-2">
                            <span
                                className="cursor-pointer hover:bg-gray-100 p-1 rounded inline-block"
                                onClick={handleDescriptionEdit}
                            >
                                {workflow.description || 'Click to add description'}
                                <Edit2 className="h-3 w-3 inline ml-2 opacity-50" />
                            </span>
                        </p>
                    )}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="nodes">Nodes</TabsTrigger>
                    <TabsTrigger value="executions">Executions</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="nodes" className="space-y-4 h-full">
                    <div className="flex gap-6 h-[calc(100vh-200px)]">
                        {/* Workflow Canvas */}
                        <div className="flex-1">
                            <Card className="h-full flex flex-col">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <CardTitle>Workflow Design</CardTitle>
                                                <CardDescription>
                                                    {workflow?.nodes.length || 0} nodes, {workflow?.edges.length || 0} connections
                                                </CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="workflow-active-toggle" className="text-sm text-gray-600">
                                                    {workflow?.isActive ? 'Active' : 'Inactive'}
                                                </Label>
                                                <Switch
                                                    id="workflow-active-toggle"
                                                    checked={workflow?.isActive || false}
                                                    onCheckedChange={async (checked) => {
                                                        if (!workflow) return;
                                                        const updatedWorkflow = { ...workflow, isActive: checked };
                                                        setWorkflow(updatedWorkflow);
                                                        try {
                                                            await workflowApi.update(workflowId, { isActive: checked });
                                                            success(checked ? 'Workflow activated' : 'Workflow deactivated');
                                                        } catch (err) {
                                                            console.error('Failed to update workflow status:', err);
                                                            error('Failed to update workflow status');
                                                            // Revert on error
                                                            setWorkflow(prev => ({ ...prev!, isActive: !checked }));
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={handleExecute}
                                                disabled={!workflow?.isActive || executing}
                                            >
                                                <Play className={`h-4 w-4 mr-2 ${executing ? 'animate-pulse' : ''}`} />
                                                {executing ? 'Executing...' : 'Execute'}
                                            </Button>
                                            <Button
                                                onClick={handleSave}
                                                disabled={saving}
                                            >
                                                {saving ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="h-4 w-4 mr-2" />
                                                        Save
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-hidden">
                                    <div className="h-full overflow-y-auto">
                                        <div
                                            className="min-h-[500px] border-2 border-dashed border-gray-300 rounded-lg p-4"
                                            onDragOver={handleCanvasDragOver}
                                            onDrop={handleCanvasDrop}
                                        >
                                            {workflow?.nodes.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                                    <Plus className="h-12 w-12 mb-4 grew" />
                                                    <p className="text-lg font-medium">No nodes added yet</p>
                                                    <p className="text-sm">Drag steps from the sidebar or click to add</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {workflow?.nodes.map((node, index) => {
                                                        const isScheduleTrigger = node.type === 'trigger_schedule';
                                                        return (
                                                            <div
                                                                key={node.id}
                                                                draggable
                                                                onDragStart={(e) => handleNodeDragStart(e, index)}
                                                                onDragEnd={handleNodeDragEnd}
                                                                onDragOver={(e) => handleNodeDragOver(e, index)}
                                                                onDrop={(e) => handleNodeDrop(e, index)}
                                                                className={`p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-all cursor-pointer ${dragOverIndex === index ? 'border-blue-500 border-2' : 'border-gray-200'
                                                                    }`}
                                                                onClick={() => handleNodeClick(node)}
                                                            >
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="p-1 rounded bg-blue-100">
                                                                            {node.type.startsWith('trigger_') && <Zap className="h-4 w-4 text-blue-600" />}
                                                                            {node.type === 'datasource' && <Database className="h-4 w-4 text-green-600" />}
                                                                            {node.type === 'test' && <FileText className="h-4 w-4 text-purple-600" />}
                                                                            {!node.type.startsWith('trigger_') && node.type !== 'datasource' && node.type !== 'test' && <Settings className="h-4 w-4 text-gray-600" />}
                                                                        </div>
                                                                        <h3 className="font-medium">{node.name}</h3>
                                                                        {!node.enabled && (
                                                                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                                                                Disabled
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleNodeClick(node);
                                                                            }}
                                                                        >
                                                                            <Settings className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleNodeDelete(node.id);
                                                                            }}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm text-gray-600">
                                                                    {node.type} • Position: ({node.position.x}, {node.position.y})
                                                                </div>
                                                                {node.conditions && (
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        Conditions: {node.conditions}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Available Steps */}
                        <div className="w-80">
                            <Card className="h-full flex flex-col">
                                <CardHeader className="pb-3 flex-shrink-0">
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Available Steps</CardTitle>
                                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                            {filteredSteps.length} of {availableSteps.length}
                                        </span>
                                    </div>
                                    <CardDescription>Add steps to your workflow</CardDescription>
                                    <div className="mt-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                                placeholder="Search steps..."
                                                value={stepSearchTerm}
                                                onChange={(e) => setStepSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-10"
                                            />
                                            {stepSearchTerm && (
                                                <button
                                                    onClick={() => setStepSearchTerm('')}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-hidden">
                                    <div className="h-full overflow-y-auto space-y-4 pr-2">
                                        {Object.keys(groupedSteps).length > 0 ? (
                                            Object.entries(groupedSteps).map(([category, steps]) => (
                                                <div key={category} className="space-y-2">
                                                    <div className="sticky top-0 bg-white py-2 border-b z-10">
                                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                            {category}
                                                        </h4>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {steps.map((step) => (
                                                            <div
                                                                key={step.type}
                                                                draggable
                                                                onDragStart={(e) => handleStepDragStart(e, step.type)}
                                                                onDragEnd={handleStepDragEnd}
                                                                className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing"
                                                                onClick={() => handleAddNode(step.type)}
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <div className="p-1 rounded bg-blue-100 mt-0.5">
                                                                        {step.type.startsWith('trigger_') && <Zap className="h-3 w-3 text-blue-600" />}
                                                                        {step.type === 'datasource' && <Database className="h-3 w-3 text-green-600" />}
                                                                        {step.type === 'test' && <FileText className="h-3 w-3 text-purple-600" />}
                                                                        {!step.type.startsWith('trigger_') && step.type !== 'datasource' && step.type !== 'test' && <Settings className="h-3 w-3 text-gray-600" />}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-medium text-sm">{step.name}</div>
                                                                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">{step.description}</div>
                                                                        <div className="text-xs text-gray-400 mt-1">{step.type}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 text-gray-500">
                                                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">No steps found</p>
                                                <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="executions" className="space-y-4">
                    <WorkflowExecutionList
                        ref={executionsListRef}
                        workflowId={workflowId}
                        onExecutionSelect={(execution) => {
                            console.log('Selected execution:', execution);
                        }}
                        onNodeSnapshotSelect={(executionId, nodeId) => {
                            console.log('Selected node snapshot:', executionId, nodeId);
                        }}
                        autoRefresh={true}
                        refreshInterval={10000}
                    />
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Workflow Settings */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="h-5 w-5" />
                                    Workflow Settings
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="active">Active</Label>
                                        <Switch
                                            id="active"
                                            checked={workflow.isActive}
                                            onCheckedChange={(checked) => setWorkflow(prev => ({ ...prev!, isActive: checked }))}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="template">Template</Label>
                                        <Switch
                                            id="template"
                                            checked={workflow.isTemplate}
                                            onCheckedChange={(checked) => setWorkflow(prev => ({ ...prev!, isTemplate: checked }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="errorHandling">Error Handling</Label>
                                    <Select
                                        value={workflow.settings.errorHandling}
                                        onValueChange={(value: 'stop' | 'continue' | 'retry') =>
                                            setWorkflow(prev => ({
                                                ...prev!,
                                                settings: { ...prev!.settings, errorHandling: value }
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="stop">Stop on Error</SelectItem>
                                            <SelectItem value="continue">Continue on Error</SelectItem>
                                            <SelectItem value="retry">Retry on Error</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="maxRetries">Max Retries</Label>
                                    <Input
                                        id="maxRetries"
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={workflow.settings.maxRetries}
                                        onChange={(e) => setWorkflow(prev => ({
                                            ...prev!,
                                            settings: { ...prev!.settings, maxRetries: parseInt(e.target.value) || 3 }
                                        }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="parallel">Parallel Execution</Label>
                                        <Switch
                                            id="parallel"
                                            checked={workflow.settings.parallelExecution}
                                            onCheckedChange={(checked) => setWorkflow(prev => ({
                                                ...prev!,
                                                settings: { ...prev!.settings, parallelExecution: checked }
                                            }))}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="notifyCompletion">Notify on Completion</Label>
                                        <Switch
                                            id="notifyCompletion"
                                            checked={workflow.settings.notifyOnCompletion}
                                            onCheckedChange={(checked) => setWorkflow(prev => ({
                                                ...prev!,
                                                settings: { ...prev!.settings, notifyOnCompletion: checked }
                                            }))}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="notifyFailure">Notify on Failure</Label>
                                        <Switch
                                            id="notifyFailure"
                                            checked={workflow.settings.notifyOnFailure}
                                            onCheckedChange={(checked) => setWorkflow(prev => ({
                                                ...prev!,
                                                settings: { ...prev!.settings, notifyOnFailure: checked }
                                            }))}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Additional Settings */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Additional Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="tags">Tags</Label>
                                    <Input
                                        id="tags"
                                        value={workflow.tags || ''}
                                        onChange={(e) => setWorkflow(prev => ({ ...prev!, tags: e.target.value }))}
                                        placeholder="Enter tags (comma separated)"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="category">Category</Label>
                                    <Input
                                        id="category"
                                        value={workflow.metadata?.category || ''}
                                        onChange={(e) => setWorkflow(prev => ({
                                            ...prev!,
                                            metadata: { ...prev!.metadata, category: e.target.value }
                                        }))}
                                        placeholder="Enter category"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="complexity">Complexity</Label>
                                    <Select
                                        value={workflow.metadata?.complexity || 'simple'}
                                        onValueChange={(value: 'simple' | 'medium' | 'complex') =>
                                            setWorkflow(prev => ({
                                                ...prev!,
                                                metadata: { ...prev!.metadata, complexity: value }
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="simple">Simple</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="complex">Complex</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Workflow Node Configuration Modal */}
            <WorkflowNodeConfig
                node={selectedNode}
                isOpen={isNodeConfigOpen}
                onClose={(updatedNode) => {
                    // Save changes when popup closes
                    if (updatedNode && workflow) {
                        setWorkflow({
                            ...workflow,
                            nodes: workflow.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
                        });
                    }
                    setSelectedNode(null);
                    setIsNodeConfigOpen(false);
                }}
                onSave={handleNodeSave}
                onAutoSave={handleNodeAutoSave}
                onDelete={handleNodeDelete}
                availableSteps={availableSteps}
                workflowNodes={workflow?.nodes || []}
                workflowId={workflowId}
            />
        </div>
    );
}
