'use client';

import React, { useState, useCallback, useRef } from 'react';
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
    Upload,
    Download,
    FileText,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Eye,
    Trash2,
    Plus,
    X
} from 'lucide-react';
import { graphApi } from '@/lib/api';

interface EntityImportData {
    entityType: string;
    canonicalName: string;
    description?: string;
    category?: string;
    tags?: string[];
    aliases?: string[];
    confidence?: number;
    metadata?: any;
}

interface ImportPreview {
    valid: EntityImportData[];
    invalid: Array<{ data: EntityImportData; error: string }>;
    duplicates: Array<{ data: EntityImportData; existing: EntityImportData }>;
}

interface EntityDictionaryImportModalProps {
    datasetId: string;
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: (result: { created: number; skipped: number; errors: string[] }) => void;
}

export const EntityDictionaryImportModal: React.FC<EntityDictionaryImportModalProps> = ({
    datasetId,
    isOpen,
    onClose,
    onImportComplete,
}) => {
    const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
    const [importMethod, setImportMethod] = useState<'csv' | 'json' | 'manual'>('csv');
    const [file, setFile] = useState<File | null>(null);
    const [csvContent, setCsvContent] = useState('');
    const [jsonContent, setJsonContent] = useState('');
    const [manualEntities, setManualEntities] = useState<EntityImportData[]>([]);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [importOptions, setImportOptions] = useState({
        skipDuplicates: true,
        updateExisting: false,
        defaultConfidence: 0.8,
        source: 'imported' as 'imported' | 'manual' | 'llm_suggested' | 'auto_discovered',
    });
    const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
    const [exportFilters, setExportFilters] = useState({
        entityType: '',
        source: '',
        minConfidence: 0,
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFile(file);
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (importMethod === 'csv') {
                setCsvContent(content);
            } else if (importMethod === 'json') {
                setJsonContent(content);
            }
        };

        if (importMethod === 'csv') {
            reader.readAsText(file);
        } else if (importMethod === 'json') {
            reader.readAsText(file);
        }
    }, [importMethod]);

    const parseCsvContent = useCallback((content: string): EntityImportData[] => {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const entities: EntityImportData[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) continue;

            const entity: EntityImportData = {
                entityType: '',
                canonicalName: '',
            };

            headers.forEach((header, index) => {
                const value = values[index];
                switch (header) {
                    case 'entitytype':
                    case 'entity_type':
                        entity.entityType = value;
                        break;
                    case 'canonicalname':
                    case 'canonical_name':
                        entity.canonicalName = value;
                        break;
                    case 'description':
                        entity.description = value;
                        break;
                    case 'category':
                        entity.category = value;
                        break;
                    case 'tags':
                        entity.tags = value ? value.split(';').map(t => t.trim()) : [];
                        break;
                    case 'aliases':
                        entity.aliases = value ? value.split(';').map(a => a.trim()) : [];
                        break;
                    case 'confidence':
                        entity.confidence = parseFloat(value) || 0.8;
                        break;
                    case 'metadata':
                        try {
                            entity.metadata = value ? JSON.parse(value) : {};
                        } catch {
                            entity.metadata = {};
                        }
                        break;
                }
            });

            if (entity.entityType && entity.canonicalName) {
                entities.push(entity);
            }
        }

        return entities;
    }, []);

    const parseJsonContent = useCallback((content: string): EntityImportData[] => {
        try {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                return data;
            } else if (data.entities && Array.isArray(data.entities)) {
                return data.entities;
            }
            return [];
        } catch {
            return [];
        }
    }, []);

    const validateEntities = useCallback((entities: EntityImportData[]): ImportPreview => {
        const valid: EntityImportData[] = [];
        const invalid: Array<{ data: EntityImportData; error: string }> = [];
        const duplicates: Array<{ data: EntityImportData; existing: EntityImportData }> = [];

        entities.forEach((entity, index) => {
            // Basic validation
            if (!entity.entityType || !entity.canonicalName) {
                invalid.push({
                    data: entity,
                    error: 'Missing required fields: entityType and canonicalName',
                });
                return;
            }

            if (entity.canonicalName.length < 2) {
                invalid.push({
                    data: entity,
                    error: 'Canonical name must be at least 2 characters',
                });
                return;
            }

            if (entity.confidence && (entity.confidence < 0 || entity.confidence > 1)) {
                invalid.push({
                    data: entity,
                    error: 'Confidence must be between 0 and 1',
                });
                return;
            }

            // Check for duplicates within the import data
            const isDuplicate = valid.some(existing =>
                existing.canonicalName.toLowerCase() === entity.canonicalName.toLowerCase() &&
                existing.entityType === entity.entityType
            );

            if (isDuplicate) {
                invalid.push({
                    data: entity,
                    error: 'Duplicate entity within import data',
                });
                return;
            }

            valid.push(entity);
        });

        return { valid, invalid, duplicates };
    }, []);

    const handlePreview = useCallback(async () => {
        let entities: EntityImportData[] = [];

        if (importMethod === 'csv') {
            entities = parseCsvContent(csvContent);
        } else if (importMethod === 'json') {
            entities = parseJsonContent(jsonContent);
        } else if (importMethod === 'manual') {
            entities = manualEntities;
        }

        const preview = validateEntities(entities);
        setPreview(preview);
    }, [importMethod, csvContent, jsonContent, manualEntities, parseCsvContent, parseJsonContent, validateEntities]);

    const handleImport = useCallback(async () => {
        if (!preview || preview.valid.length === 0) return;

        setIsProcessing(true);
        setProgress(0);

        try {
            const result = await graphApi.entityDictionary.bulkImport(datasetId, {
                entities: preview.valid,
                source: importOptions.source,
                options: {
                    skipDuplicates: importOptions.skipDuplicates,
                    updateExisting: importOptions.updateExisting,
                    defaultConfidence: importOptions.defaultConfidence,
                },
            });

            setProgress(100);
            onImportComplete(result);
            onClose();
        } catch (error) {
            console.error('Import failed:', error);
        } finally {
            setIsProcessing(false);
        }
    }, [preview, datasetId, importOptions, onImportComplete, onClose]);

    const handleExport = useCallback(async () => {
        try {
            const data = await graphApi.entityDictionary.exportEntities(datasetId);

            if (exportFormat === 'csv') {
                const csvContent = convertToCsv(data);
                downloadFile(csvContent, 'entities.csv', 'text/csv');
            } else {
                const jsonContent = JSON.stringify(data, null, 2);
                downloadFile(jsonContent, 'entities.json', 'application/json');
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    }, [datasetId, exportFormat]);

    const convertToCsv = (entities: any[]): string => {
        if (entities.length === 0) return '';

        const headers = [
            'entityType',
            'canonicalName',
            'description',
            'category',
            'tags',
            'aliases',
            'confidence',
            'source',
            'metadata',
        ];

        const csvRows = [headers.join(',')];

        entities.forEach(entity => {
            const row = headers.map(header => {
                let value = entity[header] || '';

                if (header === 'tags' || header === 'aliases') {
                    value = Array.isArray(value) ? value.join(';') : '';
                } else if (header === 'metadata') {
                    value = JSON.stringify(value || {});
                }

                // Escape commas and quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }

                return value;
            });

            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    };

    const downloadFile = (content: string, filename: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const addManualEntity = useCallback(() => {
        setManualEntities(prev => [...prev, {
            entityType: 'organization',
            canonicalName: '',
            description: '',
            category: '',
            tags: [],
            aliases: [],
            confidence: 0.8,
            metadata: {},
        }]);
    }, []);

    const updateManualEntity = useCallback((index: number, field: keyof EntityImportData, value: any) => {
        setManualEntities(prev => prev.map((entity, i) =>
            i === index ? { ...entity, [field]: value } : entity
        ));
    }, []);

    const removeManualEntity = useCallback((index: number) => {
        setManualEntities(prev => prev.filter((_, i) => i !== index));
    }, []);

    const addAlias = useCallback((entityIndex: number) => {
        setManualEntities(prev => prev.map((entity, i) =>
            i === entityIndex
                ? { ...entity, aliases: [...(entity.aliases || []), ''] }
                : entity
        ));
    }, []);

    const updateAlias = useCallback((entityIndex: number, aliasIndex: number, value: string) => {
        setManualEntities(prev => prev.map((entity, i) =>
            i === entityIndex
                ? {
                    ...entity,
                    aliases: entity.aliases?.map((alias, j) => j === aliasIndex ? value : alias) || []
                }
                : entity
        ));
    }, []);

    const removeAlias = useCallback((entityIndex: number, aliasIndex: number) => {
        setManualEntities(prev => prev.map((entity, i) =>
            i === entityIndex
                ? {
                    ...entity,
                    aliases: entity.aliases?.filter((_, j) => j !== aliasIndex) || []
                }
                : entity
        ));
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">Import/Export Entity Dictionary</h2>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'import' | 'export')}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="import">Import</TabsTrigger>
                            <TabsTrigger value="export">Export</TabsTrigger>
                        </TabsList>

                        <TabsContent value="import" className="space-y-6">
                            {/* Import Method Selection */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Import Method</CardTitle>
                                    <CardDescription>Choose how you want to import entities</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-4">
                                        <Button
                                            variant={importMethod === 'csv' ? 'default' : 'outline'}
                                            onClick={() => setImportMethod('csv')}
                                            className="flex items-center gap-2"
                                        >
                                            <FileText className="h-4 w-4" />
                                            CSV File
                                        </Button>
                                        <Button
                                            variant={importMethod === 'json' ? 'default' : 'outline'}
                                            onClick={() => setImportMethod('json')}
                                            className="flex items-center gap-2"
                                        >
                                            <FileText className="h-4 w-4" />
                                            JSON File
                                        </Button>
                                        <Button
                                            variant={importMethod === 'manual' ? 'default' : 'outline'}
                                            onClick={() => setImportMethod('manual')}
                                            className="flex items-center gap-2"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Manual Entry
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* File Upload */}
                            {importMethod !== 'manual' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Upload File</CardTitle>
                                        <CardDescription>Select a {importMethod.toUpperCase()} file to import</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <Input
                                                ref={fileInputRef}
                                                type="file"
                                                accept={importMethod === 'csv' ? '.csv' : '.json'}
                                                onChange={handleFileUpload}
                                                className="cursor-pointer"
                                            />

                                            {importMethod === 'csv' && (
                                                <div className="space-y-2">
                                                    <Label>CSV Content</Label>
                                                    <Textarea
                                                        value={csvContent}
                                                        onChange={(e) => setCsvContent(e.target.value)}
                                                        placeholder="Paste CSV content here or upload a file..."
                                                        rows={6}
                                                    />
                                                </div>
                                            )}

                                            {importMethod === 'json' && (
                                                <div className="space-y-2">
                                                    <Label>JSON Content</Label>
                                                    <Textarea
                                                        value={jsonContent}
                                                        onChange={(e) => setJsonContent(e.target.value)}
                                                        placeholder="Paste JSON content here or upload a file..."
                                                        rows={6}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Manual Entry */}
                            {importMethod === 'manual' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Manual Entity Entry</CardTitle>
                                        <CardDescription>Add entities manually one by one</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <Button onClick={addManualEntity} className="flex items-center gap-2">
                                                <Plus className="h-4 w-4" />
                                                Add Entity
                                            </Button>

                                            {manualEntities.map((entity, index) => (
                                                <Card key={index} className="p-4">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h4 className="font-medium">Entity {index + 1}</h4>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeManualEntity(index)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label>Entity Type *</Label>
                                                            <Select
                                                                value={entity.entityType}
                                                                onValueChange={(value) => updateManualEntity(index, 'entityType', value)}
                                                            >
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select type" />
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
                                                            <Label>Canonical Name *</Label>
                                                            <Input
                                                                value={entity.canonicalName}
                                                                onChange={(e) => updateManualEntity(index, 'canonicalName', e.target.value)}
                                                                placeholder="Enter canonical name"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label>Description</Label>
                                                            <Input
                                                                value={entity.description || ''}
                                                                onChange={(e) => updateManualEntity(index, 'description', e.target.value)}
                                                                placeholder="Enter description"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label>Category</Label>
                                                            <Input
                                                                value={entity.category || ''}
                                                                onChange={(e) => updateManualEntity(index, 'category', e.target.value)}
                                                                placeholder="Enter category"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label>Confidence</Label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="1"
                                                                step="0.1"
                                                                value={entity.confidence || 0.8}
                                                                onChange={(e) => updateManualEntity(index, 'confidence', parseFloat(e.target.value))}
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label>Tags (comma-separated)</Label>
                                                            <Input
                                                                value={entity.tags?.join(', ') || ''}
                                                                onChange={(e) => updateManualEntity(index, 'tags', e.target.value.split(',').map(t => t.trim()))}
                                                                placeholder="tag1, tag2, tag3"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Aliases */}
                                                    <div className="mt-4 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <Label>Aliases</Label>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => addAlias(index)}
                                                            >
                                                                <Plus className="h-4 w-4" />
                                                            </Button>
                                                        </div>

                                                        {entity.aliases?.map((alias, aliasIndex) => (
                                                            <div key={aliasIndex} className="flex items-center gap-2">
                                                                <Input
                                                                    value={alias}
                                                                    onChange={(e) => updateAlias(index, aliasIndex, e.target.value)}
                                                                    placeholder="Enter alias"
                                                                />
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => removeAlias(index, aliasIndex)}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Import Options */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Import Options</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="skipDuplicates"
                                                checked={importOptions.skipDuplicates}
                                                onCheckedChange={(checked) =>
                                                    setImportOptions(prev => ({ ...prev, skipDuplicates: !!checked }))
                                                }
                                            />
                                            <Label htmlFor="skipDuplicates">Skip duplicate entities</Label>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="updateExisting"
                                                checked={importOptions.updateExisting}
                                                onCheckedChange={(checked) =>
                                                    setImportOptions(prev => ({ ...prev, updateExisting: !!checked }))
                                                }
                                            />
                                            <Label htmlFor="updateExisting">Update existing entities</Label>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Default Confidence</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    value={importOptions.defaultConfidence}
                                                    onChange={(e) =>
                                                        setImportOptions(prev => ({ ...prev, defaultConfidence: parseFloat(e.target.value) }))
                                                    }
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Source</Label>
                                                <Select
                                                    value={importOptions.source}
                                                    onValueChange={(value) =>
                                                        setImportOptions(prev => ({ ...prev, source: value as any }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="imported">Imported</SelectItem>
                                                        <SelectItem value="manual">Manual</SelectItem>
                                                        <SelectItem value="llm_suggested">LLM Suggested</SelectItem>
                                                        <SelectItem value="auto_discovered">Auto Discovered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Preview and Import */}
                            <div className="flex gap-4">
                                <Button onClick={handlePreview} variant="outline" className="flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    Preview
                                </Button>

                                {preview && (
                                    <Button
                                        onClick={handleImport}
                                        disabled={isProcessing || preview.valid.length === 0}
                                        className="flex items-center gap-2"
                                    >
                                        {isProcessing ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="h-4 w-4" />
                                        )}
                                        Import {preview.valid.length} Entities
                                    </Button>
                                )}
                            </div>

                            {/* Preview Results */}
                            {preview && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Import Preview</CardTitle>
                                        <CardDescription>
                                            {preview.valid.length} valid, {preview.invalid.length} invalid, {preview.duplicates.length} duplicates
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {preview.valid.length > 0 && (
                                                <div>
                                                    <h4 className="font-medium text-green-600 mb-2 flex items-center gap-2">
                                                        <CheckCircle className="h-4 w-4" />
                                                        Valid Entities ({preview.valid.length})
                                                    </h4>
                                                    <div className="space-y-2">
                                                        {preview.valid.slice(0, 5).map((entity, index) => (
                                                            <div key={index} className="flex items-center gap-2 text-sm">
                                                                <Badge variant="outline">{entity.entityType}</Badge>
                                                                <span>{entity.canonicalName}</span>
                                                                {entity.aliases && entity.aliases.length > 0 && (
                                                                    <span className="text-gray-500">
                                                                        ({entity.aliases.length} aliases)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {preview.valid.length > 5 && (
                                                            <div className="text-sm text-gray-500">
                                                                ... and {preview.valid.length - 5} more
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {preview.invalid.length > 0 && (
                                                <div>
                                                    <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                                                        <XCircle className="h-4 w-4" />
                                                        Invalid Entities ({preview.invalid.length})
                                                    </h4>
                                                    <div className="space-y-2">
                                                        {preview.invalid.slice(0, 5).map((item, index) => (
                                                            <Alert key={index} variant="destructive">
                                                                <AlertTriangle className="h-4 w-4" />
                                                                <AlertDescription>
                                                                    <strong>{item.data.canonicalName}</strong>: {item.error}
                                                                </AlertDescription>
                                                            </Alert>
                                                        ))}
                                                        {preview.invalid.length > 5 && (
                                                            <div className="text-sm text-gray-500">
                                                                ... and {preview.invalid.length - 5} more errors
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Progress */}
                            {isProcessing && (
                                <Card>
                                    <CardContent className="pt-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span>Importing entities...</span>
                                                <span>{progress}%</span>
                                            </div>
                                            <Progress value={progress} className="w-full" />
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        <TabsContent value="export" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Export Entity Dictionary</CardTitle>
                                    <CardDescription>Export your entity dictionary in various formats</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Export Format</Label>
                                                <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as 'csv' | 'json')}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="csv">CSV</SelectItem>
                                                        <SelectItem value="json">JSON</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Entity Type Filter</Label>
                                                <Select
                                                    value={exportFilters.entityType}
                                                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, entityType: value }))}
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
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Source Filter</Label>
                                                <Select
                                                    value={exportFilters.source}
                                                    onValueChange={(value) => setExportFilters(prev => ({ ...prev, source: value }))}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="All sources" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ALL">All Sources</SelectItem>
                                                        <SelectItem value="manual">Manual</SelectItem>
                                                        <SelectItem value="imported">Imported</SelectItem>
                                                        <SelectItem value="llm_suggested">LLM Suggested</SelectItem>
                                                        <SelectItem value="auto_discovered">Auto Discovered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Minimum Confidence</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    value={exportFilters.minConfidence}
                                                    onChange={(e) => setExportFilters(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                                                />
                                            </div>
                                        </div>

                                        <Button onClick={handleExport} className="flex items-center gap-2">
                                            <Download className="h-4 w-4" />
                                            Export Entities
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
};
