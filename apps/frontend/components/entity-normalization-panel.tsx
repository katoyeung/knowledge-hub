'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Eye,
    Trash2,
    Plus,
    X,
    Filter,
    Search,
    Download,
    Upload,
    Merge,
    Target,
    BarChart3,
    Settings,
    Clock,
    Activity
} from 'lucide-react';
import { graphApi } from '@/lib/api';

interface NormalizationConfig {
    nodeTypes: string[];
    similarityThreshold: number;
    method: 'fuzzy_match' | 'exact_match' | 'dictionary_match' | 'ml_suggestion' | 'manual';
    confidenceThreshold: number;
    batchSize: number;
    autoMerge: boolean;
    dryRun: boolean;
}

interface DuplicateGroup {
    canonicalName: string;
    nodes: Array<{
        id: string;
        label: string;
        nodeType: string;
        properties?: any;
        similarity: number;
    }>;
    suggestedCanonical: string;
    confidence: number;
}

interface NormalizationLog {
    id: string;
    action: 'merge' | 'update' | 'create_alias' | 'suggest';
    originalNodeId: string;
    normalizedNodeId: string;
    timestamp: string;
    details: any;
    userId: string;
}

interface NormalizationStats {
    totalNormalizations: number;
    mergedNodes: number;
    updatedNodes: number;
    createdAliases: number;
    suggestions: number;
    byMethod: Record<string, number>;
    byType: Record<string, number>;
    recentActivity: NormalizationLog[];
}

interface NormalizationFilters {
    nodeType: string;
    method: string;
    minSimilarity: number;
    dateRange: string;
    searchTerm: string;
}

