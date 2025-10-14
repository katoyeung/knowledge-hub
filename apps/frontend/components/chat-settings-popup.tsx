'use client'

import { useState, useEffect, useRef } from 'react'
import { Settings, Eye, EyeOff, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { chatApi, promptApi, aiProviderApi, userApi, type Prompt, type AiProvider } from '@/lib/api'
import { authUtil } from '@/lib/auth'
import { useToast } from '@/components/ui/simple-toast'

interface ChatSettings {
    provider?: string
    model?: string
    promptId?: string
    temperature?: number
    maxChunks?: number
    // 🆕 Search Weight Configuration
    bm25Weight?: number
    embeddingWeight?: number
    includeConversationHistory?: boolean
    conversationHistoryLimit?: number
}

interface ChatSettingsPopupProps {
    datasetId: string
    currentSettings?: ChatSettings
    onSettingsChange: (settings: ChatSettings) => void
    onSaveSettings: (settings: ChatSettings) => Promise<void>
}

export function ChatSettingsPopup({
    datasetId,
    currentSettings,
    onSettingsChange,
    onSaveSettings
}: ChatSettingsPopupProps) {
    const { success, error } = useToast()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Settings state
    const [settings, setSettings] = useState<ChatSettings>({
        temperature: 0.7,
        maxChunks: 5,
        includeConversationHistory: true,
        conversationHistoryLimit: 10,
        // 🆕 Search Weight Configuration
        bm25Weight: 0.4,
        embeddingWeight: 0.6,
        ...currentSettings,
    })

    // Data state
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [models, setModels] = useState<Array<{
        id: string;
        name: string;
        description?: string;
        maxTokens?: number;
        contextWindow?: number;
        pricing?: {
            input: number;
            output: number;
        };
    }>>([])
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
    const [showPromptPreview, setShowPromptPreview] = useState(false)

    // Refs to prevent duplicate API calls in React StrictMode
    const dataLoadedRef = useRef(false)
    const modelsLoadingRef = useRef(false)

    // Auto-fill settings when currentSettings change
    useEffect(() => {
        if (currentSettings && Object.keys(currentSettings).length > 0) {
            setSettings(prev => ({
                temperature: 0.7,
                maxChunks: 5,
                ...currentSettings
            }))
        }
    }, [currentSettings])

    // Load initial data
    useEffect(() => {
        if (open && !dataLoadedRef.current) {
            dataLoadedRef.current = true
            loadData()
        } else if (!open) {
            // Reset refs when dialog closes to allow reopening
            dataLoadedRef.current = false
            modelsLoadingRef.current = false
        }
    }, [open])

    // Load models when provider changes
    useEffect(() => {
        if (settings.provider && providers.length > 0 && !modelsLoadingRef.current) {
            modelsLoadingRef.current = true
            loadModels(settings.provider).finally(() => {
                modelsLoadingRef.current = false
            })
        }
    }, [settings.provider, providers])

    // Load prompt details when promptId changes
    useEffect(() => {
        if (settings.promptId) {
            loadPromptDetails(settings.promptId)
        } else {
            setSelectedPrompt(null)
        }
    }, [settings.promptId])

    // Update settings when currentSettings change
    useEffect(() => {
        if (currentSettings) {
            setSettings(prev => ({
                ...prev,
                ...currentSettings,
                // Ensure these values are never undefined
                includeConversationHistory: currentSettings.includeConversationHistory ?? prev.includeConversationHistory ?? true,
                conversationHistoryLimit: currentSettings.conversationHistoryLimit ?? prev.conversationHistoryLimit ?? 10,
            }))
        }
    }, [currentSettings])

    const loadData = async () => {
        setLoading(true)
        try {
            const user = authUtil.getUser()
            const [providersResponse, promptsResponse, userSettingsResponse] = await Promise.all([
                aiProviderApi.getAll(),
                promptApi.getAll(),
                user ? userApi.getSettings(user.id) : Promise.resolve({})
            ])


            setProviders(providersResponse.data || [])
            setPrompts(promptsResponse.data || [])

            // Auto-fill default settings if no current settings
            if (!currentSettings || Object.keys(currentSettings).length === 0) {
                // Try to use user settings as defaults
                const userSettings = userSettingsResponse as any
                const userChatSettings = userSettings?.chat_settings || {}

                if (Object.keys(userChatSettings).length > 0) {
                    // Map provider type to provider ID if needed
                    let providerId = userChatSettings.provider
                    if (userChatSettings.provider && !userChatSettings.provider.includes('-')) {
                        // This looks like a provider type, find the actual provider ID
                        const provider = providersResponse.data?.find(p => p.type === userChatSettings.provider && p.isActive)
                        if (provider) {
                            providerId = provider.id
                        }
                    }

                    // Map model name to model ID if needed
                    let modelId = userChatSettings.model
                    if (providerId && userChatSettings.model) {
                        const provider = providersResponse.data?.find(p => p.id === providerId)
                        if (provider?.models) {
                            const model = provider.models.find(m => m.name === userChatSettings.model || m.id === userChatSettings.model)
                            if (model) {
                                modelId = model.id
                            }
                        }
                    }

                    setSettings(prev => ({
                        temperature: 0.7,
                        maxChunks: 5,
                        ...userChatSettings,
                        provider: providerId,
                        model: modelId
                    }))

                    // Load models for user's provider
                    if (providerId) {
                        await loadModels(providerId)
                    }
                } else {
                    await setDefaultSettings(providersResponse.data || [], promptsResponse.data || [])
                }
            } else {
                // Load models for current provider
                if (settings.provider) {
                    await loadModels(settings.provider)
                }
            }
        } catch (err) {
            error('Failed to Load Data', 'Could not load providers and prompts')
        } finally {
            setLoading(false)
        }
    }

    const setDefaultSettings = async (providers: AiProvider[], prompts: Prompt[]) => {
        // Find the first active provider (preferably dashscope)
        const dashscopeProvider = providers.find(p => p.type === 'dashscope' && p.isActive)
        const defaultProvider = dashscopeProvider || providers.find(p => p.isActive) || providers[0]

        // Find a default prompt (preferably one with "default" in the name or the first one)
        const defaultPrompt = prompts.find(p =>
            p.name.toLowerCase().includes('default') ||
            p.name.toLowerCase().includes('general')
        ) || prompts[0]

        if (defaultProvider) {
            setSettings(prev => ({
                ...prev,
                provider: defaultProvider.id,
                model: defaultProvider.models?.[0]?.id || undefined,
                promptId: defaultPrompt?.id || undefined
            }))

            // Load models for the default provider
            await loadModels(defaultProvider.id)
        }
    }

    const loadModels = async (providerId: string) => {
        try {
            // Find the provider from the already loaded providers (from AI Providers API)
            // Look by id since we're passing the provider id
            const provider = providers.find(p => p.id === providerId)

            if (provider && provider.models) {
                setModels(provider.models || [])
            } else {
                setModels([])
            }

            // Auto-select first model if current model is not available for new provider
            if (settings.provider === providerId) {
                const modelExists = provider?.models?.find(m => m.id === settings.model)
                if (!modelExists && provider?.models?.length > 0) {
                    setSettings(prev => ({ ...prev, model: provider.models[0].id }))
                } else if (!settings.model && provider?.models?.length > 0) {
                    // If no model is selected, auto-select the first one
                    setSettings(prev => ({ ...prev, model: provider.models[0].id }))
                }
            }
        } catch (err) {
            setModels([])
        }
    }

    const loadPromptDetails = async (promptId: string) => {
        try {
            const prompt = await promptApi.getById(promptId)
            setSelectedPrompt(prompt)
        } catch (err) {
            setSelectedPrompt(null)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSaveSettings(settings)
            onSettingsChange(settings)
            setOpen(false)
            success('Settings Saved', 'Chat settings have been saved successfully')
        } catch (err) {
            error('Failed to Save', 'Could not save chat settings')
        } finally {
            setSaving(false)
        }
    }

    const handleProviderChange = (providerId: string) => {
        setSettings(prev => ({ ...prev, provider: providerId, model: undefined }))
        // Don't call loadModels here - let the useEffect handle it
    }

    const handleModelChange = (modelId: string) => {
        setSettings(prev => ({ ...prev, model: modelId }))
    }

    const handlePromptChange = (promptId: string) => {
        setSettings(prev => ({ ...prev, promptId: promptId || undefined }))
    }

    const handleTemperatureChange = (value: string) => {
        const temperature = parseFloat(value)
        if (!isNaN(temperature) && temperature >= 0 && temperature <= 1) {
            setSettings(prev => ({ ...prev, temperature }))
        }
    }

    const handleMaxChunksChange = (value: string) => {
        const maxChunks = parseInt(value)
        if (!isNaN(maxChunks) && maxChunks >= 1 && maxChunks <= 20) {
            setSettings(prev => ({ ...prev, maxChunks }))
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Chat Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Chat Settings</DialogTitle>
                    <DialogDescription>
                        Configure AI provider, model, and prompt settings for this dataset.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">

                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="provider">AI Provider</Label>
                        <select
                            id="provider"
                            value={settings.provider || ''}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            disabled={loading}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Select AI provider</option>
                            {providers.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        <select
                            id="model"
                            value={settings.model || ''}
                            onChange={(e) => handleModelChange(e.target.value)}
                            disabled={loading || !settings.provider}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Select model</option>
                            {models.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name} {model.description ? `- ${model.description}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Prompt Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="prompt">Prompt Template</Label>
                        <select
                            id="prompt"
                            value={settings.promptId || ''}
                            onChange={(e) => handlePromptChange(e.target.value)}
                            disabled={loading}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">No prompt template</option>
                            {prompts.map((prompt) => (
                                <option key={prompt.id} value={prompt.id}>
                                    {prompt.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Prompt Preview */}
                    {selectedPrompt && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Prompt Preview</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowPromptPreview(!showPromptPreview)}
                                >
                                    {showPromptPreview ? (
                                        <>
                                            <EyeOff className="h-4 w-4 mr-1" />
                                            Hide
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="h-4 w-4 mr-1" />
                                            Preview
                                        </>
                                    )}
                                </Button>
                            </div>
                            {showPromptPreview && (
                                <div className="space-y-3">
                                    {selectedPrompt.systemPrompt && (
                                        <div>
                                            <Label className="text-sm font-medium">System Prompt:</Label>
                                            <Textarea
                                                value={selectedPrompt.systemPrompt}
                                                readOnly
                                                className="mt-1 min-h-[100px]"
                                            />
                                        </div>
                                    )}
                                    {selectedPrompt.userPromptTemplate && (
                                        <div>
                                            <Label className="text-sm font-medium">User Template:</Label>
                                            <Textarea
                                                value={selectedPrompt.userPromptTemplate}
                                                readOnly
                                                className="mt-1 min-h-[80px]"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Advanced Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="temperature">Temperature</Label>
                            <Input
                                id="temperature"
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={settings.temperature || 0.7}
                                onChange={(e) => handleTemperatureChange(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Controls randomness (0 = deterministic, 1 = creative)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="maxChunks">Max Chunks</Label>
                            <Input
                                id="maxChunks"
                                type="number"
                                min="1"
                                max="20"
                                value={settings.maxChunks || 5}
                                onChange={(e) => handleMaxChunksChange(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Maximum document segments to retrieve
                            </p>
                        </div>
                    </div>

                    {/* Search Weight Settings */}
                    <div className="space-y-4 border-t pt-4">
                        <h4 className="text-sm font-medium">Search Configuration</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="bm25Weight">BM25 Weight</Label>
                                <Input
                                    id="bm25Weight"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={settings.bm25Weight || 0.4}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value)
                                        if (!isNaN(value) && value >= 0 && value <= 1) {
                                            setSettings(prev => ({ ...prev, bm25Weight: value }))
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Keyword search weight
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="embeddingWeight">Embedding Weight</Label>
                                <Input
                                    id="embeddingWeight"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={settings.embeddingWeight || 0.6}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value)
                                        if (!isNaN(value) && value >= 0 && value <= 1) {
                                            setSettings(prev => ({ ...prev, embeddingWeight: value }))
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Semantic search weight
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Conversation History Settings */}
                    <div className="space-y-4 border-t pt-4">
                        <h4 className="text-sm font-medium">Conversation History</h4>
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    id="includeConversationHistory"
                                    type="checkbox"
                                    checked={settings.includeConversationHistory ?? true}
                                    onChange={(e) => setSettings(prev => ({
                                        ...prev,
                                        includeConversationHistory: e.target.checked
                                    }))}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <Label htmlFor="includeConversationHistory" className="text-sm">
                                    Include Previous Context
                                </Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Include conversation history in AI responses for better context
                            </p>

                            {settings.includeConversationHistory && (
                                <div className="space-y-2">
                                    <Label htmlFor="conversationHistoryLimit">Context Limit</Label>
                                    <Input
                                        id="conversationHistoryLimit"
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={settings.conversationHistoryLimit || 10}
                                        onChange={(e) => {
                                            const limit = parseInt(e.target.value)
                                            if (!isNaN(limit) && limit >= 1 && limit <= 50) {
                                                setSettings(prev => ({ ...prev, conversationHistoryLimit: limit }))
                                            }
                                        }}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Maximum number of previous messages to include (1-50)
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                Save Settings
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
