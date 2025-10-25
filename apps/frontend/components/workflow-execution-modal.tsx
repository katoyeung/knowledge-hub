'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Database, FileText, Layers, Play, AlertCircle } from 'lucide-react';
import { Workflow } from '@/lib/api/workflow';
import { Dataset, Document, DocumentSegment } from '@/lib/api';
import { datasetApi, documentApi, documentSegmentApi } from '@/lib/api';
import { useToast } from '@/components/ui/simple-toast';

interface WorkflowExecutionInput {
    documentIds?: string[];
    segmentIds?: string[];
    datasetId?: string;
    externalInput?: Record<string, any>;
}

interface WorkflowExecutionModalProps {
    workflow: Workflow | null;
    isOpen: boolean;
    onClose: () => void;
    onExecute: (inputData: WorkflowExecutionInput) => void;
}

export function WorkflowExecutionModal({
    workflow,
    isOpen,
    onClose,
    onExecute
}: WorkflowExecutionModalProps) {
    const { success, error: showError } = useToast();

    // Input type selection
    const [inputType, setInputType] = useState<'dataset' | 'documents' | 'segments' | 'custom'>('dataset');

    // Data loading states
    const [loading, setLoading] = useState(false);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [segments, setSegments] = useState<DocumentSegment[]>([]);

    // Selection states
    const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
    const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
    const [customInput, setCustomInput] = useState<string>('');

    // Error states
    const [error, setError] = useState<string | null>(null);

    // Load datasets when modal opens
    useEffect(() => {
        if (isOpen) {
            loadDatasets();
        }
    }, [isOpen]);

    // Load documents when dataset is selected
    useEffect(() => {
        if (selectedDatasetId && inputType === 'documents') {
            loadDocuments(selectedDatasetId);
        }
    }, [selectedDatasetId, inputType]);

    // Load segments when documents are selected
    useEffect(() => {
        if (selectedDocumentIds.length > 0 && inputType === 'segments') {
            loadSegments(selectedDocumentIds);
        }
    }, [selectedDocumentIds, inputType]);

    const loadDatasets = async () => {
        try {
            setLoading(true);
            const data = await datasetApi.getAll();
            setDatasets(data);
        } catch (err) {
            setError('Failed to load datasets');
        } finally {
            setLoading(false);
        }
    };

    const loadDocuments = async (datasetId: string) => {
        try {
            setLoading(true);
            const data = await documentApi.getByDataset(datasetId);
            setDocuments(data);
        } catch (err) {
            setError('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    const loadSegments = async (documentIds: string[]) => {
        try {
            setLoading(true);
            const allSegments: DocumentSegment[] = [];

            for (const documentId of documentIds) {
                const data = await documentSegmentApi.getByDocument(documentId);
                allSegments.push(...data);
            }

            setSegments(allSegments);
        } catch (err) {
            setError('Failed to load segments');
        } finally {
            setLoading(false);
        }
    };

    const handleDocumentToggle = (documentId: string) => {
        setSelectedDocumentIds(prev =>
            prev.includes(documentId)
                ? prev.filter(id => id !== documentId)
                : [...prev, documentId]
        );
    };

    const handleSegmentToggle = (segmentId: string) => {
        setSelectedSegmentIds(prev =>
            prev.includes(segmentId)
                ? prev.filter(id => id !== segmentId)
                : [...prev, segmentId]
        );
    };

    const handleExecute = () => {
        if (!workflow) return;

        // Create a data source node configuration
        let dataSourceConfig: any = {
            sourceType: inputType,
        };

        switch (inputType) {
            case 'dataset':
                if (!selectedDatasetId) {
                    setError('Please select a dataset');
                    return;
                }
                dataSourceConfig.datasetId = selectedDatasetId;
                break;

            case 'documents':
                if (selectedDocumentIds.length === 0) {
                    setError('Please select at least one document');
                    return;
                }
                dataSourceConfig.documentIds = selectedDocumentIds;
                break;

            case 'segments':
                if (selectedSegmentIds.length === 0) {
                    setError('Please select at least one segment');
                    return;
                }
                dataSourceConfig.segmentIds = selectedSegmentIds;
                break;

            case 'custom':
                try {
                    const parsed = JSON.parse(customInput);
                    dataSourceConfig.customData = parsed;
                } catch {
                    setError('Invalid JSON format for custom input');
                    return;
                }
                break;
        }

        // Create input with data source node configuration
        const inputData: WorkflowExecutionInput = {
            dataSourceConfig,
        };

        onExecute(inputData);
        onClose();
    };

    const resetForm = () => {
        setInputType('dataset');
        setSelectedDatasetId('');
        setSelectedDocumentIds([]);
        setSelectedSegmentIds([]);
        setCustomInput('');
        setError(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    if (!workflow) return null;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Play className="h-5 w-5" />
                        Execute Workflow: {workflow.name}
                    </DialogTitle>
                    <DialogDescription>
                        Select the input data source for this workflow execution
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Workflow Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Workflow Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <Label className="font-medium">Nodes:</Label>
                                    <span className="ml-2">{workflow.nodes.length}</span>
                                </div>
                                <div>
                                    <Label className="font-medium">Connections:</Label>
                                    <span className="ml-2">{workflow.edges.length}</span>
                                </div>
                                <div>
                                    <Label className="font-medium">Status:</Label>
                                    <Badge variant={workflow.isActive ? 'default' : 'secondary'} className="ml-2">
                                        {workflow.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                                <div>
                                    <Label className="font-medium">Template:</Label>
                                    <Badge variant={workflow.isTemplate ? 'default' : 'outline'} className="ml-2">
                                        {workflow.isTemplate ? 'Yes' : 'No'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Input Type Selection */}
                    <div className="space-y-4">
                        <Label className="text-base font-medium">Input Source</Label>
                        <Tabs value={inputType} onValueChange={(value) => setInputType(value as any)}>
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="dataset" className="flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    Dataset
                                </TabsTrigger>
                                <TabsTrigger value="documents" className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Documents
                                </TabsTrigger>
                                <TabsTrigger value="segments" className="flex items-center gap-2">
                                    <Layers className="h-4 w-4" />
                                    Segments
                                </TabsTrigger>
                                <TabsTrigger value="custom" className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    Custom
                                </TabsTrigger>
                            </TabsList>

                            {/* Dataset Selection */}
                            <TabsContent value="dataset" className="space-y-4">
                                <div>
                                    <Label htmlFor="dataset-select">Select Dataset</Label>
                                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a dataset..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {datasets.map((dataset) => (
                                                <SelectItem key={dataset.id} value={dataset.id}>
                                                    {dataset.name} ({dataset.documentCount || 0} documents)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Process all documents in the selected dataset
                                    </p>
                                </div>
                            </TabsContent>

                            {/* Document Selection */}
                            <TabsContent value="documents" className="space-y-4">
                                <div>
                                    <Label htmlFor="dataset-select">First, select a dataset</Label>
                                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a dataset..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {datasets.map((dataset) => (
                                                <SelectItem key={dataset.id} value={dataset.id}>
                                                    {dataset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedDatasetId && (
                                    <div>
                                        <Label>Select Documents</Label>
                                        <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                                            {loading ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Loading documents...
                                                </div>
                                            ) : documents.length === 0 ? (
                                                <p className="text-sm text-gray-500 text-center py-4">
                                                    No documents found in this dataset
                                                </p>
                                            ) : (
                                                documents.map((document) => (
                                                    <div key={document.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`doc-${document.id}`}
                                                            checked={selectedDocumentIds.includes(document.id)}
                                                            onCheckedChange={() => handleDocumentToggle(document.id)}
                                                        />
                                                        <Label
                                                            htmlFor={`doc-${document.id}`}
                                                            className="flex-1 cursor-pointer"
                                                        >
                                                            {document.name} ({document.indexingStatus})
                                                        </Label>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Selected {selectedDocumentIds.length} document(s)
                                        </p>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Segment Selection */}
                            <TabsContent value="segments" className="space-y-4">
                                <div>
                                    <Label htmlFor="dataset-select">First, select a dataset</Label>
                                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a dataset..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {datasets.map((dataset) => (
                                                <SelectItem key={dataset.id} value={dataset.id}>
                                                    {dataset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedDatasetId && (
                                    <div>
                                        <Label>Select Documents</Label>
                                        <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-2">
                                            {documents.map((document) => (
                                                <div key={document.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`doc-${document.id}`}
                                                        checked={selectedDocumentIds.includes(document.id)}
                                                        onCheckedChange={() => handleDocumentToggle(document.id)}
                                                    />
                                                    <Label
                                                        htmlFor={`doc-${document.id}`}
                                                        className="flex-1 cursor-pointer"
                                                    >
                                                        {document.name}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedDocumentIds.length > 0 && (
                                    <div>
                                        <Label>Select Segments</Label>
                                        <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                                            {loading ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Loading segments...
                                                </div>
                                            ) : segments.length === 0 ? (
                                                <p className="text-sm text-gray-500 text-center py-4">
                                                    No segments found in selected documents
                                                </p>
                                            ) : (
                                                segments.map((segment) => (
                                                    <div key={segment.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`seg-${segment.id}`}
                                                            checked={selectedSegmentIds.includes(segment.id)}
                                                            onCheckedChange={() => handleSegmentToggle(segment.id)}
                                                        />
                                                        <Label
                                                            htmlFor={`seg-${segment.id}`}
                                                            className="flex-1 cursor-pointer"
                                                        >
                                                            <div className="text-sm">
                                                                <div className="font-medium">{segment.title || 'Untitled'}</div>
                                                                <div className="text-gray-500 truncate">
                                                                    {segment.content.substring(0, 100)}...
                                                                </div>
                                                            </div>
                                                        </Label>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Selected {selectedSegmentIds.length} segment(s)
                                        </p>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Custom Input */}
                            <TabsContent value="custom" className="space-y-4">
                                <div>
                                    <Label htmlFor="custom-input">Custom JSON Input</Label>
                                    <textarea
                                        id="custom-input"
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        placeholder='{"key": "value", "data": [...]}'
                                        className="w-full h-32 p-3 border rounded-md font-mono text-sm"
                                    />
                                    <p className="text-sm text-gray-500 mt-1">
                                        Enter valid JSON data to pass as external input to the workflow
                                    </p>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleExecute} disabled={loading}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Execute Workflow
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
