'use client'

import React, { useState, useEffect } from 'react'
import { ModelSelection } from '@/components/model-selection'
import { chatApi } from '@/lib/api'

export default function TestModelsPage() {
    const [selectedProvider, setSelectedProvider] = useState<string>('dashscope')
    const [selectedModel, setSelectedModel] = useState<string>('qwen-max-latest')
    const [providers, setProviders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadModels = async () => {
            try {
                setLoading(true)
                const response = await chatApi.getModels()
                setProviders(response.providers)
                console.log('Loaded providers:', response.providers)
            } catch (err) {
                console.error('Failed to load models:', err)
                setError(err instanceof Error ? err.message : 'Failed to load models')
            } finally {
                setLoading(false)
            }
        }
        loadModels()
    }, [])

    const handleProviderChange = (provider: string) => {
        setSelectedProvider(provider)
        console.log('Selected provider:', provider)
    }

    const handleModelChange = (model: string) => {
        setSelectedModel(model)
        console.log('Selected model:', model)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading models...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-600 text-xl mb-4">Error</div>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">Model Selection Test</h1>

                <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Current Selection</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                            <div className="p-3 bg-gray-100 rounded-md">{selectedProvider}</div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                            <div className="p-3 bg-gray-100 rounded-md">{selectedModel}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Available Providers</h2>
                    <div className="space-y-4">
                        {providers.map((provider) => (
                            <div key={provider.id} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-medium">{provider.name}</h3>
                                    <span className={`px-2 py-1 rounded text-xs ${provider.available
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                        }`}>
                                        {provider.available ? 'Available' : 'Unavailable'}
                                    </span>
                                </div>
                                {provider.availabilityMessage && (
                                    <p className="text-sm text-gray-600 mb-2">{provider.availabilityMessage}</p>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {provider.models.map((model: any) => (
                                        <div key={model.id} className={`p-2 rounded text-sm ${model.available
                                            ? 'bg-gray-50 hover:bg-gray-100'
                                            : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            <div className="font-medium">{model.name}</div>
                                            <div className="text-xs text-gray-500">{model.id}</div>
                                            {model.availabilityMessage && (
                                                <div className="text-xs text-red-500">{model.availabilityMessage}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold mb-4">Model Selection Component</h2>
                    <ModelSelection
                        selectedProvider={selectedProvider}
                        selectedModel={selectedModel}
                        onProviderChange={handleProviderChange}
                        onModelChange={handleModelChange}
                    />
                </div>
            </div>
        </div>
    )
}
