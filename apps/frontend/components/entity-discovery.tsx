'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Check, X, RefreshCw, Lightbulb } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { graphApi } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { Input } from '@/components/ui/input'

interface EntityDiscoveryProps {
    datasetId: string
    onEntitiesCreated?: () => void
}

interface ParsedAlias {
    name: string
    type?: string
    language?: string
    script?: string
}

interface ParsedEntity {
    id?: string
    entityType: string
    canonicalName: string
    aliases?: ParsedAlias[]
    description?: string
    category?: string
    tags?: string[]
    metadata?: Record<string, unknown>
    isValid: boolean
    exists?: boolean
    existingEntityId?: string
    existingAliases?: string[]
    newAliases?: ParsedAlias[]
    error?: string
}

const ALIAS_TYPES = [
    { value: 'abbreviation', label: 'Abbreviation' },
    { value: 'translation', label: 'Translation' },
    { value: 'local_name', label: 'Local Name' },
    { value: 'brand_name', label: 'Brand Name' },
] as const

export function EntityDiscovery({ datasetId, onEntitiesCreated }: EntityDiscoveryProps) {
    const { success, error: showError } = useToast()
    const [activeTab, setActiveTab] = useState<'auto-discover' | 'discover-aliases'>('auto-discover')
    const [sourceJson, setSourceJson] = useState<string>('')
    const [sourceJsonError, setSourceJsonError] = useState<string>('')
    const [parsedEntities, setParsedEntities] = useState<ParsedEntity[]>([])
    const [existingEntities, setExistingEntities] = useState<Array<Record<string, unknown>>>([])
    const [updating, setUpdating] = useState(false)
    const [discovering, setDiscovering] = useState(false)

    // Load existing entities on mount
    useEffect(() => {
        loadExistingEntities()
    }, [datasetId])

    // Parse source JSON when it changes
    useEffect(() => {
        if (sourceJson.trim()) {
            parseSourceJson(sourceJson)
        } else {
            setParsedEntities([])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceJson, existingEntities])

    const loadExistingEntities = async () => {
        try {
            const response = await graphApi.entityDictionary.getEntities(datasetId, { limit: 1000 })
            setExistingEntities(response.entities || [])
        } catch (err) {
            console.error('Failed to load existing entities:', err)
        }
    }

    const validateSourceJson = (jsonString: string): { isValid: boolean; parsed?: unknown; error?: string } => {
        if (!jsonString.trim()) {
            setSourceJsonError('')
            return { isValid: true, parsed: undefined }
        }
        try {
            const parsed = JSON.parse(jsonString)
            setSourceJsonError('')
            return { isValid: true, parsed }
        } catch (err) {
            let error = 'Invalid JSON'
            if (err instanceof SyntaxError) {
                const match = err.message.match(/position (\d+)/)
                if (match) {
                    const position = parseInt(match[1], 10)
                    const lines = jsonString.substring(0, position).split('\n')
                    const line = lines.length
                    const column = lines[lines.length - 1].length + 1
                    error = `JSON Error at line ${line}, column ${column}: ${err.message}`
                } else {
                    error = err.message
                }
            } else if (err instanceof Error) {
                error = err.message
            }
            setSourceJsonError(error)
            return { isValid: false, error }
        }
    }

    const parseSourceJson = (jsonString: string) => {
        const validation = validateSourceJson(jsonString)
        if (!validation.isValid || !validation.parsed) {
            setParsedEntities([])
            return
        }

        try {
            const parsed = validation.parsed as Record<string, unknown>
            const entities: ParsedEntity[] = []

            // Support both 'entities' array and direct array format
            const entitiesArray = (parsed.entities as unknown[]) || (Array.isArray(parsed) ? parsed : [])

            entitiesArray.forEach((entity: Record<string, unknown>, index: number) => {
                const entityType = (entity.entityType || entity.type) as string
                const canonicalName = (entity.canonicalName || entity.name || entity.label) as string
                const rawAliases = (entity.aliases || []) as unknown[]

                // Normalize aliases to ParsedAlias format
                const aliases: ParsedAlias[] = rawAliases.map((alias: unknown): ParsedAlias => {
                    if (typeof alias === 'string') {
                        return { name: alias }
                    }
                    const aliasObj = alias as Record<string, unknown>
                    return {
                        name: (aliasObj.name || aliasObj.alias || '') as string,
                        type: aliasObj.type as string | undefined,
                        language: aliasObj.language as string | undefined,
                        script: aliasObj.script as string | undefined,
                    }
                }).filter((alias: ParsedAlias) => alias.name.trim() !== '')

                if (!entityType || !canonicalName) {
                    entities.push({
                        id: `entity-${index}`,
                        entityType: entityType || '',
                        canonicalName: canonicalName || '',
                        aliases: aliases,
                        isValid: false,
                        error: 'Missing entityType or canonicalName',
                    })
                    return
                }

                // Check if entity exists
                const existingEntity = existingEntities.find(
                    e => (e.entityType as string) === entityType &&
                        ((e.canonicalName as string)?.toLowerCase() === canonicalName.toLowerCase())
                )

                // Check existing aliases
                const existingAliases = (existingEntity?.aliases as Array<Record<string, unknown> | string> || []).map((a: unknown) =>
                    typeof a === 'string' ? a : (a as Record<string, unknown>).alias || (a as Record<string, unknown>).name
                ) as string[]

                const newAliases = aliases.filter((alias: ParsedAlias) =>
                    !existingAliases.some((ea: string) => ea.toLowerCase() === alias.name.toLowerCase())
                )

                entities.push({
                    id: `entity-${index}`,
                    entityType,
                    canonicalName,
                    aliases: aliases,
                    description: entity.description as string | undefined,
                    category: entity.category as string | undefined,
                    tags: entity.tags as string[] | undefined,
                    metadata: entity.metadata as Record<string, unknown> | undefined,
                    isValid: true,
                    exists: !!existingEntity,
                    existingEntityId: existingEntity?.id as string | undefined,
                    existingAliases: existingAliases,
                    newAliases: newAliases,
                })
            })

            setParsedEntities(entities)
        } catch (err) {
            console.error('Failed to parse source JSON:', err)
            setSourceJsonError('Failed to parse entities from JSON')
            setParsedEntities([])
        }
    }

    const handleAutoDiscover = async () => {
        setDiscovering(true)
        try {
            const result = await graphApi.entityDictionary.autoDiscover(datasetId)

            // Transform result to JSON format
            const entities = Array.isArray(result) ? result : (result as Record<string, unknown>).entities || []
            const jsonData = {
                entities: entities.map((entity: Record<string, unknown>) => ({
                    entityType: entity.entityType,
                    canonicalName: entity.canonicalName,
                    aliases: (entity.aliases || []).map((alias: unknown) => {
                        if (typeof alias === 'string') return alias
                        const aliasObj = alias as Record<string, unknown>
                        return {
                            name: aliasObj.alias || aliasObj.name || '',
                            type: aliasObj.type,
                            language: aliasObj.language,
                            script: aliasObj.script,
                        }
                    }).filter((a: unknown) => {
                        if (typeof a === 'string') return a.trim() !== ''
                        return (a as Record<string, unknown>).name || (a as Record<string, unknown>).alias
                    }),
                    description: entity.metadata?.description,
                    category: entity.metadata?.category,
                    tags: entity.metadata?.tags,
                    metadata: entity.metadata,
                }))
            }

            setSourceJson(JSON.stringify(jsonData, null, 2))
            success('Auto Discovery Complete', `Found ${entities.length} entities`)
        } catch (err) {
            console.error('Failed to auto-discover entities:', err)
            showError('Auto Discovery Failed', err instanceof Error ? err.message : 'Failed to discover entities')
        } finally {
            setDiscovering(false)
        }
    }

    const handleDiscoverAliases = async () => {
        setDiscovering(true)
        try {
            const result = await graphApi.entityDictionary.discoverAliases(datasetId)

            // Transform result to JSON format
            const entities = Array.isArray(result) ? result : (result as Record<string, unknown>).entities || []
            const jsonData = {
                entities: entities.map((entity: Record<string, unknown>) => ({
                    entityType: entity.entityType,
                    canonicalName: entity.canonicalName,
                    aliases: (entity.aliases || []).map((alias: unknown) => {
                        if (typeof alias === 'string') return alias
                        const aliasObj = alias as Record<string, unknown>
                        // Handle new format with name and similarity
                        if (aliasObj.name) {
                            return {
                                name: aliasObj.name,
                                type: 'synonym', // Default type
                            }
                        }
                        return {
                            name: aliasObj.alias || aliasObj.name || '',
                            type: aliasObj.type || 'synonym',
                            language: aliasObj.language,
                            script: aliasObj.script,
                        }
                    }).filter((a: unknown) => {
                        if (typeof a === 'string') return a.trim() !== ''
                        return (a as Record<string, unknown>).name || (a as Record<string, unknown>).alias
                    }),
                    description: entity.metadata?.description,
                    category: entity.metadata?.category,
                    tags: entity.metadata?.tags,
                    metadata: entity.metadata,
                }))
            }

            setSourceJson(JSON.stringify(jsonData, null, 2))
            success('Alias Discovery Complete', `Found aliases for ${entities.length} entities`)
        } catch (err) {
            console.error('Failed to discover aliases:', err)
            showError('Alias Discovery Failed', err instanceof Error ? err.message : 'Failed to discover aliases')
        } finally {
            setDiscovering(false)
        }
    }

    const handleSourceJsonChange = (value: string) => {
        setSourceJson(value)
    }

    const updateEntityName = (entityId: string, newName: string) => {
        setParsedEntities(prev => prev.map(entity =>
            entity.id === entityId
                ? { ...entity, canonicalName: newName }
                : entity
        ))
    }

    const updateAliasName = (entityId: string, aliasIndex: number, newName: string) => {
        setParsedEntities(prev => prev.map(entity => {
            if (entity.id !== entityId || !entity.aliases) return entity
            const updatedAliases = [...entity.aliases]
            updatedAliases[aliasIndex] = { ...updatedAliases[aliasIndex], name: newName }
            return { ...entity, aliases: updatedAliases }
        }))
    }

    const updateAliasType = (entityId: string, aliasIndex: number, newType: string) => {
        setParsedEntities(prev => prev.map(entity => {
            if (entity.id !== entityId || !entity.aliases) return entity
            const updatedAliases = [...entity.aliases]
            updatedAliases[aliasIndex] = { ...updatedAliases[aliasIndex], type: newType || undefined }
            return { ...entity, aliases: updatedAliases }
        }))
    }

    const batchUpdateEntities = async () => {
        const validEntities = parsedEntities.filter(e => e.isValid)
        if (validEntities.length === 0) {
            showError('No Valid Entities', 'Please ensure there are valid entities in the source JSON')
            return
        }

        setUpdating(true)
        try {
            const entitiesToImport = validEntities.map(entity => ({
                entityType: entity.entityType,
                canonicalName: entity.canonicalName,
                description: entity.description,
                category: entity.category,
                tags: entity.tags,
                aliases: (entity.aliases || []).map(alias => ({
                    name: alias.name,
                    type: alias.type,
                    language: alias.language,
                    script: alias.script,
                })),
                metadata: entity.metadata,
            }))

            const result = await graphApi.entityDictionary.bulkImport(datasetId, {
                entities: entitiesToImport,
                source: 'auto_discovered',
                options: {
                    skipDuplicates: false,
                    updateExisting: true,
                    defaultConfidence: 0.8,
                },
            })

            success('Batch Update Complete', `Processed ${result.created || 0} new entities, ${result.skipped || 0} skipped`)
            await loadExistingEntities()
            onEntitiesCreated?.()
        } catch (err) {
            console.error('Failed to batch update entities:', err)
            showError('Batch Update Failed', err instanceof Error ? err.message : 'Failed to update entities')
        } finally {
            setUpdating(false)
        }
    }

    // Shared sections (Source, Preview, Batch Update)
    const renderSourceSection = () => (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Source</CardTitle>
                    {sourceJson && (
                        <span className="text-sm text-gray-500">
                            {sourceJson.length.toLocaleString()} characters
                        </span>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Label htmlFor="sourceJson">JSON Source</Label>
                    <Textarea
                        id="sourceJson"
                        value={sourceJson}
                        onChange={(e) => handleSourceJsonChange(e.target.value)}
                        rows={20}
                        placeholder='Discovery results will appear here...'
                        className={`font-mono text-sm ${sourceJsonError ? 'border-red-300' : ''}`}
                        style={{
                            minHeight: '400px',
                            maxHeight: '800px',
                            resize: 'vertical'
                        }}
                    />
                    {sourceJsonError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-sm text-red-600 font-medium mb-1">JSON Parse Error:</p>
                            <p className="text-sm text-red-600 font-mono">{sourceJsonError}</p>
                        </div>
                    )}
                    {sourceJson && !sourceJsonError && (
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-green-600">✓ Valid JSON</p>
                            {parsedEntities.length > 0 && (
                                <span className="text-sm text-gray-500">
                                    • {parsedEntities.length} {parsedEntities.length === 1 ? 'entity' : 'entities'} parsed
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    const renderPreviewSection = () => (
        parsedEntities.length > 0 && (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Preview</CardTitle>
                        <Button
                            onClick={batchUpdateEntities}
                            disabled={updating || parsedEntities.filter(e => e.isValid).length === 0}
                            size="sm"
                        >
                            {updating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Batch Update
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            Entities ({parsedEntities.length})
                        </h3>
                        <div className="space-y-3">
                            {parsedEntities.map((entity) => {
                                const key = `entity-${entity.id}`
                                return (
                                    <div
                                        key={key}
                                        className={`p-4 border rounded-md ${entity.isValid ? 'border-gray-200' : 'border-red-300'} ${entity.exists ? 'bg-blue-50' : 'bg-white'}`}
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge variant={entity.isValid ? 'default' : 'destructive'}>
                                                    {entity.entityType}
                                                </Badge>
                                                <Input
                                                    value={entity.canonicalName}
                                                    onChange={(e) => updateEntityName(entity.id!, e.target.value)}
                                                    className="font-medium max-w-xs"
                                                    placeholder="Entity name"
                                                />
                                                {entity.exists && (
                                                    <Badge variant="secondary">Already Exists</Badge>
                                                )}
                                                {!entity.exists && (
                                                    <Badge variant="outline" className="bg-green-50">New</Badge>
                                                )}
                                            </div>
                                            {entity.error && (
                                                <p className="text-sm text-red-600">{entity.error}</p>
                                            )}
                                            {entity.description && (
                                                <p className="text-sm text-gray-600">{entity.description}</p>
                                            )}
                                            {entity.aliases && entity.aliases.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-sm font-medium text-gray-700">Aliases:</p>
                                                    <div className="space-y-2">
                                                        {entity.aliases.map((alias: ParsedAlias, idx: number) => {
                                                            if (!alias.name) return null

                                                            const aliasExists = entity.existingAliases?.some(
                                                                (ea: string) => ea.toLowerCase() === alias.name.toLowerCase()
                                                            )
                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 flex-wrap p-2 border rounded-md bg-gray-50">
                                                                    <Input
                                                                        value={alias.name}
                                                                        onChange={(e) => updateAliasName(entity.id!, idx, e.target.value)}
                                                                        className="flex-1 min-w-[150px]"
                                                                        placeholder="Alias name"
                                                                    />
                                                                    <select
                                                                        value={alias.type || ''}
                                                                        onChange={(e) => updateAliasType(entity.id!, idx, e.target.value)}
                                                                        className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                                    >
                                                                        <option value="">No Type</option>
                                                                        {ALIAS_TYPES.map(type => (
                                                                            <option key={type.value} value={type.value}>
                                                                                {type.label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    {aliasExists && (
                                                                        <Badge variant="secondary" className="text-xs">exists</Badge>
                                                                    )}
                                                                    {!aliasExists && (
                                                                        <Badge variant="outline" className="bg-green-50 text-xs">new</Badge>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {entity.category && (
                                                <p className="text-sm text-gray-500">Category: {entity.category}</p>
                                            )}
                                            {entity.tags && entity.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {entity.tags.map((tag, idx) => (
                                                        <Badge key={idx} variant="outline" className="text-xs">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    )

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'auto-discover' | 'discover-aliases')}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="auto-discover">Auto Discover</TabsTrigger>
                    <TabsTrigger value="discover-aliases">Discover Aliases</TabsTrigger>
                </TabsList>

                <TabsContent value="auto-discover" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Auto Discover Entities</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600">
                                    Automatically discover entities from your graph data. This will analyze nodes and extract potential entities.
                                </p>
                                <Button
                                    onClick={handleAutoDiscover}
                                    disabled={discovering}
                                    className="w-full"
                                >
                                    {discovering ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Discovering...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                            Start Auto Discovery
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shared Source Section */}
                    {renderSourceSection()}

                    {/* Shared Preview Section */}
                    {renderPreviewSection()}
                </TabsContent>

                <TabsContent value="discover-aliases" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Discover Aliases</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600">
                                    Discover aliases for existing entities by analyzing graph relationships and node variations.
                                </p>
                                <Button
                                    onClick={handleDiscoverAliases}
                                    disabled={discovering}
                                    className="w-full"
                                >
                                    {discovering ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Discovering...
                                        </>
                                    ) : (
                                        <>
                                            <Lightbulb className="h-4 w-4 mr-2" />
                                            Start Alias Discovery
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shared Source Section */}
                    {renderSourceSection()}

                    {/* Shared Preview Section */}
                    {renderPreviewSection()}
                </TabsContent>
            </Tabs>
        </div>
    )
}

