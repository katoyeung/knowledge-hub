'use client'

import { useState, useEffect, useRef } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PromptSelector } from '@/components/prompt-selector'
import { promptApi, aiProviderApi, userApi, type Prompt, type AiProvider, type Model } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface GraphSettings {
    aiProviderId?: string
    model?: string
    promptId?: string
    temperature?: number
}

export default function GraphSettingsPage() {
    const { success, error } = useToast()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [saving, setSaving] = useState(false)

    // Settings state
    const [settings, setSettings] = useState<GraphSettings>({
        temperature: 0.7,
    })

    // Data state
    const [providers, setProviders] = useState<AiProvider[]>([])
    const [models, setModels] = useState<Model[]>([])
    const [loadingModels, setLoadingModels] = useState(false)

    // Refs to prevent duplicate API calls in React StrictMode
    const dataLoadedRef = useRef(false)

    // Load user data
    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = authUtil.getUser()
                setUser(userData)
            } catch (err) {
                console.error('Failed to load user:', err)
                error('Failed to load user data')
            }
        }

        if (!dataLoadedRef.current) {
            dataLoadedRef.current = true
            loadUser()
        }
    }, [error])

    // Load providers
    useEffect(() => {
        const loadData = async () => {
            try {
                const providersResponse = await aiProviderApi.getAll()
                setProviders(providersResponse.data || [])
            } catch (err) {
                console.error('Failed to load data:', err)
                error('Failed to load providers')
            }
        }

        if (user && !dataLoadedRef.current) {
            loadData()
        }
    }, [user, error])

    // Load user's current graph settings
    useEffect(() => {
        const loadSettings = async () => {
            if (!user?.id) return

            try {
                const response = await userApi.getUserGraphSettings(user.id)
                if (response) {
                    setSettings({
                        temperature: 0.7,
                        ...response
                    })
                }
            } catch (err) {
                console.error('Failed to load graph settings:', err)
                // Don't show error for initial load
            }
        }

        if (user) {
            loadSettings()
        }
    }, [user])

    // Load models when provider changes
    useEffect(() => {
        if (settings.aiProviderId && providers.length > 0) {
            loadModels(settings.aiProviderId)
        } else {
            setModels([])
        }
    }, [settings.aiProviderId, providers])


    const handleSave = async () => {
        if (!user?.id) return

        setSaving(true)
        try {
            await userApi.updateUserGraphSettings(user.id, settings)
            success('Graph settings saved successfully')
        } catch (err) {
            console.error('Failed to save graph settings:', err)
            error('Failed to save graph settings')
        } finally {
            setSaving(false)
        }
    }

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
        }
    }

    const handleInputChange = (field: keyof GraphSettings, value: string | number) => {
        const newSettings = {
            ...settings,
            [field]: value
        }

        // Clear model when provider changes
        if (field === 'aiProviderId') {
            newSettings.model = ''
        }

        setSettings(newSettings)
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">Loading settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Graph Settings</h1>
                <p className="text-gray-600">
                    Configure default settings for graph extraction. These settings will be used as defaults when extracting graphs from documents.
                </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="space-y-6">
                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="aiProvider">AI Provider</Label>
                        <select
                            id="aiProvider"
                            value={settings.aiProviderId || ''}
                            onChange={(e) => handleInputChange('aiProviderId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Select AI Provider</option>
                            {providers.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.name} ({provider.type})
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
                            onChange={(e) => handleInputChange('model', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loadingModels || !settings.aiProviderId}
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
                        {!settings.aiProviderId && (
                            <p className="text-sm text-gray-500">Please select an AI provider first</p>
                        )}
                    </div>

                    {/* Prompt Selection */}
                    <PromptSelector
                        value={settings.promptId}
                        onChange={(promptId) => handleInputChange('promptId', promptId)}
                        label="Graph Extraction Prompt"
                        placeholder="Select Prompt"
                        promptType="custom"
                    />

                    {/* Temperature */}
                    <div className="space-y-2">
                        <Label htmlFor="temperature">Temperature</Label>
                        <div className="flex items-center space-x-4">
                            <input
                                type="range"
                                id="temperature"
                                min="0"
                                max="2"
                                step="0.1"
                                value={settings.temperature || 0.7}
                                onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value))}
                                className="flex-1"
                            />
                            <span className="text-sm text-gray-600 min-w-[3rem]">
                                {settings.temperature || 0.7}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500">
                            Controls randomness in AI responses. Lower values make responses more focused and deterministic.
                        </p>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

