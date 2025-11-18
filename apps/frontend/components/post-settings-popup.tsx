'use client'

import { useState, useEffect, useRef } from 'react'
import { Settings, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { PromptSelector } from './prompt-selector'
import { AiProviderModelSelector } from './ai-provider-model-selector'
import { userApi } from '@/lib/api'
import { authUtil } from '@/lib/auth'
import { useToast } from '@/components/ui/simple-toast'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface PostSettings {
    aiProviderId?: string
    model?: string
    promptId?: string
    temperature?: number
}

interface PostSettingsPopupProps {
    currentSettings?: PostSettings
    onSettingsChange?: (settings: PostSettings) => void
    onSaveSettings?: (settings: PostSettings) => Promise<void>
}

export function PostSettingsPopup({
    currentSettings,
    onSettingsChange,
    onSaveSettings,
}: PostSettingsPopupProps) {
    const { success, error } = useToast()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Settings state
    const [settings, setSettings] = useState<PostSettings>({
        temperature: 0.7,
        ...currentSettings,
    })

    // Refs to prevent duplicate API calls
    const dataLoadedRef = useRef(false)
    // Ref to keep latest settings for save operation (avoids stale closure issues)
    const settingsRef = useRef<PostSettings>({ temperature: 0.7, ...currentSettings })

    // Keep ref in sync with state
    useEffect(() => {
        settingsRef.current = settings
    }, [settings])

    useEffect(() => {
        const currentUser = authUtil.getUser()
        if (currentUser) {
            setUser(currentUser)
        }
    }, [])

    // Auto-fill settings when currentSettings change
    useEffect(() => {
        if (currentSettings && Object.keys(currentSettings).length > 0) {
            console.log('PostSettingsPopup: currentSettings changed:', currentSettings)
            setSettings(() => ({
                temperature: 0.7,
                ...currentSettings,
            }))
        }
    }, [currentSettings])

    // Load initial data when dialog opens
    useEffect(() => {
        if (open && user) {
            if (!dataLoadedRef.current) {
                dataLoadedRef.current = true
                loadData()
            }
        } else if (!open) {
            // Reset ref when dialog closes so data can be reloaded next time
            dataLoadedRef.current = false
        }
    }, [open, user])

    const loadData = async () => {
        setLoading(true)
        try {
            // Load user's current post settings if not provided or empty
            if (user?.id) {
                // Check if currentSettings is empty or missing required fields
                const hasValidSettings = currentSettings &&
                    currentSettings.aiProviderId &&
                    currentSettings.promptId &&
                    currentSettings.model

                if (!hasValidSettings) {
                    try {
                        const userSettings = await userApi.getUserPostSettings(user.id)
                        if (userSettings && Object.keys(userSettings).length > 0) {
                            // Merge with currentSettings if it exists (currentSettings takes precedence)
                            setSettings({
                                temperature: 0.7,
                                ...userSettings,
                                ...currentSettings, // currentSettings overrides userSettings
                            })
                        } else if (currentSettings && Object.keys(currentSettings).length > 0) {
                            // Use currentSettings if userSettings is empty
                            setSettings({
                                temperature: 0.7,
                                ...currentSettings,
                            })
                        }
                    } catch (err) {
                        console.error('Failed to load post settings:', err)
                        // If loading fails, use currentSettings if available
                        if (currentSettings && Object.keys(currentSettings).length > 0) {
                            setSettings({
                                temperature: 0.7,
                                ...currentSettings,
                            })
                        }
                    }
                } else {
                    // currentSettings has all required fields, use it
                    setSettings({
                        temperature: 0.7,
                        ...currentSettings,
                    })
                }
            }
        } catch (err) {
            console.error('Failed to load data:', err)
            error('Failed to load settings data')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!user?.id) {
            error('User not found')
            return
        }

        setSaving(true)
        try {
            // Use ref to get the latest settings state (always up-to-date)
            const currentSettings = settingsRef.current

            // Log what we're about to save
            console.log('Saving post settings (from ref):', currentSettings)

            // Ensure we're sending all fields, including aiProviderId
            // Only include fields that have values (filter out undefined/null)
            const settingsToSave: {
                aiProviderId?: string;
                model?: string;
                promptId?: string;
                temperature?: number;
            } = {}

            if (currentSettings.aiProviderId) {
                settingsToSave.aiProviderId = currentSettings.aiProviderId
            }
            if (currentSettings.model) {
                settingsToSave.model = currentSettings.model
            }
            if (currentSettings.promptId) {
                settingsToSave.promptId = currentSettings.promptId
            }
            if (currentSettings.temperature !== undefined) {
                settingsToSave.temperature = currentSettings.temperature
            } else {
                settingsToSave.temperature = 0.7
            }

            console.log('Settings to save (cleaned):', settingsToSave)
            console.log('Has aiProviderId?', !!settingsToSave.aiProviderId, 'Value:', settingsToSave.aiProviderId)
            console.log('Full currentSettings from ref:', currentSettings)

            // Validate that aiProviderId is present
            if (!settingsToSave.aiProviderId) {
                console.error('Validation failed: aiProviderId is missing')
                console.error('Current settings state (from ref):', currentSettings)
                console.error('Settings state (from useState):', settings)
                error('Please select an AI Provider before saving')
                setSaving(false)
                return
            }

            if (onSaveSettings) {
                await onSaveSettings(settingsToSave)
            } else {
                // Default: save to user post settings
                await userApi.updateUserPostSettings(user.id, settingsToSave)
            }
            success('Post settings saved successfully')
            setOpen(false)
        } catch (err) {
            console.error('Failed to save post settings:', err)
            error('Failed to save post settings')
        } finally {
            setSaving(false)
        }
    }

    const handleInputChange = (field: keyof PostSettings, value: string | number | undefined) => {
        // Use functional update to ensure we always work with latest state
        setSettings((prevSettings) => {
            let newSettings: PostSettings

            // Handle undefined/null/empty values (e.g., when clearing a field)
            if (value === undefined || value === null || value === '') {
                newSettings = { ...prevSettings }
                delete newSettings[field]
                console.log(`PostSettings: ${field} cleared`)
            } else {
                newSettings = {
                    ...prevSettings,
                    [field]: value,
                }
                console.log(`PostSettings: ${field} changed to:`, value)
            }

            // Update ref to keep it in sync
            settingsRef.current = newSettings

            console.log('PostSettings: Updated settings state:', newSettings)

            // Call parent callback if provided
            if (onSettingsChange) {
                onSettingsChange(newSettings)
            }

            return newSettings
        })
    }



    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Post Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Post Approval Settings</DialogTitle>
                    <DialogDescription>
                        Configure default AI provider, model, and prompt for post approval jobs.
                        These settings will be used when triggering post approval from the posts page.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <p className="text-muted-foreground">Loading settings...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* AI Provider and Model Selection */}
                        <AiProviderModelSelector
                            selectedProviderId={settings.aiProviderId}
                            selectedModel={settings.model}
                            onProviderChange={(providerId) => {
                                console.log('PostSettingsPopup: Provider selected:', providerId)
                                console.log('PostSettingsPopup: Current settings before update:', settings)
                                // Use handleInputChange which properly updates state and calls parent callback
                                handleInputChange('aiProviderId', providerId)
                                // Reset model when provider changes
                                handleInputChange('model', '')
                            }}
                            onModelChange={(model) => {
                                console.log('PostSettingsPopup: Model selected:', model)
                                handleInputChange('model', model)
                            }}
                            disabled={loading}
                            loading={loading}
                        />

                        {/* Prompt Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="prompt">Prompt</Label>
                            <PromptSelector
                                value={settings.promptId}
                                onChange={(promptId) => handleInputChange('promptId', promptId)}
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
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading}>
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

