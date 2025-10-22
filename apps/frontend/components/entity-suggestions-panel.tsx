'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Lightbulb,
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
    Search,
    Download,
    Upload
} from 'lucide-react';
import { graphApi } from '@/lib/api';

interface EntitySuggestion {
    id: string;
    entityType: string;
    canonicalName: string;
    description?: string;
    category?: string;
    tags?: string[];
    aliases?: string[];
    confidence: number;
    source: 'llm_suggested' | 'auto_discovered' | 'pattern_based';
    reasoning?: string;
    context?: string[];
    frequency: number;
    suggestedAt: string;
    status: 'pending' | 'approved' | 'rejected' | 'modified';
    metadata?: any;
}

interface SuggestionFilters {
    entityType: string;
    source: string;
    minConfidence: number;
    status: string;
    searchTerm: string;
}

interface BulkAction {
    type: 'approve' | 'reject' | 'modify' | 'delete';
    entityIds: string[];
}

export const EntitySuggestionsPanel: React.FC<{
    datasetId: string;
    onSuggestionApproved?: (suggestion: EntitySuggestion) => void;
    onSuggestionRejected?: (suggestion: EntitySuggestion) => void;
}> = ({ datasetId, onSuggestionApproved, onSuggestionRejected }) => {
    const [suggestions, setSuggestions] = useState<EntitySuggestion[]>([]);
    const [filteredSuggestions, setFilteredSuggestions] = useState<EntitySuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
    const [editingSuggestion, setEditingSuggestion] = useState<EntitySuggestion | null>(null);
    const [filters, setFilters] = useState<SuggestionFilters>({
        entityType: 'ALL',
        source: '',
        minConfidence: 0,
        status: 'pending',
        searchTerm: '',
    });
    const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    // Load suggestions
    const loadSuggestions = useCallback(async () => {
        setLoading(true);
        try {
            const data = await graphApi.entityDictionary.getSuggestions(datasetId);
            setSuggestions(data);
        } catch (error) {
            console.error('Failed to load suggestions:', error);
        } finally {
            setLoading(false);
        }
    }, [datasetId]);

    // Apply filters
    const applyFilters = useCallback(() => {
        let filtered = suggestions;

        if (filters.entityType && filters.entityType !== 'ALL') {
            filtered = filtered.filter(s => s.entityType === filters.entityType);
        }

        if (filters.source && filters.source !== 'ALL') {
            filtered = filtered.filter(s => s.source === filters.source);
        }

        if (filters.minConfidence > 0) {
            filtered = filtered.filter(s => s.confidence >= filters.minConfidence);
        }

        if (filters.status && filters.status !== 'ALL') {
            filtered = filtered.filter(s => s.status === filters.status);
        }

        if (filters.searchTerm) {
            const term = filters.searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                s.canonicalName.toLowerCase().includes(term) ||
                s.description?.toLowerCase().includes(term) ||
                s.category?.toLowerCase().includes(term) ||
                s.tags?.some(tag => tag.toLowerCase().includes(term)) ||
                s.aliases?.some(alias => alias.toLowerCase().includes(term))
            );
        }

        setFilteredSuggestions(filtered);
    }, [suggestions, filters]);

    // Load suggestions on mount and when filters change
    useEffect(() => {
        loadSuggestions();
    }, [loadSuggestions]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    // Handle suggestion approval
    const handleApproveSuggestion = useCallback(async (suggestion: EntitySuggestion) => {
        try {
            await graphApi.entityDictionary.createEntity(datasetId, {
                entityType: suggestion.entityType,
                canonicalName: suggestion.canonicalName,
                description: suggestion.description,
                category: suggestion.category,
                tags: suggestion.tags,
                aliases: suggestion.aliases,
                confidenceScore: suggestion.confidence,
                source: 'manual', // Mark as manually approved
                metadata: suggestion.metadata,
            });

            // Update local state
            setSuggestions(prev => prev.map(s =>
                s.id === suggestion.id ? { ...s, status: 'approved' } : s
            ));

            onSuggestionApproved?.(suggestion);
        } catch (error) {
            console.error('Failed to approve suggestion:', error);
        }
    }, [datasetId, onSuggestionApproved]);

    // Handle suggestion rejection
    const handleRejectSuggestion = useCallback(async (suggestion: EntitySuggestion) => {
        try {
            // In a real implementation, this would call an API to mark as rejected
            setSuggestions(prev => prev.map(s =>
                s.id === suggestion.id ? { ...s, status: 'rejected' } : s
            ));

            onSuggestionRejected?.(suggestion);
        } catch (error) {
            console.error('Failed to reject suggestion:', error);
        }
    }, [onSuggestionRejected]);

    // Handle suggestion modification
    const handleModifySuggestion = useCallback(async (modifiedSuggestion: EntitySuggestion) => {
        try {
            await graphApi.entityDictionary.createEntity(datasetId, {
                entityType: modifiedSuggestion.entityType,
                canonicalName: modifiedSuggestion.canonicalName,
                description: modifiedSuggestion.description,
                category: modifiedSuggestion.category,
                tags: modifiedSuggestion.tags,
                aliases: modifiedSuggestion.aliases,
                confidenceScore: modifiedSuggestion.confidence,
                source: 'manual',
                metadata: modifiedSuggestion.metadata,
            });

            // Update local state
            setSuggestions(prev => prev.map(s =>
                s.id === modifiedSuggestion.id ? { ...modifiedSuggestion, status: 'approved' } : s
            ));

            setEditingSuggestion(null);
            onSuggestionApproved?.(modifiedSuggestion);
        } catch (error) {
            console.error('Failed to modify suggestion:', error);
        }
    }, [datasetId, onSuggestionApproved]);

    // Handle bulk actions
    const handleBulkAction = useCallback(async (action: BulkAction) => {
        setIsProcessing(true);
        setProgress(0);

        try {
            const selectedSuggestions = suggestions.filter(s => action.entityIds.includes(s.id));

            for (let i = 0; i < selectedSuggestions.length; i++) {
                const suggestion = selectedSuggestions[i];

                switch (action.type) {
                    case 'approve':
                        await handleApproveSuggestion(suggestion);
                        break;
                    case 'reject':
                        await handleRejectSuggestion(suggestion);
                        break;
                    case 'delete':
                        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
                        break;
                }

                setProgress((i + 1) / selectedSuggestions.length * 100);
            }

            setSelectedSuggestions(new Set());
            setBulkAction(null);
        } catch (error) {
            console.error('Bulk action failed:', error);
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    }, [suggestions, handleApproveSuggestion, handleRejectSuggestion]);

    // Toggle selection
    const toggleSelection = useCallback((suggestionId: string) => {
        setSelectedSuggestions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(suggestionId)) {
                newSet.delete(suggestionId);
            } else {
                newSet.add(suggestionId);
            }
            return newSet;
        });
    }, []);

    // Select all visible
    const selectAllVisible = useCallback(() => {
        const visibleIds = filteredSuggestions.map(s => s.id);
        setSelectedSuggestions(new Set(visibleIds));
    }, [filteredSuggestions]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedSuggestions(new Set());
    }, []);

    // Get suggestion statistics
    const getStatistics = useCallback(() => {
        const total = suggestions.length;
        const pending = suggestions.filter(s => s.status === 'pending').length;
        const approved = suggestions.filter(s => s.status === 'approved').length;
        const rejected = suggestions.filter(s => s.status === 'rejected').length;
        const avgConfidence = suggestions.length > 0
            ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
            : 0;

        return { total, pending, approved, rejected, avgConfidence };
    }, [suggestions]);

    const stats = getStatistics();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading suggestions...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Entity Suggestions</h2>
                    <p className="text-gray-600">
                        Review and approve LLM-suggested entities for your dataset
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={loadSuggestions} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-sm text-gray-600">Total</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                        <div className="text-sm text-gray-600">Pending</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                        <div className="text-sm text-gray-600">Approved</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                        <div className="text-sm text-gray-600">Rejected</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-2xl font-bold">{stats.avgConfidence.toFixed(2)}</div>
                        <div className="text-sm text-gray-600">Avg Confidence</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="space-y-2">
                            <Label>Search</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search suggestions..."
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
                            <Label>Source</Label>
                            <Select
                                value={filters.source}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, source: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All sources" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Sources</SelectItem>
                                    <SelectItem value="llm_suggested">LLM Suggested</SelectItem>
                                    <SelectItem value="auto_discovered">Auto Discovered</SelectItem>
                                    <SelectItem value="pattern_based">Pattern Based</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={filters.status}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="modified">Modified</SelectItem>
                                </SelectContent>
                            </Select>
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
            {selectedSuggestions.size > 0 && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                    {selectedSuggestions.size} selected
                                </span>
                                <Button variant="ghost" size="sm" onClick={clearSelection}>
                                    Clear
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBulkAction({
                                        type: 'approve',
                                        entityIds: Array.from(selectedSuggestions)
                                    })}
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    Approve
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBulkAction({
                                        type: 'reject',
                                        entityIds: Array.from(selectedSuggestions)
                                    })}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Reject
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBulkAction({
                                        type: 'delete',
                                        entityIds: Array.from(selectedSuggestions)
                                    })}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Suggestions List */}
            <div className="space-y-4">
                {filteredSuggestions.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <Lightbulb className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                            <h3 className="text-lg font-medium mb-2">No suggestions found</h3>
                            <p className="text-gray-600">
                                {suggestions.length === 0
                                    ? "No entity suggestions available. Try running auto-discovery or wait for LLM suggestions."
                                    : "No suggestions match your current filters."
                                }
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredSuggestions.map((suggestion) => (
                        <Card key={suggestion.id} className={`${selectedSuggestions.has(suggestion.id) ? 'ring-2 ring-blue-500' : ''}`}>
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4 flex-1">
                                        <Checkbox
                                            checked={selectedSuggestions.has(suggestion.id)}
                                            onCheckedChange={() => toggleSelection(suggestion.id)}
                                        />

                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline">{suggestion.entityType}</Badge>
                                                <h3 className="text-lg font-semibold">{suggestion.canonicalName}</h3>
                                                <Badge
                                                    variant={suggestion.confidence > 0.8 ? 'default' : suggestion.confidence > 0.6 ? 'secondary' : 'destructive'}
                                                >
                                                    {(suggestion.confidence * 100).toFixed(0)}%
                                                </Badge>
                                                <Badge variant="outline">{suggestion.source}</Badge>
                                            </div>

                                            {suggestion.description && (
                                                <p className="text-gray-600">{suggestion.description}</p>
                                            )}

                                            {suggestion.category && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">Category:</span>
                                                    <Badge variant="secondary">{suggestion.category}</Badge>
                                                </div>
                                            )}

                                            {suggestion.tags && suggestion.tags.length > 0 && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium">Tags:</span>
                                                    {suggestion.tags.map((tag, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            {suggestion.aliases && suggestion.aliases.length > 0 && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium">Aliases:</span>
                                                    {suggestion.aliases.map((alias, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs">
                                                            {alias}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}

                                            {suggestion.reasoning && (
                                                <div className="bg-gray-50 p-3 rounded-md">
                                                    <p className="text-sm text-gray-700">
                                                        <strong>Reasoning:</strong> {suggestion.reasoning}
                                                    </p>
                                                </div>
                                            )}

                                            {suggestion.context && suggestion.context.length > 0 && (
                                                <div className="bg-blue-50 p-3 rounded-md">
                                                    <p className="text-sm text-blue-700">
                                                        <strong>Context:</strong> {suggestion.context.join(', ')}
                                                    </p>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                                <span>Frequency: {suggestion.frequency}</span>
                                                <span>Suggested: {new Date(suggestion.suggestedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditingSuggestion(suggestion)}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleApproveSuggestion(suggestion)}
                                        >
                                            <CheckCircle className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleRejectSuggestion(suggestion)}
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Edit Suggestion Modal */}
            {editingSuggestion && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h3 className="text-lg font-semibold">Edit Suggestion</h3>
                            <Button variant="ghost" size="sm" onClick={() => setEditingSuggestion(null)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Entity Type</Label>
                                        <Select
                                            value={editingSuggestion.entityType}
                                            onValueChange={(value) => setEditingSuggestion(prev => prev ? { ...prev, entityType: value } : null)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
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
                                        <Label>Canonical Name</Label>
                                        <Input
                                            value={editingSuggestion.canonicalName}
                                            onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, canonicalName: e.target.value } : null)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Textarea
                                        value={editingSuggestion.description || ''}
                                        onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, description: e.target.value } : null)}
                                        rows={3}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Category</Label>
                                        <Input
                                            value={editingSuggestion.category || ''}
                                            onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, category: e.target.value } : null)}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Confidence</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={editingSuggestion.confidence}
                                            onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, confidence: parseFloat(e.target.value) } : null)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Tags (comma-separated)</Label>
                                    <Input
                                        value={editingSuggestion.tags?.join(', ') || ''}
                                        onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, tags: e.target.value.split(',').map(t => t.trim()) } : null)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Aliases (comma-separated)</Label>
                                    <Input
                                        value={editingSuggestion.aliases?.join(', ') || ''}
                                        onChange={(e) => setEditingSuggestion(prev => prev ? { ...prev, aliases: e.target.value.split(',').map(a => a.trim()) } : null)}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <Button variant="outline" onClick={() => setEditingSuggestion(null)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => handleModifySuggestion(editingSuggestion)}>
                                    Save & Approve
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Action Confirmation */}
            {bulkAction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4">Confirm Bulk Action</h3>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to {bulkAction.type} {bulkAction.entityIds.length} suggestions?
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setBulkAction(null)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => handleBulkAction(bulkAction)}>
                                    Confirm
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress */}
            {isProcessing && (
                <Card>
                    <CardContent className="p-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Processing bulk action...</span>
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