export const EntityNormalizationPanel: React.FC<{
    datasetId: string;
    onNormalizationComplete?: (result: any) => void;
}> = ({ datasetId, onNormalizationComplete }) => {
    const [activeTab, setActiveTab] = useState<'normalize' | 'duplicates' | 'logs' | 'stats'>('normalize');
    const [config, setConfig] = useState<NormalizationConfig>({
        nodeTypes: [],
        similarityThreshold: 0.85,
        method: 'fuzzy_match',
        confidenceThreshold: 0.7,
        batchSize: 100,
        autoMerge: false,
        dryRun: true,
    });
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [filteredDuplicates, setFilteredDuplicates] = useState<DuplicateGroup[]>([]);
    const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<NormalizationLog[]>([]);
    const [stats, setStats] = useState<NormalizationStats | null>(null);
    const [filters, setFilters] = useState<NormalizationFilters>({
        nodeType: '',
        method: '',
        minSimilarity: 0,
        dateRange: '',
        searchTerm: '',
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFindingDuplicates, setIsFindingDuplicates] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Available node types
    const nodeTypes = [
        { value: 'organization', label: 'Organization' },
        { value: 'author', label: 'Author' },
        { value: 'product', label: 'Product' },
        { value: 'location', label: 'Location' },
        { value: 'topic', label: 'Topic' },
        { value: 'event', label: 'Event' },
        { value: 'brand', label: 'Brand' },
        { value: 'hashtag', label: 'Hashtag' },
        { value: 'influencer', label: 'Influencer' },
    ];

    // Load normalization statistics
    const loadStats = useCallback(async () => {
        try {
            const data = await graphApi.entityNormalization.getStats(datasetId);
            setStats(data);
        } catch (error) {
            console.error('Failed to load normalization stats:', error);
        }
    }, [datasetId]);

    // Load normalization logs
    const loadLogs = useCallback(async () => {
        try {
            const data = await graphApi.entityNormalization.getLogs(datasetId);
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load normalization logs:', error);
            setLogs([]);
        }
    }, [datasetId]);

    // Apply duplicate filters
    const applyDuplicateFilters = useCallback(() => {
        let filtered = duplicates;

        if (filters.nodeType) {
            filtered = filtered.filter(group =>
                group.nodes.some(node => node.nodeType === filters.nodeType)
            );
        }

        if (filters.minSimilarity > 0) {
            filtered = filtered.filter(group =>
                group.nodes.some(node => node.similarity >= filters.minSimilarity)
            );
        }

        if (filters.searchTerm) {
            const term = filters.searchTerm.toLowerCase();
            filtered = filtered.filter(group =>
                group.canonicalName.toLowerCase().includes(term) ||
                group.nodes.some(node => node.label.toLowerCase().includes(term))
            );
        }

        setFilteredDuplicates(filtered);
    }, [duplicates, filters]);

    // Apply filters when they change
    useEffect(() => {
        applyDuplicateFilters();
    }, [applyDuplicateFilters]);

    // Load data on mount
    useEffect(() => {
        loadStats();
        loadLogs();
    }, [loadStats, loadLogs]);

    // Find duplicates
    const findDuplicates = useCallback(async () => {
        setIsFindingDuplicates(true);
        setError(null);

        try {
            const data = await graphApi.entityNormalization.findDuplicates(datasetId, {
                nodeType: config.nodeTypes.length === 1 ? config.nodeTypes[0] : undefined,
                threshold: config.similarityThreshold,
            });

            const duplicates = (data.duplicates || []).map(group => ({
                ...group,
                confidence: group.similarity || 0, // Use similarity as confidence
                similarity: group.similarity || 0
            }));
            setDuplicates(duplicates);
            setActiveTab('duplicates');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to find duplicates');
        } finally {
            setIsFindingDuplicates(false);
        }
    }, [datasetId, config]);

    // Start normalization
    const startNormalization = useCallback(async () => {
        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 10, 90));
            }, 500);

            const result = await graphApi.entityNormalization.normalize(datasetId, {
                nodeIds: selectedDuplicates.size > 0 ? Array.from(selectedDuplicates) : undefined,
                entityType: config.nodeTypes.length === 1 ? config.nodeTypes[0] as any : undefined,
                similarityThreshold: config.similarityThreshold,
                method: config.method,
                confidenceThreshold: config.confidenceThreshold,
            });

            clearInterval(progressInterval);
            setProgress(100);

            // Refresh data
            await Promise.all([loadStats(), loadLogs()]);

            onNormalizationComplete?.(result);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Normalization failed');
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    }, [datasetId, config, selectedDuplicates, loadStats, loadLogs, onNormalizationComplete]);

    // Merge duplicate nodes
    const mergeDuplicates = useCallback(async (sourceIds: string[], targetId: string) => {
        try {
            await graphApi.entityNormalization.mergeNodes(datasetId, {
                sourceIds,
                targetId,
            });

            // Refresh data
            await Promise.all([loadStats(), loadLogs(), findDuplicates()]);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Merge failed');
        }
    }, [datasetId, loadStats, loadLogs, findDuplicates]);

    // Toggle duplicate selection
    const toggleDuplicateSelection = useCallback((canonicalName: string) => {
        setSelectedDuplicates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(canonicalName)) {
                newSet.delete(canonicalName);
            } else {
                newSet.add(canonicalName);
            }
            return newSet;
        });
    }, []);

    // Select all visible duplicates
    const selectAllVisibleDuplicates = useCallback(() => {
        const visibleNames = filteredDuplicates.map(group => group.canonicalName);
        setSelectedDuplicates(new Set(visibleNames));
    }, [filteredDuplicates]);

    // Clear duplicate selection
    const clearDuplicateSelection = useCallback(() => {
        setSelectedDuplicates(new Set());
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Entity Normalization</h2>
                    <p className="text-gray-600">
                        Find and merge duplicate entities in your knowledge graph
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={loadStats} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="normalize">Normalize</TabsTrigger>
                    <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="stats">Statistics</TabsTrigger>
                </TabsList>

                {/* Normalize Tab */}
                <TabsContent value="normalize" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Normalization Configuration
                            </CardTitle>
                            <CardDescription>
                                Configure how entity normalization should work
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Node Types to Normalize</Label>
                                        <div className="space-y-2">
                                            {nodeTypes.map(type => (
                                                <div key={type.value} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={type.value}
                                                        checked={config.nodeTypes.includes(type.value)}
                                                        onCheckedChange={(checked) => {
                                                            setConfig(prev => ({
                                                                ...prev,
                                                                nodeTypes: checked
                                                                    ? [...prev.nodeTypes, type.value]
                                                                    : prev.nodeTypes.filter(t => t !== type.value)
                                                            }));
                                                        }}
                                                    />
                                                    <Label htmlFor={type.value}>{type.label}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Similarity Threshold</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={config.similarityThreshold}
                                            onChange={(e) => setConfig(prev => ({ ...prev, similarityThreshold: parseFloat(e.target.value) }))}
                                        />
                                        <p className="text-sm text-gray-600">
                                            Minimum similarity score to consider nodes as duplicates
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Normalization Method</Label>
                                        <Select
                                            value={config.method}
                                            onValueChange={(value) => setConfig(prev => ({ ...prev, method: value as any }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fuzzy_match">Fuzzy Matching</SelectItem>
                                                <SelectItem value="exact_match">Exact Matching</SelectItem>
                                                <SelectItem value="dictionary_match">Dictionary Matching</SelectItem>
                                                <SelectItem value="ml_suggestion">ML Suggestion</SelectItem>
                                                <SelectItem value="manual">Manual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Confidence Threshold</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={config.confidenceThreshold}
                                            onChange={(e) => setConfig(prev => ({ ...prev, confidenceThreshold: parseFloat(e.target.value) }))}
                                        />
                                        <p className="text-sm text-gray-600">
                                            Minimum confidence for automatic merging
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Batch Size</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="1000"
                                            value={config.batchSize}
                                            onChange={(e) => setConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                                        />
                                        <p className="text-sm text-gray-600">
                                            Number of nodes to process in each batch
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="autoMerge"
                                                checked={config.autoMerge}
                                                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoMerge: !!checked }))}
                                            />
                                            <Label htmlFor="autoMerge">Auto-merge high confidence matches</Label>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="dryRun"
                                                checked={config.dryRun}
                                                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, dryRun: !!checked }))}
                                            />
                                            <Label htmlFor="dryRun">Dry run (preview only)</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={findDuplicates}
                                    disabled={isFindingDuplicates}
                                    variant="outline"
                                    className="flex items-center gap-2"
                                >
                                    {isFindingDuplicates ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Search className="h-4 w-4" />
                                    )}
                                    Find Duplicates
                                </Button>

                                <Button
                                    onClick={startNormalization}
                                    disabled={isProcessing || config.nodeTypes.length === 0}
                                    className="flex items-center gap-2"
                                >
                                    {isProcessing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Merge className="h-4 w-4" />
                                    )}
                                    Start Normalization
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Progress */}
                    {isProcessing && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span>Normalizing entities...</span>
                                        <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={progress} className="w-full" />
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Duplicates Tab */}
                <TabsContent value="duplicates" className="space-y-6">
                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Filter className="h-5 w-5" />
                                Filters
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label>Search</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search duplicates..."
                                            value={filters.searchTerm}
                                            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Node Type</Label>
                                    <Select
                                        value={filters.nodeType}
                                        onValueChange={(value) => setFilters(prev => ({ ...prev, nodeType: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Types</SelectItem>
                                            {nodeTypes.map(type => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Min Similarity</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={filters.minSimilarity}
                                        onChange={(e) => setFilters(prev => ({ ...prev, minSimilarity: parseFloat(e.target.value) }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Date Range</Label>
                                    <Select
                                        value={filters.dateRange}
                                        onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All time" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Time</SelectItem>
                                            <SelectItem value="today">Today</SelectItem>
                                            <SelectItem value="week">This Week</SelectItem>
                                            <SelectItem value="month">This Month</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bulk Actions */}
                    {selectedDuplicates.size > 0 && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {selectedDuplicates.size} selected
                                        </span>
                                        <Button variant="ghost" size="sm" onClick={clearDuplicateSelection}>
                                            Clear
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={selectAllVisibleDuplicates}
                                        >
                                            Select All Visible
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Duplicates List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">
                                Duplicate Groups ({filteredDuplicates.length})
                            </h3>
                        </div>

                        {filteredDuplicates.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                    <h3 className="text-lg font-medium mb-2">No duplicates found</h3>
                                    <p className="text-gray-600">
                                        {duplicates.length === 0
                                            ? "No duplicate entities found. Try adjusting your similarity threshold."
                                            : "No duplicates match your current filters."
                                        }
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredDuplicates.map((group) => (
                                <Card key={group.canonicalName} className={`${selectedDuplicates.has(group.canonicalName) ? 'ring-2 ring-blue-500' : ''}`}>
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4 flex-1">
                                                <Checkbox
                                                    checked={selectedDuplicates.has(group.canonicalName)}
                                                    onCheckedChange={() => toggleDuplicateSelection(group.canonicalName)}
                                                />

                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <h3 className="text-lg font-semibold">{group.canonicalName}</h3>
                                                        <Badge variant="outline">{group.nodes.length} duplicates</Badge>
                                                        <Badge
                                                            variant={(group.confidence || 0) > 0.8 ? 'default' : (group.confidence || 0) > 0.6 ? 'secondary' : 'destructive'}
                                                        >
                                                            {((group.confidence || 0) * 100).toFixed(0)}% confidence
                                                        </Badge>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {group.nodes.map((node, index) => (
                                                            <div key={node.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                                                <Badge variant="outline">{node.nodeType}</Badge>
                                                                <span className="font-medium">{node.label}</span>
                                                                <Badge variant="secondary">
                                                                    {(group.similarity * 100).toFixed(0)}% similar
                                                                </Badge>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        // In a real implementation, this would open a node details modal
                                                                        console.log('View node:', node);
                                                                    }}
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="text-sm text-gray-600">
                                                        Suggested canonical: <strong>{group.suggestedCanonical}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        // Merge all nodes into the first one
                                                        const targetNode = group.nodes[0];
                                                        const sourceNodes = group.nodes.slice(1);
                                                        mergeDuplicates(
                                                            sourceNodes.map(n => n.id),
                                                            targetNode.id
                                                        );
                                                    }}
                                                >
                                                    <Merge className="h-4 w-4" />
                                                    Merge All
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                Normalization Logs
                            </CardTitle>
                            <CardDescription>
                                Recent normalization activities and their results
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {(logs || []).length === 0 ? (
                                    <div className="text-center py-8">
                                        <Activity className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                        <h3 className="text-lg font-medium mb-2">No logs found</h3>
                                        <p className="text-gray-600">
                                            Normalization logs will appear here after running normalization tasks.
                                        </p>
                                    </div>
                                ) : (
                                    (logs || []).map((log) => (
                                        <div key={log.id} className="flex items-center gap-4 p-4 border rounded-lg">
                                            <div className={`w-2 h-2 rounded-full ${log.action === 'merge' ? 'bg-green-500' :
                                                log.action === 'update' ? 'bg-blue-500' :
                                                    log.action === 'create_alias' ? 'bg-yellow-500' :
                                                        'bg-gray-500'
                                                }`} />

                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{log.action}</Badge>
                                                    <span className="text-sm text-gray-600">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-700 mt-1">
                                                    {log.details?.description || `Performed ${log.action} operation`}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Statistics Tab */}
                <TabsContent value="stats" className="space-y-6">
                    {stats ? (
                        <div className="space-y-6">
                            {/* Overview Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="text-2xl font-bold">{stats?.totalNormalizations || 0}</div>
                                        <div className="text-sm text-gray-600">Total Normalizations</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="text-2xl font-bold">{stats?.mergedNodes || 0}</div>
                                        <div className="text-sm text-gray-600">Merged Nodes</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="text-2xl font-bold">{stats?.updatedNodes || 0}</div>
                                        <div className="text-sm text-gray-600">Updated Nodes</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="text-2xl font-bold">{stats?.createdAliases || 0}</div>
                                        <div className="text-sm text-gray-600">Created Aliases</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Method Distribution */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <BarChart3 className="h-5 w-5" />
                                        Normalization Methods
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {stats?.byMethod ? Object.entries(stats.byMethod).map(([method, count]) => (
                                            <div key={method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium capitalize">{method}</span>
                                                <Badge variant="outline">{count}</Badge>
                                            </div>
                                        )) : (
                                            <div className="text-sm text-gray-500">No method data available</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Type Distribution */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Target className="h-5 w-5" />
                                        Entity Types
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {stats?.byType ? Object.entries(stats.byType).map(([type, count]) => (
                                            <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">{type}</span>
                                                <Badge variant="outline">{count}</Badge>
                                            </div>
                                        )) : (
                                            <div className="text-sm text-gray-500">No type data available</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Recent Activity */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Clock className="h-5 w-5" />
                                        Recent Activity
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {stats?.recentActivity ? stats.recentActivity.slice(0, 10).map((log) => (
                                            <div key={log.id} className="flex items-center gap-3 p-2 text-sm">
                                                <Badge variant="outline" className="text-xs">{log.action}</Badge>
                                                <span className="text-gray-600">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </span>
                                                <span className="text-gray-500">
                                                    {log.details?.description || 'Normalization activity'}
                                                </span>
                                            </div>
                                        )) : (
                                            <div className="text-sm text-gray-500">No recent activity</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="p-8 text-center">
                                <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <h3 className="text-lg font-medium mb-2">No statistics available</h3>
                                <p className="text-gray-600">
                                    Statistics will appear here after running normalization tasks.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};
