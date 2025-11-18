'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play, Check, X, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { promptApi, aiProviderApi, graphApi, type Prompt, type AiProvider, type AiProviderModel } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface EntityGeneratorProps {
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
    metadata?: Record<string, any>
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

export function EntityGenerator({ datasetId, onEntitiesCreated }: EntityGeneratorProps) {
    const { success, error: showError } = useToast()
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [selectedPromptId, setSelectedPromptId] = useState<string>('')
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
    const [aiProviders, setAiProviders] = useState<AiProvider[]>([])
    const [selectedProviderId, setSelectedProviderId] = useState<string>('')
    const [models, setModels] = useState<AiProviderModel[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('')
    const [systemPrompt, setSystemPrompt] = useState<string>('')
    const [userPrompt, setUserPrompt] = useState<string>('')
    const [jsonSchema, setJsonSchema] = useState<string>('')
    const [temperature, setTemperature] = useState<number>(0.7)
    const [loadingPrompts, setLoadingPrompts] = useState(false)
    const [loadingProviders, setLoadingProviders] = useState(false)
    const [loadingModels, setLoadingModels] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [sourceJson, setSourceJson] = useState<string>('')
    const [sourceJsonError, setSourceJsonError] = useState<string>('')
    const [parsedEntities, setParsedEntities] = useState<ParsedEntity[]>([])
    const [existingEntities, setExistingEntities] = useState<any[]>([])
    const [updating, setUpdating] = useState(false)
    const [showSavePromptDialog, setShowSavePromptDialog] = useState(false)
    const [saveAsNew, setSaveAsNew] = useState(false)
    const [newPromptTitle, setNewPromptTitle] = useState('')
    const [savingPrompt, setSavingPrompt] = useState(false)
    const [aiGenerationCollapsed, setAiGenerationCollapsed] = useState(true)
    const [activeTab, setActiveTab] = useState<'generate' | 'import'>('generate')
    const [importFile, setImportFile] = useState<File | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    // Load prompts and providers on mount
    useEffect(() => {
        loadPrompts()
        loadAiProviders()
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

    // Load models when provider changes
    useEffect(() => {
        if (selectedProviderId && aiProviders.length > 0) {
            loadModels(selectedProviderId)
        } else {
            setModels([])
            setSelectedModel('')
        }
    }, [selectedProviderId, aiProviders])

    // Auto-fill when prompt is selected
    useEffect(() => {
        if (selectedPrompt) {
            setSystemPrompt(selectedPrompt.systemPrompt || '')
            setUserPrompt(selectedPrompt.userPromptTemplate || '')
            setJsonSchema(selectedPrompt.jsonSchema ? JSON.stringify(selectedPrompt.jsonSchema, null, 2) : '')
        }
    }, [selectedPrompt])

    const loadPrompts = async () => {
        setLoadingPrompts(true)
        try {
            const response = await promptApi.getAll()
            setPrompts(response.data || [])
        } catch (err) {
            console.error('Failed to load prompts:', err)
            showError('Failed to Load', 'Could not load prompts')
        } finally {
            setLoadingPrompts(false)
        }
    }

    const loadAiProviders = async () => {
        setLoadingProviders(true)
        try {
            const response = await aiProviderApi.getAll()
            setAiProviders(response.data || [])
        } catch (err) {
            console.error('Failed to load AI providers:', err)
            showError('Failed to Load', 'Could not load AI providers')
        } finally {
            setLoadingProviders(false)
        }
    }

    const loadModels = async (providerId: string) => {
        setLoadingModels(true)
        try {
            const provider = aiProviders.find(p => p.id === providerId)
            if (provider && provider.models) {
                setModels(provider.models || [])
            } else {
                setModels([])
            }
        } catch (err) {
            console.error('Failed to load models:', err)
            showError('Failed to Load', 'Could not load models')
        } finally {
            setLoadingModels(false)
        }
    }

    const loadExistingEntities = async () => {
        try {
            const response = await graphApi.entityDictionary.getEntities(datasetId, { limit: 1000 })
            setExistingEntities(response.entities || [])
        } catch (err) {
            console.error('Failed to load existing entities:', err)
        }
    }

    const handlePromptChange = (promptId: string) => {
        setSelectedPromptId(promptId)
        const prompt = prompts.find(p => p.id === promptId)
        setSelectedPrompt(prompt || null)
    }

    const handleUpdatePrompt = () => {
        if (!selectedPrompt) {
            showError('No Prompt Selected', 'Please select a prompt to update')
            return
        }
        if (!systemPrompt && !userPrompt) {
            showError('Missing Content', 'Please provide system prompt or user prompt to save')
            return
        }
        setShowSavePromptDialog(true)
        setSaveAsNew(false)
        setNewPromptTitle(selectedPrompt.name)
    }

    const handleSaveAsNew = () => {
        if (!systemPrompt && !userPrompt) {
            showError('Missing Content', 'Please provide system prompt or user prompt to save')
            return
        }
        setShowSavePromptDialog(true)
        setSaveAsNew(true)
        if (selectedPrompt) {
            setNewPromptTitle(`${selectedPrompt.name} copy`)
        } else {
            setNewPromptTitle('')
        }
    }

    const confirmSavePrompt = async () => {
        if (!newPromptTitle.trim()) {
            showError('Missing Title', 'Please enter a prompt title')
            return
        }

        const schemaValidation = validateJsonSchema(jsonSchema)
        if (!schemaValidation.isValid) {
            showError('Invalid JSON Schema', schemaValidation.error || 'Please fix JSON schema errors')
            return
        }

        setSavingPrompt(true)
        try {
            const promptData = {
                name: newPromptTitle.trim(),
                systemPrompt,
                userPromptTemplate: userPrompt,
                jsonSchema: schemaValidation.parsed,
                description: selectedPrompt?.description || '',
                type: selectedPrompt?.type || 'graph',
                isGlobal: false,
                isActive: true,
            }

            if (saveAsNew || !selectedPrompt) {
                // Create new prompt
                const newPrompt = await promptApi.create(promptData)
                success('Prompt Saved', `Prompt "${newPrompt.name}" has been saved successfully`)
                // Reload prompts and select the new one
                await loadPrompts()
                setSelectedPromptId(newPrompt.id)
                setSelectedPrompt(newPrompt)
            } else {
                // Update existing prompt
                await promptApi.update(selectedPrompt.id, promptData)
                success('Prompt Updated', `Prompt "${newPromptTitle}" has been updated successfully`)
                // Reload prompts
                await loadPrompts()
            }

            setShowSavePromptDialog(false)
        } catch (err) {
            console.error('Failed to save prompt:', err)
            showError('Save Failed', err instanceof Error ? err.message : 'Failed to save prompt')
        } finally {
            setSavingPrompt(false)
        }
    }

    const validateJsonSchema = (jsonString: string): { isValid: boolean; parsed?: any; error?: string } => {
        if (!jsonString.trim()) {
            return { isValid: true, parsed: undefined }
        }
        try {
            const parsed = JSON.parse(jsonString)
            return { isValid: true, parsed }
        } catch (err) {
            return { isValid: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
        }
    }

    const validateSourceJson = (jsonString: string): { isValid: boolean; parsed?: any; error?: string } => {
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
                // Extract line and column from error message if available
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
            const parsed = validation.parsed
            const entities: ParsedEntity[] = []

            // Support both 'entities' array and direct array format
            const entitiesArray = parsed.entities || (Array.isArray(parsed) ? parsed : [])

            entitiesArray.forEach((entity: any, index: number) => {
                const entityType = entity.entityType || entity.type
                const canonicalName = entity.canonicalName || entity.name || entity.label
                const rawAliases = entity.aliases || []

                // Normalize aliases to ParsedAlias format (handle both string and object formats)
                const aliases: ParsedAlias[] = rawAliases.map((alias: any): ParsedAlias => {
                    if (typeof alias === 'string') {
                        return { name: alias }
                    }
                    return {
                        name: alias.name || alias.alias || '',
                        type: alias.type,
                        language: alias.language,
                        script: alias.script,
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
                    e => e.entityType === entityType &&
                        e.canonicalName.toLowerCase() === canonicalName.toLowerCase()
                )

                // Check existing aliases
                const existingAliases = existingEntity?.aliases?.map((a: any) =>
                    typeof a === 'string' ? a : a.alias || a.name
                ) || []

                const newAliases = aliases.filter((alias: ParsedAlias) =>
                    !existingAliases.some((ea: string) => ea.toLowerCase() === alias.name.toLowerCase())
                )

                entities.push({
                    id: `entity-${index}`,
                    entityType,
                    canonicalName,
                    aliases: aliases,
                    description: entity.description,
                    category: entity.category,
                    tags: entity.tags,
                    metadata: entity.metadata,
                    isValid: true,
                    exists: !!existingEntity,
                    existingEntityId: existingEntity?.id,
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

    const generateEntities = async () => {
        if (!selectedProviderId || !selectedModel) {
            showError('Missing Configuration', 'Please select AI provider and model')
            return
        }

        if (!systemPrompt && !userPrompt) {
            showError('Missing Prompt', 'Please provide system prompt or user prompt')
            return
        }

        const schemaValidation = validateJsonSchema(jsonSchema)
        if (!schemaValidation.isValid) {
            showError('Invalid JSON Schema', schemaValidation.error || 'Please fix JSON schema errors')
            return
        }

        setGenerating(true)

        try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt })
            }
            if (userPrompt) {
                messages.push({ role: 'user', content: userPrompt })
            }

            const response = await aiProviderApi.chatCompletion(selectedProviderId, {
                messages,
                model: selectedModel,
                jsonSchema: schemaValidation.parsed,
                temperature,
            })

            const content = response.data.choices[0]?.message?.content || ''

            // Extract JSON from markdown code blocks if present
            let jsonString = content.trim()
            const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            if (jsonMatch) {
                jsonString = jsonMatch[1]
            }

            // Auto-fill source JSON
            setSourceJson(jsonString)
        } catch (err) {
            console.error('Failed to generate entities:', err)
            showError('Generation Failed', err instanceof Error ? err.message : 'Failed to generate entities')
        } finally {
            setGenerating(false)
        }
    }

    const handleSourceJsonChange = (value: string) => {
        setSourceJson(value)
        // Validation happens in useEffect
    }

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        // Only allow JSON files
        if (!file.name.toLowerCase().endsWith('.json')) {
            showError('Invalid File Type', 'Please upload a JSON file')
            return
        }

        setImportFile(file)
        const reader = new FileReader()

        reader.onload = (e) => {
            const content = e.target?.result as string
            setSourceJson(content)
        }

        reader.onerror = () => {
            showError('File Read Error', 'Failed to read the file')
        }

        reader.readAsText(file)
    }

    const resetImport = () => {
        setImportFile(null)
        setSourceJson('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
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
                source: activeTab === 'import' ? 'imported' : 'generated',
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

    const schemaValidation = validateJsonSchema(jsonSchema)

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
                        placeholder='Enter JSON string or paste LLM response...\n\nExample:\n{\n  "entities": [\n    {\n      "entityType": "person",\n      "canonicalName": "John Doe",\n      "aliases": ["JD", "Johnny"]\n    }\n  ]\n}'
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
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'generate' | 'import')}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="generate">Generate</TabsTrigger>
                    <TabsTrigger value="import">Import</TabsTrigger>
                </TabsList>

                <TabsContent value="generate" className="space-y-6">
                    {/* AI Generation Section - Collapsible */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setAiGenerationCollapsed(!aiGenerationCollapsed)}
                                    className="w-full justify-between p-0 h-auto font-normal"
                                >
                                    <Label className="text-base font-semibold">AI Generation</Label>
                                    {aiGenerationCollapsed ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronUp className="h-4 w-4" />
                                    )}
                                </Button>
                                {!aiGenerationCollapsed && (
                                    <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                                        {/* Prompt Selection */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="prompt">Prompt Template</Label>
                                                <div className="flex gap-2">
                                                    {selectedPrompt && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={handleUpdatePrompt}
                                                        >
                                                            <Save className="h-4 w-4 mr-1" />
                                                            Update
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleSaveAsNew}
                                                    >
                                                        <Save className="h-4 w-4 mr-1" />
                                                        Save as New
                                                    </Button>
                                                </div>
                                            </div>
                                            <select
                                                id="prompt"
                                                value={selectedPromptId}
                                                onChange={(e) => handlePromptChange(e.target.value)}
                                                disabled={loadingPrompts}
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Select Prompt</option>
                                                {prompts.map((prompt) => (
                                                    <option key={prompt.id} value={prompt.id}>
                                                        {prompt.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {loadingPrompts && (
                                                <p className="text-sm text-gray-500">Loading prompts...</p>
                                            )}
                                        </div>

                                        {/* System Prompt */}
                                        <div className="space-y-2">
                                            <Label htmlFor="systemPrompt">System Prompt</Label>
                                            <Textarea
                                                id="systemPrompt"
                                                value={systemPrompt}
                                                onChange={(e) => setSystemPrompt(e.target.value)}
                                                rows={4}
                                                placeholder="Enter system prompt..."
                                                className="font-mono text-sm"
                                            />
                                        </div>

                                        {/* User Prompt */}
                                        <div className="space-y-2">
                                            <Label htmlFor="userPrompt">User Prompt</Label>
                                            <Textarea
                                                id="userPrompt"
                                                value={userPrompt}
                                                onChange={(e) => setUserPrompt(e.target.value)}
                                                rows={4}
                                                placeholder="Enter user prompt..."
                                                className="font-mono text-sm"
                                            />
                                        </div>

                                        {/* JSON Schema */}
                                        <div className="space-y-2">
                                            <Label htmlFor="jsonSchema">JSON Schema</Label>
                                            <Textarea
                                                id="jsonSchema"
                                                value={jsonSchema}
                                                onChange={(e) => setJsonSchema(e.target.value)}
                                                rows={8}
                                                placeholder="Enter JSON schema (optional)..."
                                                className={`font-mono text-sm ${schemaValidation.isValid ? '' : 'border-red-300'}`}
                                            />
                                            {schemaValidation.error && (
                                                <p className="text-sm text-red-600">{schemaValidation.error}</p>
                                            )}
                                            {jsonSchema && schemaValidation.isValid && (
                                                <p className="text-sm text-green-600">✓ Valid JSON</p>
                                            )}
                                        </div>

                                        {/* AI Provider Selection */}
                                        <div className="space-y-2">
                                            <Label htmlFor="aiProvider">AI Provider</Label>
                                            <select
                                                id="aiProvider"
                                                value={selectedProviderId}
                                                onChange={(e) => setSelectedProviderId(e.target.value)}
                                                disabled={loadingProviders}
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Select AI Provider</option>
                                                {aiProviders.map((provider) => (
                                                    <option key={provider.id} value={provider.id}>
                                                        {provider.name} ({provider.type})
                                                    </option>
                                                ))}
                                            </select>
                                            {loadingProviders && (
                                                <p className="text-sm text-gray-500">Loading AI providers...</p>
                                            )}
                                        </div>

                                        {/* Model Selection */}
                                        <div className="space-y-2">
                                            <Label htmlFor="model">Model</Label>
                                            <select
                                                id="model"
                                                value={selectedModel}
                                                onChange={(e) => setSelectedModel(e.target.value)}
                                                disabled={loadingModels || !selectedProviderId}
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Select Model</option>
                                                {models.map((model) => (
                                                    <option key={model.id} value={model.id}>
                                                        {model.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {loadingModels && (
                                                <p className="text-sm text-gray-500">Loading models...</p>
                                            )}
                                            {!selectedProviderId && (
                                                <p className="text-sm text-gray-500">Please select an AI provider first</p>
                                            )}
                                        </div>

                                        {/* Temperature */}
                                        <div className="space-y-2">
                                            <Label htmlFor="temperature">Temperature: {temperature}</Label>
                                            <input
                                                type="range"
                                                id="temperature"
                                                min="0"
                                                max="2"
                                                step="0.1"
                                                value={temperature}
                                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Generate Button */}
                                        <Button
                                            onClick={generateEntities}
                                            disabled={generating || !selectedProviderId || !selectedModel}
                                            className="w-full"
                                        >
                                            {generating ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="h-4 w-4 mr-2" />
                                                    Generate Entities
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shared Source Section */}
                    {renderSourceSection()}

                    {/* Shared Preview Section */}
                    {renderPreviewSection()}
                </TabsContent>

                <TabsContent value="import" className="space-y-6">
                    {/* File Upload Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Upload JSON File</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <Input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={handleFileUpload}
                                    className="cursor-pointer"
                                />
                                {importFile && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <span>Selected: {importFile.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={resetImport}
                                            className="h-6 px-2"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shared Source Section */}
                    {renderSourceSection()}

                    {/* Shared Preview Section */}
                    {renderPreviewSection()}
                </TabsContent>
            </Tabs>

            {/* Save Prompt Dialog */}
            <Dialog open={showSavePromptDialog} onOpenChange={setShowSavePromptDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {saveAsNew || !selectedPrompt ? 'Save Prompt as New' : 'Update Prompt'}
                        </DialogTitle>
                        <DialogDescription>
                            {saveAsNew || !selectedPrompt
                                ? 'Enter a title for the new prompt. The prompt will be saved to your prompt library.'
                                : 'This will update the selected prompt with the current content.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="promptTitle">Prompt Title</Label>
                            <Input
                                id="promptTitle"
                                value={newPromptTitle}
                                onChange={(e) => setNewPromptTitle(e.target.value)}
                                placeholder="Enter prompt title..."
                                disabled={!saveAsNew && selectedPrompt !== null}
                            />
                            {!saveAsNew && selectedPrompt && (
                                <p className="text-sm text-gray-500">
                                    Updating prompt: {selectedPrompt.name}
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowSavePromptDialog(false)}
                            disabled={savingPrompt}
                        >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmSavePrompt}
                            disabled={savingPrompt || !newPromptTitle.trim()}
                        >
                            {savingPrompt ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    {saveAsNew || !selectedPrompt ? 'Save' : 'Update'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

