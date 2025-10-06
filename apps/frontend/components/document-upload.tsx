'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
    Upload,
    File,
    X,
    Loader2,
    CheckCircle,
    AlertCircle,
    Brain,
    Settings
} from 'lucide-react'
import { documentApi, type Dataset, type Document } from '@/lib/api'

interface DocumentUploadProps {
    datasetId?: string
    onUploadSuccess?: (result: {
        dataset: Dataset
        documents: Document[]
    }) => void
    onClose?: () => void
}

export function DocumentUpload({ datasetId, onUploadSuccess, onClose }: DocumentUploadProps) {
    const [files, setFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const [datasetName, setDatasetName] = useState('')
    const [datasetDescription, setDatasetDescription] = useState('')
    const [uploadResult, setUploadResult] = useState<{
        success: boolean
        message: string
    } | null>(null)

    // LangChain RAG options
    const [enableLangChainRAG, setEnableLangChainRAG] = useState(false)
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
    const [chunkSize, setChunkSize] = useState(1000)
    const [chunkOverlap, setChunkOverlap] = useState(200)
    const [numChunks, setNumChunks] = useState(5)
    const [llmProvider, setLlmProvider] = useState('local-direct')
    const [llmModel, setLlmModel] = useState('google/gemma-2-9b-it')
    const [embeddingModel, setEmbeddingModel] = useState('BAAI/bge-m3')

    // Handle drag events
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }, [])

    // Handle drop event
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFiles = Array.from(e.dataTransfer.files)
            setFiles(prev => [...prev, ...droppedFiles])
        }
    }, [])

    // Handle file input change
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files)
            setFiles(prev => [...prev, ...selectedFiles])
        }
    }

    // Remove file from list
    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    // Format file size
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    // Upload files
    const handleUpload = async () => {
        if (files.length === 0) {
            setUploadResult({
                success: false,
                message: 'Please select at least one file to upload'
            })
            return
        }

        setUploading(true)
        setUploadResult(null)

        try {
            const result = await documentApi.upload(files, {
                datasetId,
                datasetName: datasetName.trim() || undefined,
                datasetDescription: datasetDescription.trim() || undefined,
                // Add LangChain RAG options if enabled
                ...(enableLangChainRAG && {
                    enableLangChainRAG: true,
                    langChainConfig: {
                        chunkSize,
                        chunkOverlap,
                        numChunks,
                        llmProvider,
                        llmModel,
                        embeddingModel,
                    }
                })
            })

            setUploadResult({
                success: true,
                message: result.message
            })

            // Call success callback
            onUploadSuccess?.({
                dataset: result.data.dataset,
                documents: result.data.documents
            })

            // Reset form
            setFiles([])
            setDatasetName('')
            setDatasetDescription('')

        } catch (error) {
            console.error('Upload failed:', error)
            setUploadResult({
                success: false,
                message: error instanceof Error ? error.message : 'Upload failed'
            })
        } finally {
            setUploading(false)
        }
    }

    if (uploadResult?.success) {
        return (
            <div className="p-8 text-center">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Upload Successful!
                </h3>
                <p className="text-gray-600 mb-6">
                    {uploadResult.message}
                </p>
                <div className="flex gap-3 justify-center">
                    <Button
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setUploadResult(null)
                            setFiles([])
                        }}
                        variant="outline"
                    >
                        Upload More Files
                    </Button>
                    {onClose && (
                        <Button onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onClose?.()
                        }}>
                            Done
                        </Button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Upload Documents
                </h3>
                <p className="text-sm text-gray-600">
                    Upload PDF, Word, Text, Markdown, JSON, or CSV files to create or add to a dataset.
                </p>
            </div>

            {/* Dataset options (only show if no datasetId provided) */}
            {!datasetId && (
                <div className="mb-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dataset Name (optional)
                        </label>
                        <Input
                            value={datasetName}
                            onChange={(e) => setDatasetName(e.target.value)}
                            placeholder="Leave empty to use first file name"
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dataset Description (optional)
                        </label>
                        <Input
                            value={datasetDescription}
                            onChange={(e) => setDatasetDescription(e.target.value)}
                            placeholder="Describe your dataset"
                            className="w-full"
                        />
                    </div>
                </div>
            )}

            {/* LangChain RAG Options */}
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center space-x-2 mb-4">
                    <Brain className="h-5 w-5 text-blue-600" />
                    <h4 className="text-sm font-medium text-gray-900">LangChain RAG Processing</h4>
                </div>

                <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                        id="enable-langchain-rag"
                        checked={enableLangChainRAG}
                        onCheckedChange={(checked) => setEnableLangChainRAG(checked as boolean)}
                    />
                    <Label htmlFor="enable-langchain-rag" className="text-sm text-gray-700">
                        Enable LangChain RAG processing (advanced document analysis with retrieval-augmented generation)
                    </Label>
                </div>

                {enableLangChainRAG && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Advanced Options</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                className="flex items-center space-x-1"
                            >
                                <Settings className="h-4 w-4" />
                                <span>{showAdvancedOptions ? 'Hide' : 'Show'}</span>
                            </Button>
                        </div>

                        {showAdvancedOptions && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded border">
                                <div>
                                    <Label htmlFor="chunk-size" className="text-xs font-medium text-gray-700">
                                        Chunk Size
                                    </Label>
                                    <Input
                                        id="chunk-size"
                                        type="number"
                                        value={chunkSize}
                                        onChange={(e) => setChunkSize(parseInt(e.target.value) || 1000)}
                                        min="100"
                                        max="8000"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="chunk-overlap" className="text-xs font-medium text-gray-700">
                                        Chunk Overlap
                                    </Label>
                                    <Input
                                        id="chunk-overlap"
                                        type="number"
                                        value={chunkOverlap}
                                        onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 200)}
                                        min="0"
                                        max="500"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="num-chunks" className="text-xs font-medium text-gray-700">
                                        Number of Chunks to Retrieve
                                    </Label>
                                    <Input
                                        id="num-chunks"
                                        type="number"
                                        value={numChunks}
                                        onChange={(e) => setNumChunks(parseInt(e.target.value) || 5)}
                                        min="1"
                                        max="20"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="embedding-model" className="text-xs font-medium text-gray-700">
                                        Embedding Model
                                    </Label>
                                    <select
                                        id="embedding-model"
                                        value={embeddingModel}
                                        onChange={(e) => setEmbeddingModel(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    >
                                        <option value="BAAI/bge-m3">BAAI/bge-m3 (Multilingual)</option>
                                        <option value="mixedbread-ai/mxbai-embed-large-v1">MixedBread mxbai-embed-large-v1</option>
                                        <option value="WhereIsAI/UAE-Large-V1">WhereIsAI UAE-Large-V1</option>
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="llm-provider" className="text-xs font-medium text-gray-700">
                                        LLM Provider
                                    </Label>
                                    <select
                                        id="llm-provider"
                                        value={llmProvider}
                                        onChange={(e) => setLlmProvider(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    >
                                        <option value="local-direct">Local Direct</option>
                                        <option value="openrouter">OpenRouter</option>
                                        <option value="ollama">Ollama</option>
                                        <option value="dashscope">DashScope</option>
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="llm-model" className="text-xs font-medium text-gray-700">
                                        LLM Model
                                    </Label>
                                    <Input
                                        id="llm-model"
                                        value={llmModel}
                                        onChange={(e) => setLlmModel(e.target.value)}
                                        placeholder="e.g., google/gemma-2-9b-it"
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                            <strong>What this does:</strong> LangChain RAG will process your documents using advanced retrieval-augmented generation.
                            It will split documents into chunks, create embeddings, and set up a vector database for intelligent question-answering.
                        </div>
                    </div>
                )}
            </div>

            {/* Drag and drop area */}
            <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                    }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4 pointer-events-none" />
                <div className="space-y-2 pointer-events-none">
                    <p className="text-lg font-medium text-gray-900">
                        Drop files here or click to browse
                    </p>
                    <p className="text-sm text-gray-500">
                        Supports PDF, Word, Text, Markdown, JSON, and CSV files up to 10MB each
                    </p>
                </div>
                <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.json,.csv"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>

            {/* File list */}
            {files.length > 0 && (
                <div className="mt-6" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                        Selected Files ({files.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {files.map((file, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center space-x-3">
                                    <File className="h-5 w-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {formatFileSize(file.size)}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        removeFile(index)
                                    }}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Error message */}
            {uploadResult && !uploadResult.success && (
                <div
                    className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3"
                    onClick={(e) => e.stopPropagation()}
                >
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-800">Upload Failed</p>
                        <p className="text-sm text-red-600">{uploadResult.message}</p>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
                {onClose && (
                    <Button
                        variant="outline"
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onClose?.()
                        }}
                        disabled={uploading}
                    >
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleUpload()
                    }}
                    disabled={files.length === 0 || uploading}
                    className="min-w-[120px]"
                >
                    {uploading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        'Upload Files'
                    )}
                </Button>
            </div>
        </div>
    )
} 