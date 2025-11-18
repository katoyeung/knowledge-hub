"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    Plus,
    Edit,
    Trash2,
    Download,
    X,
    Sparkles,
    RefreshCw
} from "lucide-react";
import { graphApi } from "@/lib/api";
import { useToast } from "@/components/ui/simple-toast";
import { EntityGenerator } from "./entity-generator";
import { EntityDiscovery } from "./entity-discovery";
import { DuplicateEntitiesModal } from "./duplicate-entities-modal";

interface Entity {
    id: string;
    entityType: string;
    canonicalName: string;
    confidenceScore: number;
    source: string;
    metadata?: {
        description?: string;
        category?: string;
        tags?: string[];
        usage_count?: number;
        last_used?: string;
    };
    aliases?: Array<{
        id: string;
        alias: string;
        similarityScore: number;
        matchCount: number;
    }>;
    createdAt: string;
    updatedAt: string;
}

interface EntityStatistics {
    totalEntities: number;
    entitiesByType: Record<string, number>;
    entitiesBySource: Record<string, number>;
    topEntities: Array<{
        entity: Entity;
        usageCount: number;
        lastUsed?: string;
    }>;
    recentActivity: Array<{
        entity: Entity;
        action: string;
        timestamp: string;
    }>;
}

interface EntityDictionaryManagerProps {
    datasetId: string;
}

