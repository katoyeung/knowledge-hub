'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Eye,
    Merge,
    X,
    RefreshCw,
    Search,
    Target,
    BarChart3
} from 'lucide-react';
import { graphApi } from '@/lib/api';

interface DuplicateNode {
    id: string;
    label: string;
    nodeType: string;
    properties?: any;
    similarity: number;
    context?: string;
    frequency: number;
    lastSeen: string;
}

interface DuplicateGroup {
    id: string;
    canonicalName: string;
    nodes: DuplicateNode[];
    suggestedCanonical: string;
    confidence: number;
    mergeStrategy: 'first' | 'most_frequent' | 'highest_confidence' | 'manual';
    conflicts: Array<{
        field: string;
        values: string[];
        suggested: string;
    }>;
}

interface MergePreview {
    targetNode: DuplicateNode;
    sourceNodes: DuplicateNode[];
    mergedProperties: any;
    aliases: string[];
    conflicts: Array<{
        field: string;
        conflict: boolean;
        resolution: string;
    }>;
}

interface DuplicateEntitiesModalProps {
    datasetId: string;
    isOpen: boolean;
    onClose: () => void;
    onMergeComplete?: (result: { merged: number; errors: string[] }) => void;
    initialDuplicates?: DuplicateGroup[];
}

export const DuplicateEntitiesModal: React.FC<DuplicateEntitiesModalProps> = ({
    datasetId,
    isOpen,
    onClose,
    onMergeComplete,
    initialDuplicates = [],
}) => {
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>(initialDuplicates);
    const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
    const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
    const [mergeStrategy, setMergeStrategy] = useState<'first' | 'most_frequent' | 'highest_confidence' | 'manual'>('most_frequent');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('');
    const [minConfidence, setMinConfidence] = useState(0);

    // Filter duplicates based on search and filters
    const filteredDuplicates = duplicates.filter(group => {
        const matchesSearch = searchTerm === '' ||
            group.canonicalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            group.nodes.some(node => node.label.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesType = filterType === '' ||
            group.nodes.some(node => node.nodeType === filterType);

        const matchesConfidence = group.confidence >= minConfidence;

        return matchesSearch && matchesType && matchesConfidence;
    });

    // Generate merge preview
    const generateMergePreview = useCallback((group: DuplicateGroup, strategy: string) => {
        let targetNode: DuplicateNode;
        let sourceNodes: DuplicateNode[];

        switch (strategy) {
            case 'first':
                targetNode = group.nodes[0];
                sourceNodes = group.nodes.slice(1);
                break;
            case 'most_frequent':
                targetNode = group.nodes.reduce((most, current) =>
                    current.frequency > most.frequency ? current : most
                );
                sourceNodes = group.nodes.filter(node => node.id !== targetNode.id);
                break;
            case 'highest_confidence':
                targetNode = group.nodes.reduce((highest, current) =>
                    (current.properties?.confidence || 0) > (highest.properties?.confidence || 0) ? current : highest
                );
                sourceNodes = group.nodes.filter(node => node.id !== targetNode.id);
                break;
            default:
                targetNode = group.nodes[0];
                sourceNodes = group.nodes.slice(1);
        }

        // Merge properties
        const mergedProperties = { ...targetNode.properties };
        const aliases: string[] = [];
        const conflicts: Array<{ field: string; conflict: boolean; resolution: string }> = [];

        sourceNodes.forEach(node => {
            // Add as alias if different from target
            if (node.label !== targetNode.label) {
                aliases.push(node.label);
            }

            // Merge properties and detect conflicts
            Object.entries(node.properties || {}).forEach(([key, value]) => {
                if (key in mergedProperties) {
                    if (mergedProperties[key] !== value) {
                        conflicts.push({
                            field: key,
                            conflict: true,
                            resolution: `Using "${mergedProperties[key]}" from target node`,
                        });
                    }
                } else {
                    mergedProperties[key] = value;
                }
            });
        });

        setMergePreview({
            targetNode,
            sourceNodes,
            mergedProperties,
            aliases,
            conflicts,
        });
    }, []);

    // Handle group selection
    const handleGroupSelect = useCallback((group: DuplicateGroup) => {
        setSelectedGroup(group);
        generateMergePreview(group, mergeStrategy);
    }, [mergeStrategy, generateMergePreview]);

    // Handle merge strategy change
    const handleMergeStrategyChange = useCallback((strategy: string) => {
        setMergeStrategy(strategy as any);
        if (selectedGroup) {
            generateMergePreview(selectedGroup, strategy);
        }
    }, [selectedGroup, generateMergePreview]);

    // Execute merge
    const executeMerge = useCallback(async (group: DuplicateGroup) => {
        if (!mergePreview) return;

        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const result = await graphApi.entityNormalization.mergeNodes(datasetId, {
                sourceIds: mergePreview.sourceNodes.map(node => node.id),
                targetId: mergePreview.targetNode.id,
            });

            setProgress(100);

            // Update local state
            setDuplicates(prev => prev.filter(g => g.id !== group.id));
            setSelectedGroup(null);
            setMergePreview(null);

            onMergeComplete?.(result);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Merge failed');
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    }, [datasetId, mergePreview, onMergeComplete]);

    // Batch merge all groups
    const batchMergeAll = useCallback(async () => {
        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const results = { merged: 0, errors: [] as string[] };

            for (let i = 0; i < filteredDuplicates.length; i++) {
                const group = filteredDuplicates[i];

                try {
                    // Determine target node based on strategy
                    let targetNode: DuplicateNode;
                    switch (mergeStrategy) {
                        case 'most_frequent':
                            targetNode = group.nodes.reduce((most, current) =>
                                current.frequency > most.frequency ? current : most
                            );
                            break;
                        case 'highest_confidence':
                            targetNode = group.nodes.reduce((highest, current) =>
                                (current.properties?.confidence || 0) > (highest.properties?.confidence || 0) ? current : highest
                            );
                            break;
                        default:
                            targetNode = group.nodes[0];
                    }

                    const sourceNodes = group.nodes.filter(node => node.id !== targetNode.id);

                    if (sourceNodes.length > 0) {
                        await graphApi.entityNormalization.mergeNodes(datasetId, {
                            sourceIds: sourceNodes.map(node => node.id),
                            targetId: targetNode.id,
                        });
                        results.merged++;
                    }
                } catch (error) {
                    results.errors.push(`Failed to merge group "${group.canonicalName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                }

                setProgress((i + 1) / filteredDuplicates.length * 100);
            }

            setDuplicates([]);
            onMergeComplete?.(results);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Batch merge failed');
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    }, [filteredDuplicates, mergeStrategy, datasetId, onMergeComplete]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">Duplicate Entities</h2>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={batchMergeAll}
                            disabled={isProcessing || filteredDuplicates.length === 0}
                            className="flex items-center gap-2"
                        >
                            <Merge className="h-4 w-4" />
                            Merge All ({filteredDuplicates.length})
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Panel: Duplicate Groups */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        placeholder="Search duplicates..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-32">
                                        <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Types</SelectItem>
                                        <SelectItem value="organization">Organization</SelectItem>
                                        <SelectItem value="author">Author</SelectItem>
                                        <SelectItem value="product">Product</SelectItem>
                                        <SelectItem value="location">Location</SelectItem>
                                        <SelectItem value="topic">Topic</SelectItem>
                                        <SelectItem value="event">Event</SelectItem>
                                        <SelectItem value="brand">Brand</SelectItem>
                                        <SelectItem value="hashtag">Hashtag</SelectItem>
                                        <SelectItem value="influencer">Influencer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Min Confidence</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={minConfidence}
                                    onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                                />
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-medium">Duplicate Groups ({filteredDuplicates.length})</h3>
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {filteredDuplicates.map((group) => (
                                        <Card
                                            key={group.id}
                                            className={`cursor-pointer transition-colors ${selectedGroup?.id === group.id
                                                ? 'ring-2 ring-blue-500 bg-blue-50'
                                                : 'hover:bg-gray-50'
                                                }`}
                                            onClick={() => handleGroupSelect(group)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="font-medium">{group.canonicalName}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {group.nodes.length} duplicates • {(group.confidence * 100).toFixed(0)}% confidence
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline">{group.nodes.length}</Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right Panel: Merge Preview */}
                        <div className="space-y-4">
                            {selectedGroup && mergePreview ? (
                                <>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Target className="h-5 w-5" />
                                                Merge Preview
                                            </CardTitle>
                                            <CardDescription>
                                                Review the merge operation before executing
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Merge Strategy</Label>
                                                <Select value={mergeStrategy} onValueChange={handleMergeStrategyChange}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="first">First Node</SelectItem>
                                                        <SelectItem value="most_frequent">Most Frequent</SelectItem>
                                                        <SelectItem value="highest_confidence">Highest Confidence</SelectItem>
                                                        <SelectItem value="manual">Manual Selection</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <h4 className="font-medium text-green-600">Target Node (Will be kept)</h4>
                                                    <div className="p-3 bg-green-50 rounded border">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline">{mergePreview.targetNode.nodeType}</Badge>
                                                            <span className="font-medium">{mergePreview.targetNode.label}</span>
                                                            <Badge variant="secondary">
                                                                {(mergePreview.targetNode.similarity * 100).toFixed(0)}% similar
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            Frequency: {mergePreview.targetNode.frequency}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="font-medium text-red-600">Source Nodes (Will be merged)</h4>
                                                    <div className="space-y-2">
                                                        {mergePreview.sourceNodes.map((node) => (
                                                            <div key={node.id} className="p-3 bg-red-50 rounded border">
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline">{node.nodeType}</Badge>
                                                                    <span className="font-medium">{node.label}</span>
                                                                    <Badge variant="secondary">
                                                                        {(node.similarity * 100).toFixed(0)}% similar
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-sm text-gray-600 mt-1">
                                                                    Frequency: {node.frequency}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {mergePreview.aliases.length > 0 && (
                                                    <div>
                                                        <h4 className="font-medium">Aliases to Create</h4>
                                                        <div className="flex flex-wrap gap-1">
                                                            {mergePreview.aliases.map((alias, index) => (
                                                                <Badge key={index} variant="outline">{alias}</Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {mergePreview.conflicts.length > 0 && (
                                                    <div>
                                                        <h4 className="font-medium text-yellow-600">Property Conflicts</h4>
                                                        <div className="space-y-2">
                                                            {mergePreview.conflicts.map((conflict, index) => (
                                                                <Alert key={index} variant="destructive">
                                                                    <AlertTriangle className="h-4 w-4" />
                                                                    <AlertDescription>
                                                                        <strong>{conflict.field}:</strong> {conflict.resolution}
                                                                    </AlertDescription>
                                                                </Alert>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => executeMerge(selectedGroup)}
                                                    disabled={isProcessing}
                                                    className="flex items-center gap-2"
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Merge className="h-4 w-4" />
                                                    )}
                                                    Merge Now
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => {
                                                        setSelectedGroup(null);
                                                        setMergePreview(null);
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <Card>
                                    <CardContent className="p-8 text-center">
                                        <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                        <h3 className="text-lg font-medium mb-2">Select a duplicate group</h3>
                                        <p className="text-gray-600">
                                            Choose a duplicate group from the list to preview the merge operation.
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Progress */}
                    {isProcessing && (
                        <Card className="mt-4">
                            <CardContent className="p-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span>Processing merge operations...</span>
                                        <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={progress} className="w-full" />
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};
