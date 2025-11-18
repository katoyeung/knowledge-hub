'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { aiProviderApi, promptApi, postsApi, type AiProvider, type Prompt, type Post } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { Loader2, Play, FileText } from 'lucide-react'
import { PostSelectorModal } from '@/components/post-selector-modal'
import { SearchableSelect } from '@/components/searchable-select'
import { PromptSelector } from '@/components/prompt-selector'
import { Navbar } from '@/components/navbar'

interface VariableInput {
    name: string
    value: string
}

export default function PlaygroundPage() {
    const { success, error } = useToast()

    const handleLogout = () => {
        // The navbar handles the actual logout logic
    }
    const [aiProviders, setAiProviders] = useState<AiProvider[]>([])
    const [selectedProviderId, setSelectedProviderId] = useState<string>('')
    const [models, setModels] = useState<any[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('')
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [selectedPromptId, setSelectedPromptId] = useState<string>('')
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
    const [variables, setVariables] = useState<VariableInput[]>([])
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [result, setResult] = useState<string>('')
    const [openPostSelector, setOpenPostSelector] = useState(false)
    const [currentVariableIndex, setCurrentVariableIndex] = useState<number>(-1)

    // Load AI providers
    useEffect(() => {
        loadAiProviders()
        loadPrompts()
    }, [])

    // Load models when provider changes
    useEffect(() => {
        if (selectedProviderId) {
            loadModels(selectedProviderId)
        } else {
            setModels([])
            setSelectedModel('')
        }
    }, [selectedProviderId])

    // Extract variables from prompt template when prompt changes
    useEffect(() => {
        if (selectedPrompt) {
            extractVariables(selectedPrompt)
        } else {
            setVariables([])
        }
    }, [selectedPrompt])

    const loadAiProviders = async () => {
        setLoading(true)
        try {
            const response = await aiProviderApi.getAll()
            setAiProviders(response.data || [])
        } catch (err) {
            console.error('Failed to load AI providers:', err)
            error('Failed to load AI providers')
        } finally {
            setLoading(false)
        }
    }

    const loadModels = async (providerId: string) => {
        try {
            const provider = aiProviders.find(p => p.id === providerId)
            if (provider && provider.models) {
                setModels(provider.models || [])
            } else {
                const modelsResponse = await aiProviderApi.getModels(providerId)
                setModels(modelsResponse || [])
            }
        } catch (err) {
            console.error('Failed to load models:', err)
            error('Failed to load models')
        }
    }

    const loadPrompts = async () => {
        try {
            const response = await promptApi.getAll()
            setPrompts(response.data || [])
        } catch (err) {
            console.error('Failed to load prompts:', err)
            error('Failed to load prompts')
        }
    }

    const handlePromptChange = async (promptId: string) => {
        setSelectedPromptId(promptId)
        if (promptId) {
            // Reload prompts to get the latest version (in case it was updated)
            await loadPrompts()
            // Find the prompt after reload
            const response = await promptApi.getAll()
            const allPrompts = response.data || []
            const prompt = allPrompts.find(p => p.id === promptId)
            setSelectedPrompt(prompt || null)
            setPrompts(allPrompts)
        } else {
            setSelectedPrompt(null)
        }
    }

    const extractVariables = (prompt: Prompt) => {
        // Extract variables from both system prompt and user prompt template
        const systemPrompt = prompt.systemPrompt || ''
        const userPromptTemplate = prompt.userPromptTemplate || ''
        const combinedContent = `${systemPrompt} ${userPromptTemplate}`

        const variableRegex = /\{\{(\w+)\}\}/g
        const systemMatches = Array.from(systemPrompt.matchAll(variableRegex))
        const userMatches = Array.from(userPromptTemplate.matchAll(variableRegex))

        // Combine all matches and get unique variable names
        const allMatches = [...systemMatches, ...userMatches]
        const uniqueVariables = Array.from(new Set(allMatches.map(m => m[1])))

        setVariables(prevVariables => {
            const variableInputs: VariableInput[] = uniqueVariables.map(name => {
                const existing = prevVariables.find(v => v.name === name)
                return {
                    name,
                    value: existing?.value || ''
                }
            })
            return variableInputs
        })
    }

    const handleVariableChange = (index: number, value: string) => {
        const newVariables = [...variables]
        newVariables[index].value = value
        setVariables(newVariables)
    }

    const handleSelectPost = (post: Post) => {
        if (currentVariableIndex >= 0 && currentVariableIndex < variables.length) {
            // Combine thread title and post message
            const threadTitle = post.meta?.thread_title || ''
            const postMessage = post.meta?.post_message || ''

            // Combine them with a separator, or use fallback to content/title
            let content = ''
            if (threadTitle && postMessage) {
                content = `${threadTitle}\n\n${postMessage}`
            } else if (threadTitle) {
                content = threadTitle
            } else if (postMessage) {
                content = postMessage
            } else {
                // Fallback to old behavior
                content = post.meta?.content || post.title || ''
            }

            handleVariableChange(currentVariableIndex, content)
        }
        setOpenPostSelector(false)
        setCurrentVariableIndex(-1)
    }

    const openPostSelectorForVariable = (index: number) => {
        setCurrentVariableIndex(index)
        setOpenPostSelector(true)
    }

    const buildUserPrompt = (prompt: Prompt): string => {
        let template = prompt.userPromptTemplate || ''
        variables.forEach(variable => {
            const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g')
            template = template.replace(regex, variable.value)
        })
        return template
    }

    const buildSystemPrompt = (prompt: Prompt): string => {
        let systemPrompt = prompt.systemPrompt || ''
        variables.forEach(variable => {
            const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g')
            systemPrompt = systemPrompt.replace(regex, variable.value)
        })
        return systemPrompt
    }

    const executePrompt = async () => {
        if (!selectedProviderId) {
            error('Please select an AI provider')
            return
        }
        if (!selectedModel) {
            error('Please select a model')
            return
        }
        if (!selectedPrompt) {
            error('Please select a prompt')
            return
        }

        // Check if all variables are filled
        const emptyVariables = variables.filter(v => !v.value.trim())
        if (emptyVariables.length > 0) {
            error(`Please fill in all variables: ${emptyVariables.map(v => v.name).join(', ')}`)
            return
        }

        setExecuting(true)
        setResult('')

        try {
            const userPrompt = buildUserPrompt(selectedPrompt)
            const systemPrompt = buildSystemPrompt(selectedPrompt)

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userPrompt }
            ]

            const response = await aiProviderApi.chatCompletion(selectedProviderId, {
                messages,
                model: selectedModel,
                jsonSchema: selectedPrompt.jsonSchema,
                temperature: 0.7
            })

            if (response.success && response.data?.choices?.[0]?.message?.content) {
                setResult(response.data.choices[0].message.content)
                success('Prompt executed successfully')
            } else {
                throw new Error('No response from AI provider')
            }
        } catch (err: any) {
            console.error('Failed to execute prompt:', err)
            error(err.response?.data?.message || err.message || 'Failed to execute prompt')
            setResult(`Error: ${err.response?.data?.message || err.message || 'Failed to execute prompt'}`)
        } finally {
            setExecuting(false)
        }
    }

    const selectedProvider = aiProviders.find(p => p.id === selectedProviderId)

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar onLogout={handleLogout} />
            <div className="container mx-auto py-8 px-4 max-w-6xl">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">AI Playground</h1>
                    <p className="text-muted-foreground">
                        Test prompts with different AI providers and models
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Configuration Panel */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration</CardTitle>
                            <CardDescription>Select AI provider, model, and prompt</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* AI Provider Selection */}
                            <SearchableSelect
                                label="AI Provider"
                                placeholder="Search and select AI provider..."
                                value={selectedProviderId}
                                options={aiProviders.map(provider => ({
                                    id: provider.id,
                                    name: `${provider.name} (${provider.type})`,
                                    description: provider.type
                                }))}
                                onChange={(value) => {
                                    setSelectedProviderId(value)
                                    setSelectedModel('')
                                }}
                                disabled={loading}
                                loading={loading}
                            />

                            {/* Model Selection */}
                            <SearchableSelect
                                label="Model"
                                placeholder="Search and select model..."
                                value={selectedModel}
                                options={models.map(model => ({
                                    id: model.id,
                                    name: model.name || model.id,
                                    description: model.description || model.id
                                }))}
                                onChange={setSelectedModel}
                                disabled={!selectedProviderId || models.length === 0}
                            />

                            {/* Prompt Selection */}
                            <PromptSelector
                                value={selectedPromptId}
                                onChange={handlePromptChange}
                                label="Prompt"
                                placeholder="Search and select prompt..."
                            />

                            {/* Variable Inputs */}
                            {variables.length > 0 && (
                                <div className="space-y-4">
                                    <Label>Prompt Variables</Label>
                                    {variables.map((variable, index) => (
                                        <div key={variable.name} className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor={`var-${index}`}>{variable.name}</Label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openPostSelectorForVariable(index)}
                                                    className="text-xs"
                                                >
                                                    <FileText className="h-3 w-3 mr-1" />
                                                    Select Post
                                                </Button>
                                            </div>
                                            <Textarea
                                                id={`var-${index}`}
                                                value={variable.value}
                                                onChange={(e) => handleVariableChange(index, e.target.value)}
                                                placeholder={`Enter value for ${variable.name}`}
                                                className="min-h-[100px]"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Execute Button */}
                            <Button
                                onClick={executePrompt}
                                disabled={executing || !selectedProviderId || !selectedModel || !selectedPrompt}
                                className="w-full"
                            >
                                {executing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Executing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Execute
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Result Panel */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Result</CardTitle>
                            <CardDescription>AI response will appear here</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {executing ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                </div>
                            ) : result ? (
                                <div className="space-y-4">
                                    <Textarea
                                        value={result}
                                        readOnly
                                        className="min-h-[400px] font-mono text-sm"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                navigator.clipboard.writeText(result)
                                                success('Result copied to clipboard')
                                            }}
                                        >
                                            Copy Result
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    No result yet. Configure and execute a prompt to see results.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Post Selector Modal */}
                <PostSelectorModal
                    open={openPostSelector}
                    onClose={() => {
                        setOpenPostSelector(false)
                        setCurrentVariableIndex(-1)
                    }}
                    onSelect={handleSelectPost}
                />
            </div>
        </div>
    )
}

