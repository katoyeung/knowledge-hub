'use client'

import { useState } from 'react'
import { ModelSelection } from '@/components/model-selection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ModelSelectionDemo() {
    const [selectedProvider, setSelectedProvider] = useState<string>('dashscope')
    const [selectedModel, setSelectedModel] = useState<string>('qwen-max-latest')
    const [isDemoMode, setIsDemoMode] = useState(false)

    const handleStartDemo = () => {
        setIsDemoMode(true)
    }

    const handleStopDemo = () => {
        setIsDemoMode(false)
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-gray-900">Model Selection Demo</h1>
                <p className="text-gray-600">
                    Choose from multiple LLM providers and models for your chat conversations
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Model Selection */}
                <Card>
                    <CardHeader>
                        <CardTitle>Model Configuration</CardTitle>
                        <CardDescription>
                            Select your preferred LLM provider and model
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ModelSelection
                            selectedProvider={selectedProvider}
                            selectedModel={selectedModel}
                            onProviderChange={setSelectedProvider}
                            onModelChange={setSelectedModel}
                        />
                    </CardContent>
                </Card>

                {/* Current Selection */}
                <Card>
                    <CardHeader>
                        <CardTitle>Current Selection</CardTitle>
                        <CardDescription>
                            Your selected model configuration
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Provider:</span>
                                <span className="text-sm text-gray-900 capitalize">{selectedProvider}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Model:</span>
                                <span className="text-sm text-gray-900">{selectedModel}</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-200">
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleStartDemo}
                                    disabled={isDemoMode}
                                    size="sm"
                                    className="flex-1"
                                >
                                    {isDemoMode ? 'Demo Active' : 'Start Demo'}
                                </Button>
                                <Button
                                    onClick={handleStopDemo}
                                    disabled={!isDemoMode}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                >
                                    Stop Demo
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Features List */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Features</CardTitle>
                    <CardDescription>
                        What you can do with the model selection system
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Multiple Providers</h4>
                            <p className="text-sm text-gray-600">
                                Choose from DashScope, OpenRouter, Perplexity, Ollama, and local models
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Model Details</h4>
                            <p className="text-sm text-gray-600">
                                View pricing, token limits, and descriptions for each model
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Real-time Switching</h4>
                            <p className="text-sm text-gray-600">
                                Switch between models during your conversation
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Source Attribution</h4>
                            <p className="text-sm text-gray-600">
                                See which document segments were used for each response
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Conversation History</h4>
                            <p className="text-sm text-gray-600">
                                Maintain context across multiple messages
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-900">Document Integration</h4>
                            <p className="text-sm text-gray-600">
                                Chat with specific documents or document segments
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Demo Status */}
            {isDemoMode && (
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-green-800">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="font-medium">Demo Mode Active</span>
                        </div>
                        <p className="text-sm text-green-700 mt-1">
                            You can now use the chat interface with your selected model: {selectedModel}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
