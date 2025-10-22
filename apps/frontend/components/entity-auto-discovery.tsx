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
    Search,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Eye,
    Trash2,
    Plus,
    X,
    RefreshCw,
    Filter,
    Download,
    Upload,
    Wand2,
    Target,
    BarChart3,
    Settings
} from 'lucide-react';
import { graphApi } from '@/lib/api';

interface DiscoveryConfig {
    minFrequency: number;
    minConfidence: number;
    entityTypes: string[];
    includeAliases: boolean;
    aliasThreshold: number;
    groupSimilar: boolean;
    similarityThreshold: number;
    maxEntities: number;
}

interface DiscoveredEntity {
    id: string;
    entityType: string;
    canonicalName: string;
    frequency: number;
    confidence: number;
    aliases: string[];
    contexts: string[];
    sampleNodes: Array<{
        id: string;
        label: string;
        properties?: any;
    }>;
    suggestedAliases: string[];
    metadata: any;
}

interface DiscoveryResult {
    entities: DiscoveredEntity[];
    statistics: {
        totalNodes: number;
        uniqueEntities: number;
        byType: Record<string, number>;
        avgConfidence: number;
        processingTime: number;
    };
    suggestions: Array<{
        type: 'merge' | 'split' | 'alias';
        entities: string[];
        reason: string;
        confidence: number;
    }>;
}

interface DiscoveryFilters {
    entityType: string;
    minFrequency: number;
    minConfidence: number;
    searchTerm: string;
}

