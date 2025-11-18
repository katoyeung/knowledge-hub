'use client'

import { useState, useEffect, useRef } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PromptSelector } from '@/components/prompt-selector'
import { promptApi, aiProviderApi, userApi, type Prompt, type AiProvider } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface PostSettings {
    aiProviderId?: string
    model?: string
    promptId?: string
    temperature?: number
}

export default function PostSettingsPage() {
    const { success, error } = useToast()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Settings state
    const [settings, setSettings] = useState<PostSettings>({
        temperature: 0.7,
    })

    // Data state
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [models, setModels] = useState<Array<{
        id: string
        name: string
        description?: string
        maxTokens?: number
        contextWindow?: number
        pricing?: {
            input: number
            output: number
        }
    }>>([])
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
    const [loadingModels, setLoadingModels] = useState(false)

    // Refs to prevent duplicate API calls
    const dataLoadedRef = useRef(false)
    const modelsLoadingRef = useRef(false)

    useEffect(() => {
        const currentUser = authUtil.getUser()
        if (currentUser) {
            setUser(currentUser)
        }
    }, [])

    // Load initial data
    useEffect(() => {
        if (dataLoadedRef.current) return
        dataLoadedRef.current = true

        const loadData = async () => {
            setLoading(true)
            try {
                // Load providers and prompts in parallel
                const [providersResponse, promptsResponse] = await Promise.all([
                    aiProviderApi.getAll(),
                    promptApi.getAll({ isActive: true }),
                ])

                setProviders(providersResponse.data || [])
                setPrompts(promptsResponse.data || promptsResponse || [])

                // Load user's current post settings
                if (user?.id) {
                    try {
                        const userSettings = await userApi.getUserPostSettings(user.id)
                        if (userSettings) {
                            setSettings({
                                temperature: 0.7,
                                ...userSettings,
                            })
                        }
                    } catch (err) {
                        console.error('Failed to load post settings:', err)
                        // Don't show error for initial load
                    }
                }
            } catch (err) {
                console.error('Failed to load data:', err)
                error('Failed to load settings data')
            } finally {
                setLoading(false)
            }
        }

        if (user) {
            loadData()
        }
    }, [user, error])

    // Load models when provider changes
    useEffect(() => {
        if (settings.aiProviderId && providers.length > 0 && !modelsLoadingRef.current) {
            modelsLoadingRef.current = true
            loadModels(settings.aiProviderId)
        } else if (!settings.aiProviderId) {
            setModels([])
        }
    }, [settings.aiProviderId, providers])

    // Update selected prompt when promptId changes
    useEffect(() => {
        if (settings.promptId && prompts.length > 0) {
            const prompt = prompts.find(p => p.id === settings.promptId)
            setSelectedPrompt(prompt || null)
        } else {
            setSelectedPrompt(null)
        }
    }, [settings.promptId, prompts])

    const loadModels = async (providerId: string) => {
        setLoadingModels(true)
        try {
            const provider = providers.find(p => p.id === providerId)
            if (provider && provider.models) {
                setModels(provider.models || [])
            } else {
                setModels([])
            }
        } catch (err) {
            console.error('Failed to load models:', err)
            error('Failed to load models')
        } finally {
            setLoadingModels(false)
            modelsLoadingRef.current = false
        }
    }

    const handleSave = async () => {
        if (!user?.id) return

        setSaving(true)
        try {
            await userApi.updateUserPostSettings(user.id, settings)
            success('Post settings saved successfully')
        } catch (err) {
            console.error('Failed to save post settings:', err)
            error('Failed to save post settings')
        } finally {
            setSaving(false)
        }
    }

    const handleInputChange = (field: keyof PostSettings, value: string | number) => {
        setSettings(prev => ({
            ...prev,
            [field]: value,
        }))
    }

    const handleProviderChange = (providerId: string) => {
        handleInputChange('aiProviderId', providerId)
        // Reset model when provider changes
        handleInputChange('model', '')
    }

    const handlePromptChange = (prompt: Prompt | null) => {
        setSelectedPrompt(prompt)
        handleInputChange('promptId', prompt?.id || '')
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Loading settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Post Approval Settings</h1>
                    <p className="text-muted-foreground mt-2">
                        Configure default AI provider, model, and prompt for post approval jobs.
                        These settings will be used when triggering post approval from the posts page.
                    </p>
                </div>

                <div className="space-y-6">
                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="provider">AI Provider</Label>
                        <select
                            id="provider"
                            value={settings.aiProviderId || ''}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="w-full px-3 py-2 border border-input bg-background rounded-md"
                        >
                            <option value="">Select AI Provider</option>
                            {providers.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.name}
                                </option>
                            ))}
                        </select>
                        <p className="text-sm text-muted-foreground">
                            Select the AI provider to use for post approval
                        </p>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        {loadingModels ? (
                            <p className="text-sm text-muted-foreground">Loading models...</p>
                        ) : (
                            <>
                                <select
                                    id="model"
                                    value={settings.model || ''}
                                    onChange={(e) => handleInputChange('model', e.target.value)}
                                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                                    disabled={!settings.aiProviderId}
                                >
                                    <option value="">Select Model</option>
                                    {models.map((model) => (
                                        <option key={model.id} value={model.id}>
                                            {model.name} {model.description ? `- ${model.description}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-sm text-muted-foreground">
                                    Select the model to use for post approval
                                </p>
                            </>
                        )}
                    </div>

                    {/* Prompt Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="prompt">Prompt</Label>
                        <PromptSelector
                            prompts={prompts}
                            selectedPrompt={selectedPrompt}
                            onPromptChange={handlePromptChange}
                            placeholder="Select a prompt for post approval"
                        />
                        <p className="text-sm text-muted-foreground">
                            Select the prompt template to use for post approval analysis
                        </p>
                    </div>

                    {/* Temperature */}
                    <div className="space-y-2">
                        <Label htmlFor="temperature">Temperature</Label>
                        <Input
                            id="temperature"
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            value={settings.temperature || 0.7}
                            onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value) || 0.7)}
                            className="w-full"
                        />
                        <p className="text-sm text-muted-foreground">
                            Controls randomness in the model's responses (0.0 = deterministic, 2.0 = very creative)
                        </p>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

