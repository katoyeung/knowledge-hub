'use client'

import { useState, useEffect, useRef } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { promptApi, aiProviderApi, userApi, type Prompt, type AiProvider, type ChatSettings } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

export default function ChatSettingsPage() {
    const { success, error } = useToast()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)
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

    useEffect(() => {
        const currentUser = authUtil.getUser()
        setUser(currentUser)
    }, [])

    // Load initial data
    useEffect(() => {
        if (user && !dataLoadedRef.current) {
            dataLoadedRef.current = true
            loadData()
        }
    }, [user])

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


    const loadData = async () => {
        if (!user) return

        setLoading(true)
        try {
            const [providersResponse, promptsResponse, userSettingsResponse] = await Promise.all([
                aiProviderApi.getAll(),
                promptApi.getAll(),
                userApi.getSettings(user.id)
            ])


            setProviders(providersResponse.data || [])
            setPrompts(promptsResponse.data || [])

            // Load user settings
            const userSettings = userSettingsResponse as { chat_settings?: ChatSettings }
            const chatSettings = userSettings?.chat_settings || {}

            // Check if user has valid chat settings (not just empty object)
            const hasValidUserSettings = chatSettings && (
                chatSettings.provider ||
                chatSettings.model ||
                chatSettings.promptId ||
                chatSettings.temperature !== undefined ||
                chatSettings.maxChunks !== undefined ||
                chatSettings.includeConversationHistory !== undefined ||
                chatSettings.conversationHistoryLimit !== undefined
            )

            if (hasValidUserSettings) {
                // Map provider type to provider ID if needed
                let providerId = chatSettings.provider
                if (chatSettings.provider && !chatSettings.provider.includes('-')) {
                    // This looks like a provider type, find the actual provider ID
                    const provider = providersResponse.data?.find(p => p.type === chatSettings.provider && p.isActive)
                    if (provider) {
                        providerId = provider.id
                    }
                }

                // Map model name to model ID if needed
                let modelId = chatSettings.model
                if (providerId && chatSettings.model) {
                    const provider = providersResponse.data?.find(p => p.id === providerId)
                    if (provider?.models) {
                        const model = provider.models.find(m => m.name === chatSettings.model || m.id === chatSettings.model)
                        if (model) {
                            modelId = model.id
                        }
                    }
                }

                const newSettings = {
                    temperature: 0.7,
                    maxChunks: 5,
                    includeConversationHistory: true,
                    conversationHistoryLimit: 10,
                    ...chatSettings,
                    provider: providerId,
                    model: modelId
                }
                setSettings(newSettings)

                // Load models for the user's provider
                if (providerId) {
                    await loadModels(providerId, providersResponse.data || [])
                }
            } else {
                // Set default settings if no user settings
                await setDefaultSettings(providersResponse.data || [], promptsResponse.data || [])
            }
        } catch {
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
            const newSettings = {
                temperature: 0.7,
                maxChunks: 5,
                provider: defaultProvider.id,
                model: defaultProvider.models?.[0]?.id || undefined,
                promptId: defaultPrompt?.id || undefined,
                includeConversationHistory: true,
                conversationHistoryLimit: 10
            }
            setSettings(newSettings)

            // Load models for the default provider
            await loadModels(defaultProvider.id, providers)
        }
    }

    const loadModels = async (providerId: string, currentProviders?: AiProvider[]) => {
        try {
            // Find the provider from the already loaded providers (from AI Providers API)
            const effectiveProviders = currentProviders || providers
            const provider = effectiveProviders.find(p => p.id === providerId)

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
        } catch {
            setModels([])
        }
    }

    const loadPromptDetails = async (promptId: string) => {
        try {
            const prompt = await promptApi.getById(promptId)
            setSelectedPrompt(prompt)
        } catch {
            setSelectedPrompt(null)
        }
    }

    const handleSave = async () => {
        if (!user) return

        setSaving(true)
        try {
            await userApi.updateSettings(user.id, {
                chat_settings: settings
            })
            success('Settings Saved', 'Chat settings have been saved successfully')
        } catch {
            error('Failed to Save', 'Could not save chat settings')
        } finally {
            setSaving(false)
        }
    }

    const handleProviderChange = (providerId: string) => {
        setSettings(prev => ({ ...prev, provider: providerId, model: undefined }))
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

    if (loading) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <div className="flex items-center justify-center h-32 sm:h-64">
                    <div className="text-sm sm:text-base text-gray-500">Loading chat settings...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-4 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Chat Settings</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">
                    Configure your default AI provider, model, and prompt settings for chat conversations.
                </p>
            </div>

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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <Label>Prompt Preview</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPromptPreview(!showPromptPreview)}
                                className="w-full sm:w-auto"
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
                                            className="mt-1 min-h-[100px] text-xs sm:text-sm"
                                        />
                                    </div>
                                )}
                                {selectedPrompt.userPromptTemplate && (
                                    <div>
                                        <Label className="text-sm font-medium">User Template:</Label>
                                        <Textarea
                                            value={selectedPrompt.userPromptTemplate}
                                            readOnly
                                            className="mt-1 min-h-[80px] text-xs sm:text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Advanced Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="temperature">Temperature</Label>
                        <Input
                            id="temperature"
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={settings.temperature}
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
                            value={settings.maxChunks}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                Keyword search weight (0 = disabled, 1 = full weight)
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
                                Semantic search weight (0 = disabled, 1 = full weight)
                            </p>
                        </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        <p>💡 <strong>Tip:</strong> BM25 excels at exact keyword matches, while embeddings find semantically similar content.
                            Adjust these weights based on your content type and search needs.</p>
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

                {/* Save Button */}
                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-6 border-t">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full sm:w-auto"
                    >
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
                </div>
            </div>
        </div>
    )
}