export function EntityDictionaryManager({ datasetId }: EntityDictionaryManagerProps) {
    const { success, error: showError } = useToast();
    const [entities, setEntities] = useState<Entity[]>([]);
    const [statistics, setStatistics] = useState<EntityStatistics | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [entityTypeFilter, setEntityTypeFilter] = useState<string>("ALL");
    const [sourceFilter, setSourceFilter] = useState<string>("ALL");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [pageSize] = useState(20);

    // Selection states
    const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalEntities, setTotalEntities] = useState(0);

    // Delete dialog states
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteType, setDeleteType] = useState<'page' | 'all'>('page');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Dialog states
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
    const [showGenerateEntityModal, setShowGenerateEntityModal] = useState(false);
    const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        entityType: "",
        canonicalName: "",
        confidenceScore: 0.8,
        source: "manual",
        description: "",
        category: "",
        tags: [] as string[],
        aliases: [] as string[],
    });

    const [newTag, setNewTag] = useState("");
    const [newAlias, setNewAlias] = useState("");

    // Load entities
    const loadEntities = useCallback(async () => {
        try {
            setLoading(true);
            const response = await graphApi.entityDictionary.getEntities(datasetId, {
                searchTerm: searchTerm || undefined,
                entityType: entityTypeFilter !== 'ALL' ? entityTypeFilter : undefined,
                source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
                limit: pageSize,
                offset: (currentPage - 1) * pageSize,
            });

            setEntities(response.entities || []);
            setTotalEntities(response.total || 0);
            setTotalPages(Math.ceil((response.total || 0) / pageSize));
        } catch (error) {
            console.error("Failed to load entities:", error);
            showError("Failed to load entities");
        } finally {
            setLoading(false);
        }
    }, [datasetId, searchTerm, entityTypeFilter, sourceFilter, pageSize, currentPage, showError]);

    // Load statistics
    const loadStatistics = useCallback(async () => {
        try {
            const response = await graphApi.entityDictionary.getStatistics(datasetId);
            setStatistics(response);
        } catch (error) {
            console.error("Failed to load statistics:", error);
        }
    }, [datasetId]);

    useEffect(() => {
        loadEntities();
        loadStatistics();
    }, [datasetId, searchTerm, entityTypeFilter, sourceFilter, currentPage, loadEntities, loadStatistics]);

    // Create entity
    const handleCreateEntity = async () => {
        try {
            await graphApi.entityDictionary.createEntity(datasetId, {
                entityType: formData.entityType,
                canonicalName: formData.canonicalName,
                confidenceScore: formData.confidenceScore,
                source: formData.source,
                metadata: {
                    description: formData.description,
                    category: formData.category,
                    tags: formData.tags,
                },
                aliases: formData.aliases,
            });

            success("Entity created successfully");
            setIsCreateDialogOpen(false);
            resetForm();
            loadEntities();
            loadStatistics();
        } catch (error) {
            console.error("Failed to create entity:", error);
            showError("Failed to create entity");
        }
    };

    // Update entity
    const handleUpdateEntity = async () => {
        if (!editingEntity) return;

        try {
            await graphApi.entityDictionary.updateEntity(datasetId, editingEntity.id, {
                entityType: formData.entityType,
                canonicalName: formData.canonicalName,
                confidenceScore: formData.confidenceScore,
                source: formData.source,
                metadata: {
                    description: formData.description,
                    category: formData.category,
                    tags: formData.tags,
                },
                aliases: formData.aliases,
            });

            success("Entity updated successfully");
            setIsEditDialogOpen(false);
            setEditingEntity(null);
            resetForm();
            loadEntities();
            loadStatistics();
        } catch (error) {
            console.error("Failed to update entity:", error);
            showError("Failed to update entity");
        }
    };

    // Delete entity
    const handleDeleteEntity = async (entityId: string) => {
        if (!confirm("Are you sure you want to delete this entity?")) return;

        try {
            await graphApi.entityDictionary.deleteEntity(datasetId, entityId);
            success("Entity deleted successfully");
            loadEntities();
            loadStatistics();
        } catch (error) {
            console.error("Failed to delete entity:", error);
            showError("Failed to delete entity");
        }
    };

    // Toggle entity selection
    const toggleEntitySelection = (entityId: string) => {
        setSelectedEntities(prev => {
            const newSet = new Set(prev);
            if (newSet.has(entityId)) {
                newSet.delete(entityId);
            } else {
                newSet.add(entityId);
            }
            return newSet;
        });
    };

    // Toggle select all
    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedEntities(new Set());
            setIsAllSelected(false);
        } else {
            const allIds = new Set(entities.map(e => e.id));
            setSelectedEntities(allIds);
            setIsAllSelected(true);
        }
    };

    // Update select all state when selection changes
    useEffect(() => {
        if (entities.length > 0) {
            const allSelected = entities.every(e => selectedEntities.has(e.id));
            setIsAllSelected(allSelected);
        } else {
            setIsAllSelected(false);
        }
    }, [selectedEntities, entities]);

    // Handle bulk delete
    const handleBulkDelete = () => {
        if (selectedEntities.size === 0) return;
        setDeleteType('page');
        setDeleteConfirmText('');
        setIsDeleteDialogOpen(true);
    };

    // Handle delete all
    const handleDeleteAll = () => {
        setDeleteType('all');
        setDeleteConfirmText('');
        setIsDeleteDialogOpen(true);
    };

    // Confirm and execute delete
    const confirmDelete = async () => {
        if (deleteType === 'all' && deleteConfirmText !== 'delete') {
            showError('Please type "delete" to confirm');
            return;
        }

        setIsDeleting(true);
        try {
            if (deleteType === 'all') {
                const result = await graphApi.entityDictionary.deleteAll(datasetId);
                success(`Deleted all ${result.deleted || 0} entities`);
            } else {
                const entityIds = Array.from(selectedEntities);
                const result = await graphApi.entityDictionary.bulkDelete(datasetId, entityIds);
                success(`Deleted ${result.deleted || entityIds.length} entities${result.failed ? ` (${result.failed} failed)` : ''}`);
            }
            setSelectedEntities(new Set());
            setIsAllSelected(false);
            setIsDeleteDialogOpen(false);
            setDeleteConfirmText('');
            loadEntities();
            loadStatistics();
        } catch (error) {
            console.error("Failed to delete entities:", error);
            showError("Failed to delete entities");
        } finally {
            setIsDeleting(false);
        }
    };

    // Export entities with current filters
    const handleExportEntities = async () => {
        try {
            const filters = {
                entityType: entityTypeFilter !== 'ALL' ? entityTypeFilter : undefined,
                searchTerm: searchTerm || undefined,
                source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
            };

            const response = await graphApi.entityDictionary.exportEntities(datasetId, filters);
            const blob = new Blob([JSON.stringify(response, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;

            // Generate filename with filter info
            const filterParts: string[] = [];
            if (filters.entityType) filterParts.push(filters.entityType);
            if (filters.source) filterParts.push(filters.source);
            const filterSuffix = filterParts.length > 0 ? `-${filterParts.join('-')}` : '';
            a.download = `entities${filterSuffix}-${new Date().toISOString().split('T')[0]}.json`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success("Entities exported successfully");
        } catch (error) {
            console.error("Failed to export entities:", error);
            showError("Failed to export entities");
        }
    };


    // Reset form
    const resetForm = () => {
        setFormData({
            entityType: "",
            canonicalName: "",
            confidenceScore: 0.8,
            source: "manual",
            description: "",
            category: "",
            tags: [],
            aliases: [],
        });
        setNewTag("");
        setNewAlias("");
    };

    // Open edit dialog
    const openEditDialog = (entity: Entity) => {
        setEditingEntity(entity);
        setFormData({
            entityType: entity.entityType,
            canonicalName: entity.canonicalName,
            confidenceScore: entity.confidenceScore,
            source: entity.source,
            description: entity.metadata?.description || "",
            category: entity.metadata?.category || "",
            tags: entity.metadata?.tags || [],
            aliases: entity.aliases?.map(a => a.alias) || [],
        });
        setIsEditDialogOpen(true);
    };

    // Add tag
    const addTag = () => {
        if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, newTag.trim()]
            }));
            setNewTag("");
        }
    };

    // Remove tag
    const removeTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    // Add alias
    const addAlias = () => {
        if (newAlias.trim() && !formData.aliases.includes(newAlias.trim())) {
            setFormData(prev => ({
                ...prev,
                aliases: [...prev.aliases, newAlias.trim()]
            }));
            setNewAlias("");
        }
    };

    // Remove alias
    const removeAlias = (alias: string) => {
        setFormData(prev => ({
            ...prev,
            aliases: prev.aliases.filter(a => a !== alias)
        }));
    };

    const entityTypes = [
        "author", "brand", "topic", "hashtag", "influencer",
        "location", "organization", "product", "event"
    ];

    const sources = ["manual", "auto_discovered", "imported", "learned"];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Entity Dictionary</h2>
                    <p className="text-muted-foreground">
                        Manage entities for improved graph extraction quality
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowGenerateEntityModal(true)}
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Entity
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowDiscoveryModal(true)}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Discover
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowDuplicatesModal(true)}
                    >
                        Find Duplicates
                    </Button>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Entity
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            {statistics && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{statistics.totalEntities}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">By Type</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {Object.keys(statistics.entitiesByType).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">By Source</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {Object.keys(statistics.entitiesBySource).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Top Entity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm font-medium truncate">
                                {statistics.topEntities[0]?.entity.canonicalName || "N/A"}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search entities..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        {entityTypes.map(type => (
                            <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Sources</SelectItem>
                        {sources.map(source => (
                            <SelectItem key={source} value={source}>
                                {source.replace('_', ' ').charAt(0).toUpperCase() + source.replace('_', ' ').slice(1)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    onClick={handleExportEntities}
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>
            </div>

            {/* Bulk Actions Bar */}
            {selectedEntities.size > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium">
                                    {selectedEntities.size} selected
                                </span>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleBulkDelete}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete this page ({selectedEntities.size})
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleDeleteAll}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete all ({totalEntities})
                                </Button>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSelectedEntities(new Set());
                                    setIsAllSelected(false);
                                }}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Clear selection
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Entities Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={isAllSelected}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="min-w-[200px]">Name</TableHead>
                                    <TableHead className="w-[100px]">Type</TableHead>
                                    <TableHead className="w-[120px]">Source</TableHead>
                                    <TableHead className="w-[140px]">Confidence</TableHead>
                                    <TableHead className="min-w-[150px]">Aliases</TableHead>
                                    <TableHead className="w-[120px]">Usage</TableHead>
                                    <TableHead className="w-[60px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8">
                                            <div className="flex items-center justify-center">
                                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                                Loading...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : entities.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No entities found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entities.map((entity) => (
                                        <TableRow key={entity.id}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedEntities.has(entity.id)}
                                                    onCheckedChange={() => toggleEntitySelection(entity.id)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium truncate" title={entity.canonicalName}>
                                                    {entity.canonicalName}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">
                                                    {entity.entityType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {entity.source.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Progress
                                                        value={entity.confidenceScore * 100}
                                                        className="w-20 h-2"
                                                    />
                                                    <span className="text-sm font-medium min-w-[35px]">
                                                        {(entity.confidenceScore * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {entity.aliases?.slice(0, 3).map((alias) => (
                                                        <Badge
                                                            key={alias.id}
                                                            variant="outline"
                                                            className="text-xs truncate max-w-[80px]"
                                                            title={alias.alias}
                                                        >
                                                            {alias.alias}
                                                        </Badge>
                                                    ))}
                                                    {entity.aliases && entity.aliases.length > 3 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{entity.aliases.length - 3}
                                                        </Badge>
                                                    )}
                                                    {(!entity.aliases || entity.aliases.length === 0) && (
                                                        <span className="text-xs text-muted-foreground">None</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-medium">
                                                        {entity.metadata?.usage_count || 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        uses
                                                    </div>
                                                    {entity.metadata?.last_used && (
                                                        <div className="text-xs text-muted-foreground">
                                                            • {new Date(entity.metadata.last_used).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => openEditDialog(entity)}
                                                        title="Edit Entity"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleDeleteEntity(entity.id)}
                                                        title="Delete Entity"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {deleteType === 'all' ? 'Delete All Entities' : 'Delete Selected Entities'}
                        </DialogTitle>
                        <DialogDescription>
                            {deleteType === 'all'
                                ? `This will permanently delete all ${totalEntities} entities. This action cannot be undone.`
                                : `This will permanently delete ${selectedEntities.size} selected entities. This action cannot be undone.`}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteType === 'all' && (
                        <div className="space-y-2">
                            <Label htmlFor="deleteConfirm">
                                Type "delete" to confirm:
                            </Label>
                            <Input
                                id="deleteConfirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Type 'delete' to confirm"
                                className="font-mono"
                            />
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsDeleteDialogOpen(false);
                                setDeleteConfirmText('');
                            }}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={isDeleting || (deleteType === 'all' && deleteConfirmText !== 'delete')}
                        >
                            {isDeleting ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {deleteType === 'all' ? 'Delete All' : 'Delete Selected'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Entity Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create Entity</DialogTitle>
                        <DialogDescription>
                            Add a new entity to the dictionary
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="entityType">Entity Type</Label>
                                <Select
                                    value={formData.entityType}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, entityType: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {entityTypes.map(type => (
                                            <SelectItem key={type} value={type}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="canonicalName">Canonical Name</Label>
                                <Input
                                    id="canonicalName"
                                    value={formData.canonicalName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, canonicalName: e.target.value }))}
                                    placeholder="Enter canonical name"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="confidenceScore">Confidence Score</Label>
                                <Input
                                    id="confidenceScore"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={formData.confidenceScore}
                                    onChange={(e) => setFormData(prev => ({ ...prev, confidenceScore: parseFloat(e.target.value) }))}
                                />
                            </div>
                            <div>
                                <Label htmlFor="source">Source</Label>
                                <Select
                                    value={formData.source}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sources.map(source => (
                                            <SelectItem key={source} value={source}>
                                                {source.replace('_', ' ').charAt(0).toUpperCase() + source.replace('_', ' ').slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Enter description"
                                rows={3}
                            />
                        </div>

                        <div>
                            <Label htmlFor="category">Category</Label>
                            <Input
                                id="category"
                                value={formData.category}
                                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                placeholder="Enter category"
                            />
                        </div>

                        <div>
                            <Label>Tags</Label>
                            <div className="flex gap-2 mb-2">
                                <Input
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    placeholder="Add tag"
                                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                                />
                                <Button onClick={addTag} size="sm">Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {formData.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                                        {tag}
                                        <X
                                            className="h-3 w-3 cursor-pointer"
                                            onClick={() => removeTag(tag)}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label>Aliases</Label>
                            <div className="flex gap-2 mb-2">
                                <Input
                                    value={newAlias}
                                    onChange={(e) => setNewAlias(e.target.value)}
                                    placeholder="Add alias"
                                    onKeyPress={(e) => e.key === 'Enter' && addAlias()}
                                />
                                <Button onClick={addAlias} size="sm">Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {formData.aliases.map((alias) => (
                                    <Badge key={alias} variant="outline" className="flex items-center gap-1">
                                        {alias}
                                        <X
                                            className="h-3 w-3 cursor-pointer"
                                            onClick={() => removeAlias(alias)}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateEntity}>
                            Create Entity
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Entity Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Entity</DialogTitle>
                        <DialogDescription>
                            Update the entity information
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Same form fields as create dialog */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="editEntityType">Entity Type</Label>
                                <Select
                                    value={formData.entityType}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, entityType: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {entityTypes.map(type => (
                                            <SelectItem key={type} value={type}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="editCanonicalName">Canonical Name</Label>
                                <Input
                                    id="editCanonicalName"
                                    value={formData.canonicalName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, canonicalName: e.target.value }))}
                                    placeholder="Enter canonical name"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="editConfidenceScore">Confidence Score</Label>
                                <Input
                                    id="editConfidenceScore"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={formData.confidenceScore}
                                    onChange={(e) => setFormData(prev => ({ ...prev, confidenceScore: parseFloat(e.target.value) }))}
                                />
                            </div>
                            <div>
                                <Label htmlFor="editSource">Source</Label>
                                <Select
                                    value={formData.source}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sources.map(source => (
                                            <SelectItem key={source} value={source}>
                                                {source.replace('_', ' ').charAt(0).toUpperCase() + source.replace('_', ' ').slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="editDescription">Description</Label>
                            <Textarea
                                id="editDescription"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Enter description"
                                rows={3}
                            />
                        </div>

                        <div>
                            <Label htmlFor="editCategory">Category</Label>
                            <Input
                                id="editCategory"
                                value={formData.category}
                                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                placeholder="Enter category"
                            />
                        </div>

                        <div>
                            <Label>Tags</Label>
                            <div className="flex gap-2 mb-2">
                                <Input
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    placeholder="Add tag"
                                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                                />
                                <Button onClick={addTag} size="sm">Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {formData.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                                        {tag}
                                        <X
                                            className="h-3 w-3 cursor-pointer"
                                            onClick={() => removeTag(tag)}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label>Aliases</Label>
                            <div className="flex gap-2 mb-2">
                                <Input
                                    value={newAlias}
                                    onChange={(e) => setNewAlias(e.target.value)}
                                    placeholder="Add alias"
                                    onKeyPress={(e) => e.key === 'Enter' && addAlias()}
                                />
                                <Button onClick={addAlias} size="sm">Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {formData.aliases.map((alias) => (
                                    <Badge key={alias} variant="outline" className="flex items-center gap-1">
                                        {alias}
                                        <X
                                            className="h-3 w-3 cursor-pointer"
                                            onClick={() => removeAlias(alias)}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateEntity}>
                            Update Entity
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Generate Entity Modal */}
            {showGenerateEntityModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-semibold">Generate Entity</h2>
                            <Button variant="ghost" size="sm" onClick={() => setShowGenerateEntityModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <EntityGenerator
                                datasetId={datasetId}
                                onEntitiesCreated={() => {
                                    loadEntities();
                                    loadStatistics();
                                    setShowGenerateEntityModal(false);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Discovery Modal */}
            {showDiscoveryModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-semibold">Discover Entities</h2>
                            <Button variant="ghost" size="sm" onClick={() => setShowDiscoveryModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <EntityDiscovery
                                datasetId={datasetId}
                                onEntitiesCreated={() => {
                                    loadEntities();
                                    loadStatistics();
                                    setShowDiscoveryModal(false);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Entities Modal */}
            <DuplicateEntitiesModal
                datasetId={datasetId}
                isOpen={showDuplicatesModal}
                onClose={() => setShowDuplicatesModal(false)}
                onMergeComplete={(result) => {
                    success('Merge Complete', `Merged ${result.merged} entities`);
                    loadEntities();
                    loadStatistics();
                    setShowDuplicatesModal(false);
                }}
            />
        </div>
    );
}
