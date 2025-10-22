'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { promptApi, aiProviderApi, type Prompt, type AiProvider, type Model } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'

interface GraphSettings {
    aiProviderId?: string
    model?: string
    promptId?: string
    temperature?: number
}

interface GraphSettingsPopupProps {
    currentSettings?: GraphSettings
    onSettingsChange: (settings: GraphSettings) => void
    onSaveSettings: (settings: GraphSettings) => Promise<void>
    isUserSettings?: boolean
}

export function GraphSettingsPopup({
    currentSettings,
    onSettingsChange,
    onSaveSettings,
    isUserSettings = false
}: GraphSettingsPopupProps) {
    const { success, error } = useToast()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [settings, setSettings] = useState<GraphSettings>({
        aiProviderId: '',
        model: '',
        promptId: '',
        temperature: 0.7,
        ...currentSettings
    })
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [aiProviders, setAiProviders] = useState<AiProvider[]>([])
    const [models, setModels] = useState<Model[]>([])
    const [loadingPrompts, setLoadingPrompts] = useState(false)
    const [loadingProviders, setLoadingProviders] = useState(false)
    const [loadingModels, setLoadingModels] = useState(false)

    // Load prompts and AI providers on mount
    useEffect(() => {
        if (open) {
            loadPrompts()
            loadAiProviders()
        }
    }, [open])

    // Load models when provider changes
    useEffect(() => {
        if (settings.aiProviderId && aiProviders.length > 0) {
            loadModels(settings.aiProviderId)
        } else {
            setModels([])
        }
    }, [settings.aiProviderId, aiProviders])

    // Update settings when currentSettings changes
    useEffect(() => {
        if (currentSettings) {
            setSettings({
                aiProviderId: '',
                model: '',
                promptId: '',
                temperature: 0.7,
                ...currentSettings
            })
        }
    }, [currentSettings])

    const loadPrompts = async () => {
        setLoadingPrompts(true)
        try {
            const response = await promptApi.getAll()
            setPrompts(response.data || [])
        } catch (err) {
            console.error('Failed to load prompts:', err)
            error('Failed to load prompts')
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
            error('Failed to load AI providers')
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
            error('Failed to load models')
        } finally {
            setLoadingModels(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSaveSettings(settings)
            success('Graph settings saved successfully')
            setOpen(false)
        } catch (err) {
            console.error('Failed to save graph settings:', err)
            error('Failed to save graph settings')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setSettings({
            aiProviderId: '',
            model: '',
            promptId: '',
            temperature: 0.7,
            ...currentSettings
        })
        setOpen(false)
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
        onSettingsChange(newSettings)
    }

    const selectedPrompt = prompts.find(p => p.id === settings.promptId)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Graph Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>
                        {isUserSettings ? 'User Graph Settings' : 'Dataset Graph Settings'}
                    </DialogTitle>
                    <DialogDescription>
                        Configure default settings for graph extraction. These settings will be used when extracting graphs from documents.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    {/* AI Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="aiProvider">AI Provider</Label>
                        <select
                            id="aiProvider"
                            value={settings.aiProviderId || ''}
                            onChange={(e) => handleInputChange('aiProviderId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loadingProviders}
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
                    <div className="space-y-2">
                        <Label htmlFor="prompt">Graph Extraction Prompt</Label>
                        <select
                            id="prompt"
                            value={settings.promptId || ''}
                            onChange={(e) => handleInputChange('promptId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loadingPrompts}
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
                        {selectedPrompt && (
                            <p className="text-sm text-gray-600">
                                {selectedPrompt.description}
                            </p>
                        )}
                    </div>

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
                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
