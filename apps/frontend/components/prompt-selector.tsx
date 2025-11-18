'use client'

import { useState, useEffect, useRef } from 'react'
import { Edit, Save, Copy, Loader2, X, Search, ChevronDown, Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { promptApi, type Prompt } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'

interface PromptSelectorProps {
    value?: string // promptId
    onChange: (promptId: string) => void
    disabled?: boolean
    label?: string
    placeholder?: string
    promptType?: string // Filter prompts by type
    className?: string
}

export function PromptSelector({
    value,
    onChange,
    disabled = false,
    label = 'Prompt Template',
    placeholder = 'Search and select prompt...',
    promptType,
    className = ''
}: PromptSelectorProps) {
    const { success, error: showError } = useToast()
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isCreating, setIsCreating] = useState(false)

    // Autocomplete state
    const [searchQuery, setSearchQuery] = useState('')
    const [showDropdown, setShowDropdown] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Editing state
    const [editName, setEditName] = useState('')
    const [editSystemPrompt, setEditSystemPrompt] = useState('')
    const [editUserPromptTemplate, setEditUserPromptTemplate] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [editJsonSchema, setEditJsonSchema] = useState('')
    const [jsonSchemaError, setJsonSchemaError] = useState<string | null>(null)

    // Confirmation modal state
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const [confirmModalName, setConfirmModalName] = useState('')
    const [confirmAction, setConfirmAction] = useState<'update' | 'saveAsNew' | null>(null)

    // Preview state - collapsible sections
    const [showSystemPrompt, setShowSystemPrompt] = useState(false)
    const [showUserTemplate, setShowUserTemplate] = useState(false)
    const [showJsonSchema, setShowJsonSchema] = useState(false)

    // Load prompts
    useEffect(() => {
        loadPrompts()
    }, [])

    // Load selected prompt when value changes
    useEffect(() => {
        if (value && prompts.length > 0) {
            const prompt = prompts.find(p => p.id === value)
            if (prompt) {
                setSelectedPrompt(prompt)
                initializeEditState(prompt)
                // Reset collapsible sections when prompt changes
                setShowSystemPrompt(false)
                setShowUserTemplate(false)
                setShowJsonSchema(false)
            } else {
                // Prompt not found in list, try to load it
                loadPromptDetails(value)
            }
        } else {
            setSelectedPrompt(null)
            setSearchQuery('')
            // Reset collapsible sections
            setShowSystemPrompt(false)
            setShowUserTemplate(false)
            setShowJsonSchema(false)
        }
    }, [value, prompts])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current && !inputRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
                setHighlightedIndex(-1)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const loadPrompts = async () => {
        setLoading(true)
        try {
            // Fetch ALL prompts from the backend prompt module via /api/prompts
            const response = await promptApi.getAll({
                limit: 1000, // Get all prompts
                sort: 'name,ASC'
            })

            let filteredPrompts = response.data || []

            if (filteredPrompts.length === 0) {
                showError('No Prompts Found', 'The prompt module is empty. Please create prompts in the Prompts management page.')
            }

            // Filter by type if specified
            if (promptType) {
                filteredPrompts = filteredPrompts.filter(p => p.type === promptType)
            }

            // Set prompts from backend - NO hardcoded data
            setPrompts(filteredPrompts)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            showError('Failed to Load Prompts', `Could not load prompts from backend: ${errorMessage}`)
            // Don't set empty array on error - keep previous prompts if any
        } finally {
            setLoading(false)
        }
    }

    const loadPromptDetails = async (promptId: string) => {
        try {
            const prompt = await promptApi.getById(promptId)
            setSelectedPrompt(prompt)
            initializeEditState(prompt)
        } catch (err: any) {
            // Check if it's a 404 error (prompt not found)
            const isNotFound = err?.response?.status === 404 ||
                err?.status === 404 ||
                (err instanceof Error && err.message.includes('404')) ||
                (err?.message?.includes('not found') || err?.message?.includes('Not Found'))

            if (isNotFound) {
                // Clear the invalid prompt ID from settings
                onChange('')
                setSelectedPrompt(null)
                setSearchQuery('')
                showError(
                    'Prompt Not Found',
                    `The selected prompt (ID: ${promptId.substring(0, 8)}...) no longer exists. Please select a new prompt.`
                )
            }
        }
    }

    const initializeEditState = (prompt: Prompt) => {
        setEditName(prompt.name)
        setEditSystemPrompt(prompt.systemPrompt)
        setEditUserPromptTemplate(prompt.userPromptTemplate || '')
        setEditDescription(prompt.description || '')
        setEditJsonSchema(prompt.jsonSchema ? JSON.stringify(prompt.jsonSchema, null, 2) : '')
        setJsonSchemaError(null)
    }

    const validateJsonSchema = (jsonString: string): { isValid: boolean; parsed?: unknown; error?: string } => {
        if (!jsonString.trim()) {
            setJsonSchemaError(null)
            return { isValid: true, parsed: undefined }
        }
        try {
            const parsed = JSON.parse(jsonString)
            setJsonSchemaError(null)
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
            setJsonSchemaError(error)
            return { isValid: false, error }
        }
    }

    const handleJsonSchemaChange = (value: string) => {
        setEditJsonSchema(value)
        // Validate in real-time but allow editing
        validateJsonSchema(value)
    }

    const handleJsonSchemaBlur = () => {
        // Format JSON on blur if valid
        const { isValid, parsed } = validateJsonSchema(editJsonSchema)
        if (isValid && parsed && editJsonSchema.trim()) {
            setEditJsonSchema(JSON.stringify(parsed, null, 2))
        }
    }

    // Filter prompts based on search query
    const filteredPrompts = prompts.filter(prompt => {
        if (!searchQuery.trim()) return true
        const query = searchQuery.toLowerCase()
        return (
            prompt.name.toLowerCase().includes(query) ||
            prompt.description?.toLowerCase().includes(query) ||
            prompt.systemPrompt.toLowerCase().includes(query)
        )
    })

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value
        setSearchQuery(query)
        setShowDropdown(true)
        setHighlightedIndex(-1)
    }

    const handleInputFocus = () => {
        setShowDropdown(true)
    }

    const handleSelectPrompt = (prompt: Prompt) => {
        onChange(prompt.id)
        setSelectedPrompt(prompt)
        initializeEditState(prompt)
        setSearchQuery(prompt.name)
        setShowDropdown(false)
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || filteredPrompts.length === 0) return

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setHighlightedIndex(prev =>
                    prev < filteredPrompts.length - 1 ? prev + 1 : prev
                )
                break
            case 'ArrowUp':
                e.preventDefault()
                setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
                break
            case 'Enter':
                e.preventDefault()
                if (highlightedIndex >= 0 && highlightedIndex < filteredPrompts.length) {
                    handleSelectPrompt(filteredPrompts[highlightedIndex])
                }
                break
            case 'Escape':
                setShowDropdown(false)
                setHighlightedIndex(-1)
                break
        }
    }

    const handleEdit = () => {
        if (selectedPrompt) {
            setIsEditing(true)
        }
    }

    const handleCancelEdit = () => {
        if (selectedPrompt) {
            initializeEditState(selectedPrompt)
        }
        setIsEditing(false)
    }

    const handleUpdate = () => {
        if (!selectedPrompt) return

        // Validate JSON schema before showing modal
        const { isValid } = validateJsonSchema(editJsonSchema)
        if (!isValid && editJsonSchema.trim()) {
            showError('Invalid JSON Schema', jsonSchemaError || 'Please fix JSON schema errors before saving')
            return
        }

        // Show confirmation modal
        setConfirmModalName(editName)
        setConfirmAction('update')
        setShowConfirmModal(true)
    }

    const handleConfirmUpdate = async () => {
        if (!selectedPrompt || !confirmModalName.trim()) {
            showError('Name Required', 'Please provide a name for the prompt')
            return
        }

        // Validate JSON schema before saving
        const { isValid, parsed } = validateJsonSchema(editJsonSchema)
        if (!isValid && editJsonSchema.trim()) {
            showError('Invalid JSON Schema', jsonSchemaError || 'Please fix JSON schema errors before saving')
            setShowConfirmModal(false)
            return
        }

        setIsSaving(true)
        setShowConfirmModal(false)
        try {
            const updated = await promptApi.update(selectedPrompt.id, {
                name: confirmModalName.trim(),
                systemPrompt: editSystemPrompt,
                userPromptTemplate: editUserPromptTemplate || undefined,
                description: editDescription || undefined,
                jsonSchema: parsed || undefined,
            })

            setSelectedPrompt(updated)
            setIsEditing(false)
            success('Prompt Updated', `"${updated.name}" has been updated successfully`)

            // Reload prompts to get updated list
            await loadPrompts()
            // Update the selected value
            onChange(updated.id)
        } catch (err) {
            console.error('Failed to update prompt:', err)
            showError('Update Failed', err instanceof Error ? err.message : 'Failed to update prompt')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveAsNew = () => {
        if (!selectedPrompt) return

        // Validate JSON schema before showing modal
        const { isValid } = validateJsonSchema(editJsonSchema)
        if (!isValid && editJsonSchema.trim()) {
            showError('Invalid JSON Schema', jsonSchemaError || 'Please fix JSON schema errors before saving')
            return
        }

        // Show confirmation modal with default name
        setConfirmModalName(editName || `${selectedPrompt.name} (Copy)`)
        setConfirmAction('saveAsNew')
        setShowConfirmModal(true)
    }

    const handleConfirmSaveAsNew = async () => {
        if (!selectedPrompt || !confirmModalName.trim()) {
            showError('Name Required', 'Please provide a name for the new prompt')
            return
        }

        // Validate JSON schema before saving
        const { isValid, parsed } = validateJsonSchema(editJsonSchema)
        if (!isValid && editJsonSchema.trim()) {
            showError('Invalid JSON Schema', jsonSchemaError || 'Please fix JSON schema errors before saving')
            setShowConfirmModal(false)
            return
        }

        setIsCreating(true)
        setShowConfirmModal(false)
        try {
            const newPrompt = await promptApi.create({
                name: confirmModalName.trim(),
                systemPrompt: editSystemPrompt,
                userPromptTemplate: editUserPromptTemplate || undefined,
                description: editDescription || undefined,
                type: selectedPrompt.type,
                isGlobal: false,
                isActive: true,
                jsonSchema: parsed || undefined,
            })

            success('Prompt Created', `"${newPrompt.name}" has been created successfully`)

            // Reload prompts to include the new one
            await loadPrompts()

            // Select the new prompt
            handleSelectPrompt(newPrompt)
        } catch (err) {
            console.error('Failed to create prompt:', err)
            showError('Create Failed', err instanceof Error ? err.message : 'Failed to create new prompt')
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Prompt Selection with Autocomplete */}
            <div className="space-y-2">
                <Label htmlFor="prompt-select">{label}</Label>
                <div className="relative">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            ref={inputRef}
                            id="prompt-select"
                            type="text"
                            value={searchQuery}
                            onChange={handleInputChange}
                            onFocus={handleInputFocus}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            disabled={disabled || loading}
                            className="pl-10 pr-10"
                        />
                        {loading && (
                            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                        )}
                        {searchQuery && !loading && (
                            <button
                                onClick={() => {
                                    setSearchQuery('')
                                    setShowDropdown(false)
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {showDropdown && filteredPrompts.length > 0 && (
                        <div
                            ref={dropdownRef}
                            className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                        >
                            {filteredPrompts.map((prompt, index) => (
                                <button
                                    key={prompt.id}
                                    type="button"
                                    onClick={() => handleSelectPrompt(prompt)}
                                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between ${index === highlightedIndex ? 'bg-gray-100' : ''
                                        } ${value === prompt.id ? 'bg-blue-50' : ''}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-gray-900 truncate">
                                            {prompt.name}
                                        </div>
                                        {prompt.description && (
                                            <div className="text-xs text-gray-500 truncate mt-0.5">
                                                {prompt.description}
                                            </div>
                                        )}
                                    </div>
                                    {value === prompt.id && (
                                        <Check className="h-4 w-4 text-blue-600 ml-2 flex-shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {showDropdown && searchQuery && filteredPrompts.length === 0 && !loading && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 text-center text-sm text-gray-500">
                            No prompts found
                        </div>
                    )}
                </div>
            </div>

            {/* Selected Prompt Display/Edit */}
            {selectedPrompt && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
                    {!isEditing ? (
                        <>
                            {/* Display Mode - Compact */}
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-sm text-gray-900 truncate">
                                            {selectedPrompt.name}
                                        </h4>
                                        {selectedPrompt.description && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                                {selectedPrompt.description}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        onClick={handleEdit}
                                        size="sm"
                                        variant="outline"
                                        className="flex-shrink-0"
                                    >
                                        <Edit className="h-3 w-3 mr-1" />
                                        Edit
                                    </Button>
                                </div>

                                {/* Collapsible Sections */}
                                <div className="space-y-1 border-t pt-2">
                                    {/* System Prompt */}
                                    <button
                                        type="button"
                                        onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                    >
                                        <span className="font-medium">System Prompt</span>
                                        {showSystemPrompt ? (
                                            <ChevronDown className="h-3 w-3" />
                                        ) : (
                                            <ChevronRight className="h-3 w-3" />
                                        )}
                                    </button>
                                    {showSystemPrompt && (
                                        <div className="ml-2 mb-2">
                                            <div className="whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200 max-h-32 overflow-y-auto text-xs font-mono text-gray-700">
                                                {selectedPrompt.systemPrompt}
                                            </div>
                                        </div>
                                    )}

                                    {/* User Prompt Template */}
                                    {selectedPrompt.userPromptTemplate && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setShowUserTemplate(!showUserTemplate)}
                                                className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                            >
                                                <span className="font-medium">User Template</span>
                                                {showUserTemplate ? (
                                                    <ChevronDown className="h-3 w-3" />
                                                ) : (
                                                    <ChevronRight className="h-3 w-3" />
                                                )}
                                            </button>
                                            {showUserTemplate && (
                                                <div className="ml-2 mb-2">
                                                    <div className="whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200 max-h-24 overflow-y-auto text-xs font-mono text-gray-700">
                                                        {selectedPrompt.userPromptTemplate}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* JSON Schema */}
                                    {selectedPrompt.jsonSchema && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setShowJsonSchema(!showJsonSchema)}
                                                className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                            >
                                                <span className="font-medium">JSON Schema</span>
                                                {showJsonSchema ? (
                                                    <ChevronDown className="h-3 w-3" />
                                                ) : (
                                                    <ChevronRight className="h-3 w-3" />
                                                )}
                                            </button>
                                            {showJsonSchema && (
                                                <div className="ml-2 mb-2">
                                                    <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200 max-h-32 overflow-y-auto text-xs font-mono text-gray-700">
                                                        {JSON.stringify(selectedPrompt.jsonSchema, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Edit Mode */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-sm text-gray-900">Edit Prompt</h4>
                                    <Button
                                        onClick={handleCancelEdit}
                                        size="sm"
                                        variant="ghost"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-name">Name</Label>
                                    <Input
                                        id="edit-name"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Prompt name"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-description">Description</Label>
                                    <Input
                                        id="edit-description"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        placeholder="Optional description"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-system-prompt">System Prompt</Label>
                                    <Textarea
                                        id="edit-system-prompt"
                                        value={editSystemPrompt}
                                        onChange={(e) => setEditSystemPrompt(e.target.value)}
                                        placeholder="System prompt content"
                                        rows={6}
                                        className="font-mono text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-template">User Prompt Template (Optional)</Label>
                                    <Textarea
                                        id="edit-user-template"
                                        value={editUserPromptTemplate}
                                        onChange={(e) => setEditUserPromptTemplate(e.target.value)}
                                        placeholder="User prompt template"
                                        rows={4}
                                        className="font-mono text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-json-schema">JSON Schema (Optional)</Label>
                                    <Textarea
                                        id="edit-json-schema"
                                        value={editJsonSchema}
                                        onChange={(e) => handleJsonSchemaChange(e.target.value)}
                                        onBlur={handleJsonSchemaBlur}
                                        placeholder='{"type": "object", "properties": {...}}'
                                        rows={12}
                                        className={`font-mono text-sm resize-none ${jsonSchemaError ? 'border-red-300 focus:border-red-500' : ''}`}
                                    />
                                    {jsonSchemaError && (
                                        <p className="text-xs text-red-600 mt-1">{jsonSchemaError}</p>
                                    )}
                                    {!jsonSchemaError && editJsonSchema.trim() && (
                                        <p className="text-xs text-green-600 mt-1">✓ Valid JSON</p>
                                    )}
                                </div>

                                <div className="flex items-center space-x-2 pt-2 border-t">
                                    <Button
                                        onClick={handleUpdate}
                                        disabled={isSaving || !editName.trim() || !editSystemPrompt.trim()}
                                        size="sm"
                                        className="flex-1"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="h-4 w-4 mr-1" />
                                                Update
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        onClick={handleSaveAsNew}
                                        disabled={isCreating || !editName.trim() || !editSystemPrompt.trim()}
                                        size="sm"
                                        variant="outline"
                                        className="flex-1"
                                        title="Save as a new prompt with the edited name"
                                    >
                                        {isCreating ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-4 w-4 mr-1" />
                                                Save as New
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Confirmation Modal */}
            <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {confirmAction === 'update' ? 'Confirm Update' : 'Confirm Save as New'}
                        </DialogTitle>
                        <DialogDescription>
                            {confirmAction === 'update'
                                ? 'Please confirm the name and submit to update the prompt.'
                                : 'Please enter a name for the new prompt and submit to create it.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="confirm-name">Prompt Name</Label>
                            <Input
                                id="confirm-name"
                                value={confirmModalName}
                                onChange={(e) => setConfirmModalName(e.target.value)}
                                placeholder="Enter prompt name"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && confirmModalName.trim()) {
                                        e.preventDefault()
                                        if (confirmAction === 'update') {
                                            handleConfirmUpdate()
                                        } else {
                                            handleConfirmSaveAsNew()
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowConfirmModal(false)
                                setConfirmAction(null)
                                setConfirmModalName('')
                            }}
                            disabled={isSaving || isCreating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (confirmAction === 'update') {
                                    handleConfirmUpdate()
                                } else {
                                    handleConfirmSaveAsNew()
                                }
                            }}
                            disabled={isSaving || isCreating || !confirmModalName.trim()}
                        >
                            {isSaving || isCreating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {confirmAction === 'update' ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    {confirmAction === 'update' ? 'Update' : 'Create'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