export const EntityAutoDiscovery: React.FC<{
    datasetId: string;
    onDiscoveryComplete?: (result: DiscoveryResult) => void;
}> = ({ datasetId, onDiscoveryComplete }) => {
    const [step, setStep] = useState<'config' | 'analyze' | 'review' | 'import'>('config');
    const [config, setConfig] = useState<DiscoveryConfig>({
        minFrequency: 2,
        minConfidence: 0.6,
        entityTypes: [],
        includeAliases: true,
        aliasThreshold: 0.8,
        groupSimilar: true,
        similarityThreshold: 0.85,
        maxEntities: 1000,
    });
    const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
    const [filteredEntities, setFilteredEntities] = useState<DiscoveredEntity[]>([]);
    const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState<DiscoveryFilters>({
        entityType: 'ALL',
        minFrequency: 0,
        minConfidence: 0,
        searchTerm: '',
    });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Available entity types
    const entityTypes = [
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

    // Apply filters
    const applyFilters = useCallback(() => {
        if (!discoveryResult) return;

        let filtered = discoveryResult.entities;

        if (filters.entityType && filters.entityType !== 'ALL') {
            filtered = filtered.filter(e => e.entityType === filters.entityType);
        }

        if (filters.minFrequency > 0) {
            filtered = filtered.filter(e => e.frequency >= filters.minFrequency);
        }

        if (filters.minConfidence > 0) {
            filtered = filtered.filter(e => e.confidence >= filters.minConfidence);
        }

        if (filters.searchTerm) {
            const term = filters.searchTerm.toLowerCase();
            filtered = filtered.filter(e =>
                e.canonicalName.toLowerCase().includes(term) ||
                e.aliases.some(alias => alias.toLowerCase().includes(term)) ||
                e.contexts.some(context => context.toLowerCase().includes(term))
            );
        }

        setFilteredEntities(filtered);
    }, [discoveryResult, filters]);

    // Apply filters when they change
    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    // Start discovery analysis
    const startDiscovery = useCallback(async () => {
        setIsAnalyzing(true);
        setProgress(0);
        setError(null);

        try {
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 10, 90));
            }, 500);

            const entities = await graphApi.entityDictionary.autoDiscover(datasetId);

            clearInterval(progressInterval);
            setProgress(100);

            // Transform the API response to match the expected DiscoveryResult structure
            const transformedEntities = (entities || []).map(entity => ({
                id: entity.id,
                entityType: entity.entityType,
                canonicalName: entity.canonicalName,
                frequency: entity.metadata?.usage_count || 1,
                confidence: entity.confidenceScore || 0.8,
                aliases: entity.aliases || [],
                contexts: [],
                sampleNodes: [],
                suggestedAliases: [],
                metadata: entity.metadata || {}
            }));

            const result: DiscoveryResult = {
                entities: transformedEntities,
                statistics: {
                    totalNodes: transformedEntities.length,
                    uniqueEntities: transformedEntities.length,
                    byType: transformedEntities.reduce((acc, entity) => {
                        acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>),
                    avgConfidence: transformedEntities.reduce((sum, entity) => sum + entity.confidence, 0) / (transformedEntities.length || 1),
                    processingTime: 0
                },
                suggestions: []
            };

            // Show appropriate message based on results
            if (transformedEntities.length === 0) {
                setError('No new entities found. All graph nodes already exist as entities in the dictionary.');
            }

            setDiscoveryResult(result);
            setStep('review');
            onDiscoveryComplete?.(result);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Discovery failed');
        } finally {
            setIsAnalyzing(false);
            setProgress(0);
        }
    }, [datasetId, onDiscoveryComplete]);

    // Import selected entities
    const importSelectedEntities = useCallback(async () => {
        if (!discoveryResult || selectedEntities.size === 0) return;

        setIsImporting(true);
        setProgress(0);

        try {
            const entitiesToImport = discoveryResult.entities.filter(e => selectedEntities.has(e.id));

            const importData = entitiesToImport.map(entity => ({
                entityType: entity.entityType,
                canonicalName: entity.canonicalName,
                description: `Auto-discovered from ${entity.frequency} occurrences`,
                category: 'auto_discovered',
                tags: entity.contexts.slice(0, 3), // Use top contexts as tags
                aliases: entity.aliases,
                confidence: entity.confidence,
                source: 'auto_discovered' as const,
                metadata: {
                    frequency: entity.frequency,
                    contexts: entity.contexts,
                    sampleNodes: entity.sampleNodes,
                    discoveredAt: new Date().toISOString(),
                },
            }));

            const result = await graphApi.entityDictionary.bulkImport(datasetId, {
                entities: importData,
                source: 'auto_discovered',
                options: {
                    skipDuplicates: true,
                    updateExisting: false,
                    defaultConfidence: 0.8,
                },
            });

            setProgress(100);
            setStep('import');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Import failed');
        } finally {
            setIsImporting(false);
            setProgress(0);
        }
    }, [discoveryResult, selectedEntities, datasetId]);

    // Toggle entity selection
    const toggleEntitySelection = useCallback((entityId: string) => {
        setSelectedEntities(prev => {
            const newSet = new Set(prev);
            if (newSet.has(entityId)) {
                newSet.delete(entityId);
            } else {
                newSet.add(entityId);
            }
            return newSet;
        });
    }, []);

    // Select all visible entities
    const selectAllVisible = useCallback(() => {
        const visibleIds = filteredEntities.map(e => e.id);
        setSelectedEntities(new Set(visibleIds));
    }, [filteredEntities]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedEntities(new Set());
    }, []);

    // Reset wizard
    const resetWizard = useCallback(() => {
        setStep('config');
        setDiscoveryResult(null);
        setSelectedEntities(new Set());
        setError(null);
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Entity Auto-Discovery</h2>
                    <p className="text-gray-600">
                        Automatically discover entities from your existing graph data
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={resetWizard} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center space-x-4">
                {['config', 'analyze', 'review', 'import'].map((stepName, index) => (
                    <div key={stepName} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === stepName
                            ? 'bg-blue-600 text-white'
                            : ['config', 'analyze', 'review', 'import'].indexOf(step) > index
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}>
                            {index + 1}
                        </div>
                        <span className={`ml-2 text-sm ${step === stepName ? 'text-blue-600 font-medium' : 'text-gray-600'
                            }`}>
                            {stepName.charAt(0).toUpperCase() + stepName.slice(1)}
                        </span>
                        {index < 3 && (
                            <div className={`w-8 h-0.5 ml-4 ${['config', 'analyze', 'review', 'import'].indexOf(step) > index
                                ? 'bg-green-600'
                                : 'bg-gray-200'
                                }`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Error Display */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Step 1: Configuration */}
            {step === 'config' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Discovery Configuration
                        </CardTitle>
                        <CardDescription>
                            Configure how the auto-discovery should analyze your graph data
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Minimum Frequency</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={config.minFrequency}
                                        onChange={(e) => setConfig(prev => ({ ...prev, minFrequency: parseInt(e.target.value) }))}
                                    />
                                    <p className="text-sm text-gray-600">
                                        Only include entities that appear at least this many times
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Minimum Confidence</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={config.minConfidence}
                                        onChange={(e) => setConfig(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                                    />
                                    <p className="text-sm text-gray-600">
                                        Minimum confidence score for entity recognition
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Maximum Entities</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={config.maxEntities}
                                        onChange={(e) => setConfig(prev => ({ ...prev, maxEntities: parseInt(e.target.value) }))}
                                    />
                                    <p className="text-sm text-gray-600">
                                        Maximum number of entities to discover
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Entity Types to Include</Label>
                                    <div className="space-y-2">
                                        {entityTypes.map(type => (
                                            <div key={type.value} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={type.value}
                                                    checked={config.entityTypes.includes(type.value)}
                                                    onCheckedChange={(checked) => {
                                                        setConfig(prev => ({
                                                            ...prev,
                                                            entityTypes: checked
                                                                ? [...prev.entityTypes, type.value]
                                                                : prev.entityTypes.filter(t => t !== type.value)
                                                        }));
                                                    }}
                                                />
                                                <Label htmlFor={type.value}>{type.label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="includeAliases"
                                            checked={config.includeAliases}
                                            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeAliases: !!checked }))}
                                        />
                                        <Label htmlFor="includeAliases">Include alias discovery</Label>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        Automatically discover alternative names for entities
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="groupSimilar"
                                            checked={config.groupSimilar}
                                            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, groupSimilar: !!checked }))}
                                        />
                                        <Label htmlFor="groupSimilar">Group similar entities</Label>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        Merge entities with similar names
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={startDiscovery} className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4" />
                                Start Discovery
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Analysis */}
            {step === 'analyze' && (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Loader2 className="h-12 w-12 mx-auto animate-spin text-blue-600 mb-4" />
                        <h3 className="text-lg font-medium mb-2">Analyzing Graph Data</h3>
                        <p className="text-gray-600 mb-4">
                            Discovering entities from your existing graph nodes...
                        </p>
                        <Progress value={progress} className="w-full max-w-md mx-auto" />
                        <p className="text-sm text-gray-500 mt-2">{progress}% complete</p>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Review Results */}
            {step === 'review' && discoveryResult && (
                <div className="space-y-6">
                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-2xl font-bold">{discoveryResult.statistics?.totalNodes || 0}</div>
                                <div className="text-sm text-gray-600">Total Nodes</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-2xl font-bold">{discoveryResult.statistics?.uniqueEntities || discoveryResult.entities?.length || 0}</div>
                                <div className="text-sm text-gray-600">Unique Entities</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-2xl font-bold">{discoveryResult.statistics?.avgConfidence?.toFixed(2) || '0.00'}</div>
                                <div className="text-sm text-gray-600">Avg Confidence</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-2xl font-bold">{discoveryResult.statistics?.processingTime || 0}s</div>
                                <div className="text-sm text-gray-600">Processing Time</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Entity Type Distribution */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" />
                                Entity Type Distribution
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {discoveryResult.statistics?.byType ? Object.entries(discoveryResult.statistics.byType).map(([type, count]) => (
                                    <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="font-medium">{type}</span>
                                        <Badge variant="outline">{count}</Badge>
                                    </div>
                                )) : (
                                    <div className="text-sm text-gray-500">No type distribution data available</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

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
                                            placeholder="Search entities..."
                                            value={filters.searchTerm}
                                            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Entity Type</Label>
                                    <Select
                                        value={filters.entityType}
                                        onValueChange={(value) => setFilters(prev => ({ ...prev, entityType: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Types</SelectItem>
                                            {entityTypes.map(type => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Min Frequency</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={filters.minFrequency}
                                        onChange={(e) => setFilters(prev => ({ ...prev, minFrequency: parseInt(e.target.value) }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Min Confidence</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={filters.minConfidence}
                                        onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bulk Actions */}
                    {selectedEntities.size > 0 && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {selectedEntities.size} selected
                                        </span>
                                        <Button variant="ghost" size="sm" onClick={clearSelection}>
                                            Clear
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={selectAllVisible}
                                        >
                                            Select All Visible
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Discovered Entities */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">
                                Discovered Entities ({filteredEntities.length})
                            </h3>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={selectAllVisible}
                                    variant="outline"
                                    size="sm"
                                >
                                    Select All
                                </Button>
                                <Button
                                    onClick={importSelectedEntities}
                                    disabled={selectedEntities.size === 0}
                                    className="flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    Import Selected ({selectedEntities.size})
                                </Button>
                            </div>
                        </div>

                        {filteredEntities.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                    <h3 className="text-lg font-medium mb-2">No entities found</h3>
                                    <p className="text-gray-600">
                                        Try adjusting your filters to see more results.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredEntities.map((entity) => (
                                <Card key={entity.id} className={`${selectedEntities.has(entity.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4 flex-1">
                                                <Checkbox
                                                    checked={selectedEntities.has(entity.id)}
                                                    onCheckedChange={() => toggleEntitySelection(entity.id)}
                                                />

                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline">{entity.entityType}</Badge>
                                                        <h3 className="text-lg font-semibold">{entity.canonicalName}</h3>
                                                        <Badge
                                                            variant={entity.confidence > 0.8 ? 'default' : entity.confidence > 0.6 ? 'secondary' : 'destructive'}
                                                        >
                                                            {(entity.confidence * 100).toFixed(0)}%
                                                        </Badge>
                                                        <Badge variant="outline">Frequency: {entity.frequency}</Badge>
                                                    </div>

                                                    {entity.aliases && entity.aliases.length > 0 && (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-medium">Aliases:</span>
                                                            {entity.aliases.map((alias, index) => (
                                                                <Badge key={index} variant="outline" className="text-xs">
                                                                    {typeof alias === 'string' ? alias : alias.alias || alias}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {entity.contexts && entity.contexts.length > 0 && (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-medium">Contexts:</span>
                                                            {entity.contexts.slice(0, 3).map((context, index) => (
                                                                <Badge key={index} variant="secondary" className="text-xs">
                                                                    {context}
                                                                </Badge>
                                                            ))}
                                                            {entity.contexts.length > 3 && (
                                                                <span className="text-xs text-gray-500">
                                                                    +{entity.contexts.length - 3} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="text-sm text-gray-500">
                                                        Sample nodes: {entity.sampleNodes?.length || 0}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>

                    {/* Suggestions */}
                    {discoveryResult.suggestions && discoveryResult.suggestions.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Target className="h-5 w-5" />
                                    Suggestions
                                </CardTitle>
                                <CardDescription>
                                    AI-powered suggestions for improving your entity dictionary
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {discoveryResult.suggestions.map((suggestion, index) => (
                                        <Alert key={index}>
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertDescription>
                                                <strong>{suggestion.type.toUpperCase()}:</strong> {suggestion.reason}
                                                <br />
                                                <span className="text-sm text-gray-600">
                                                    Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                                                </span>
                                            </AlertDescription>
                                        </Alert>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setStep('config')}>
                            Back to Config
                        </Button>
                        <Button
                            onClick={importSelectedEntities}
                            disabled={selectedEntities.size === 0}
                            className="flex items-center gap-2"
                        >
                            <Upload className="h-4 w-4" />
                            Import Selected ({selectedEntities.size})
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 4: Import Complete */}
            {step === 'import' && (
                <Card>
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                        <h3 className="text-lg font-medium mb-2">Import Complete!</h3>
                        <p className="text-gray-600 mb-4">
                            Successfully imported {selectedEntities.size} entities to your dictionary.
                        </p>
                        <div className="flex justify-center gap-2">
                            <Button variant="outline" onClick={resetWizard}>
                                Start New Discovery
                            </Button>
                            <Button onClick={() => window.location.reload()}>
                                View Dictionary
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Progress for Import */}
            {isImporting && (
                <Card>
                    <CardContent className="p-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Importing entities...</span>
                                <span>{progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={progress} className="w-full" />
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
