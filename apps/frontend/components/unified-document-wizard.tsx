'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    ArrowLeft,
    ArrowRight,
    Upload,
    File,
    X,
    Loader2,
    CheckCircle,
    Settings,
    Database
} from 'lucide-react'
import { datasetApi, type Dataset, type Document } from '@/lib/api'

// Unified wizard that can handle both create dataset and upload documents flows
interface UnifiedDocumentWizardProps {
    // For dataset creation flow
    mode: 'create-dataset' | 'upload-documents'

    // For upload documents flow (when mode is 'upload-documents')
    existingDataset?: Dataset

    // Callbacks
    onComplete?: (result: { dataset: Dataset; documents: Document[] }) => void
    onClose?: () => void
}

// Embedding models enum mapping - 1024D Models Only
const EMBEDDING_MODELS = {
    // 1024-Dimension Models Only (for consistency and compatibility)
    'Xenova/bge-m3': 'BGE M3 - Multilingual (1024 dims) ⭐',
    'mixedbread-ai/mxbai-embed-large-v1': 'MixedBread AI - High Quality English (1024 dims)',
    'WhereIsAI/UAE-Large-V1': 'UAE Large V1 - Universal Angle (1024 dims)',
    'custom': 'Custom Model (must be 1024 dimensions)',
}

const TEXT_SPLITTERS = {
    'recursive_character': 'Recursive Character Text Splitter',
    'character': 'Character Text Splitter',
    'token': 'Token Text Splitter',
    'markdown': 'Markdown Text Splitter',
    'python_code': 'Python Code Text Splitter',
}

type WizardStep = 'dataset-info' | 'upload-documents' | 'embedding-config' | 'complete'

export function UnifiedDocumentWizard({
    mode,
    existingDataset,
    onComplete,
    onClose
}: UnifiedDocumentWizardProps) {
    // Determine initial step based on mode
    const getInitialStep = (): WizardStep => {
        return mode === 'create-dataset' ? 'dataset-info' : 'upload-documents'
    }

    const [currentStep, setCurrentStep] = useState<WizardStep>(getInitialStep())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 1: Dataset Info (only for create-dataset mode)
    const [datasetName, setDatasetName] = useState('')
    const [datasetDescription, setDatasetDescription] = useState('')
    const [createdDataset, setCreatedDataset] = useState<Dataset | null>(existingDataset || null)

    // Step 2: Document Upload
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploadedDocuments, setUploadedDocuments] = useState<Document[]>([])

    // Step 3: Embedding Configuration
    const [embeddingModel, setEmbeddingModel] = useState<keyof typeof EMBEDDING_MODELS>('Xenova/bge-m3')
    const [customModelName, setCustomModelName] = useState('')
    const [textSplitter, setTextSplitter] = useState<keyof typeof TEXT_SPLITTERS>('recursive_character')
    const [chunkSize, setChunkSize] = useState(800)
    const [chunkOverlap, setChunkOverlap] = useState(80)
    // 🆕 Parent-Child Chunking state - enabled by default
    const [enableParentChildChunking, setEnableParentChildChunking] = useState(true)

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        setSelectedFiles(files)
        setError(null)
    }, [])

    const removeFile = useCallback((index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files)
        setSelectedFiles(files)
        setError(null)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
    }, [])

    // Step 1: Create Dataset (only for create-dataset mode)
    const handleCreateDataset = async () => {
        if (!datasetName.trim()) {
            setError('Dataset name is required')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const result = await datasetApi.createStepOne({
                name: datasetName.trim(),
                description: datasetDescription.trim() || undefined,
            })

            setCreatedDataset(result.data)
            setCurrentStep('upload-documents')
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Failed to create dataset')
        } finally {
            setLoading(false)
        }
    }

    // Step 2: Upload Documents
    const handleUploadDocuments = async () => {
        const targetDataset = createdDataset || existingDataset
        if (!targetDataset || selectedFiles.length === 0) {
            setError('Please select files to upload')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const result = await datasetApi.uploadDocuments(targetDataset.id, selectedFiles)
            setUploadedDocuments(result.data.documents)
            setCurrentStep('embedding-config')
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Failed to upload documents')
        } finally {
            setLoading(false)
        }
    }

    // Step 3: Process Documents with Embedding Config
    const handleProcessDocuments = async () => {
        const targetDataset = createdDataset || existingDataset
        if (!targetDataset || uploadedDocuments.length === 0) {
            setError('No documents to process')
            return
        }

        // Validate custom model name if custom is selected
        if (embeddingModel === 'custom' && !customModelName.trim()) {
            setError('Custom model name is required when using custom model')
            return
        }

        setLoading(true)
        setError(null)

        try {
            await datasetApi.processDocuments({
                datasetId: targetDataset.id,
                documentIds: uploadedDocuments.map(doc => doc.id),
                embeddingModel,
                customModelName: embeddingModel === 'custom' ? customModelName.trim() : undefined,
                textSplitter,
                chunkSize,
                chunkOverlap,
                // 🆕 Include Parent-Child Chunking option
                enableParentChildChunking,
            })

            setCurrentStep('complete')
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Failed to process documents')
        } finally {
            setLoading(false)
        }
    }

    const handleComplete = () => {
        const targetDataset = createdDataset || existingDataset
        if (targetDataset && onComplete) {
            onComplete({
                dataset: targetDataset,
                documents: uploadedDocuments
            })
        }
        onClose?.()
    }

    const handleBack = () => {
        if (currentStep === 'upload-documents' && mode === 'create-dataset') {
            setCurrentStep('dataset-info')
        } else if (currentStep === 'embedding-config') {
            setCurrentStep('upload-documents')
        }
    }

    const getStepNumber = () => {
        if (mode === 'create-dataset') {
            switch (currentStep) {
                case 'dataset-info': return 1
                case 'upload-documents': return 2
                case 'embedding-config': return 3
                case 'complete': return 4
                default: return 1
            }
        } else {
            switch (currentStep) {
                case 'upload-documents': return 1
                case 'embedding-config': return 2
                case 'complete': return 3
                default: return 1
            }
        }
    }



    const getStepLabels = () => {
        if (mode === 'create-dataset') {
            return ['Dataset Info', 'Upload Documents', 'Embedding Config', 'Complete']
        } else {
            return ['Upload Documents', 'Embedding Config', 'Complete']
        }
    }

    const getTitle = () => {
        if (mode === 'create-dataset') {
            return 'Create New Dataset'
        } else {
            return `Upload Documents to ${existingDataset?.name || 'Dataset'}`
        }
    }

    const canGoNext = () => {
        switch (currentStep) {
            case 'dataset-info':
                return datasetName.trim().length > 0
            case 'upload-documents':
                return selectedFiles.length > 0
            case 'embedding-config':
                return embeddingModel !== 'custom' || customModelName.trim().length > 0
            default:
                return false
        }
    }

    const handleNext = () => {
        switch (currentStep) {
            case 'dataset-info':
                handleCreateDataset()
                break
            case 'upload-documents':
                handleUploadDocuments()
                break
            case 'embedding-config':
                handleProcessDocuments()
                break
        }
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">{getTitle()}</h1>
                    <Button variant="outline" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center space-x-4 mb-6">
                    {getStepLabels().map((step, index) => (
                        <div key={step} className="flex items-center">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${index + 1 <= getStepNumber()
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-600'
                                }`}>
                                {index + 1}
                            </div>
                            <span className={`ml-2 text-sm ${index + 1 <= getStepNumber() ? 'text-gray-900' : 'text-gray-500'
                                }`}>
                                {step}
                            </span>
                            {index < getStepLabels().length - 1 && (
                                <ArrowRight className="h-4 w-4 mx-3 text-gray-400" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            {/* Step Content */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                {/* Step 1: Dataset Info (only for create-dataset mode) */}
                {currentStep === 'dataset-info' && mode === 'create-dataset' && (
                    <div className="space-y-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <Database className="h-6 w-6 text-blue-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Dataset Information</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Dataset Name *
                                </label>
                                <Input
                                    value={datasetName}
                                    onChange={(e) => setDatasetName(e.target.value)}
                                    placeholder="Enter dataset name"
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={datasetDescription}
                                    onChange={(e) => setDatasetDescription(e.target.value)}
                                    placeholder="Describe your dataset..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    rows={3}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Upload Documents */}
                {currentStep === 'upload-documents' && (
                    <div className="space-y-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <Upload className="h-6 w-6 text-blue-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Upload Documents</h2>
                        </div>

                        {/* File Upload Area */}
                        <div
                            className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                        >
                            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <div className="space-y-2">
                                <p className="text-lg font-medium text-gray-900">
                                    Drop files here or click to browse
                                </p>
                                <p className="text-sm text-gray-500">
                                    Supports PDF, TXT, MD, and other text documents
                                </p>
                            </div>
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.txt,.md,.doc,.docx"
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>

                        {/* Selected Files */}
                        {selectedFiles.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-gray-700">
                                    Selected Files ({selectedFiles.length})
                                </h3>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <File className="h-4 w-4 text-gray-500" />
                                                <span className="text-sm text-gray-900">{file.name}</span>
                                                <span className="text-xs text-gray-500">
                                                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                                </span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeFile(index)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Embedding Configuration */}
                {currentStep === 'embedding-config' && (
                    <div className="space-y-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <Settings className="h-6 w-6 text-blue-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Embedding Configuration</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Embedding Model */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Embedding Model
                                </label>
                                <select
                                    value={embeddingModel}
                                    onChange={(e) => setEmbeddingModel(e.target.value as keyof typeof EMBEDDING_MODELS)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {Object.entries(EMBEDDING_MODELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {embeddingModel === 'custom' && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Custom Model Name
                                    </label>
                                    <Input
                                        value={customModelName}
                                        onChange={(e) => setCustomModelName(e.target.value)}
                                        placeholder="e.g., sentence-transformers/all-MiniLM-L6-v2"
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Must be a 1024-dimension model for compatibility
                                    </p>
                                </div>
                            )}

                            {/* Text Splitter */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Text Splitter
                                </label>
                                <select
                                    value={textSplitter}
                                    onChange={(e) => setTextSplitter(e.target.value as keyof typeof TEXT_SPLITTERS)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {Object.entries(TEXT_SPLITTERS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Chunk Size */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Chunk Size
                                </label>
                                <Input
                                    type="number"
                                    value={chunkSize}
                                    onChange={(e) => setChunkSize(parseInt(e.target.value) || 1000)}
                                    min={100}
                                    max={4000}
                                    className="w-full"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Characters per chunk (100-4000)
                                </p>
                            </div>

                            {/* Chunk Overlap */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Chunk Overlap
                                </label>
                                <Input
                                    type="number"
                                    value={chunkOverlap}
                                    onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 200)}
                                    min={0}
                                    max={Math.floor(chunkSize / 2)}
                                    className="w-full"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Overlap between chunks (0-{Math.floor(chunkSize / 2)})
                                </p>
                            </div>

                            {/* 🆕 Parent-Child Chunking */}
                            <div className="md:col-span-2">
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        id="enableParentChildChunking"
                                        checked={enableParentChildChunking}
                                        onChange={(e) => setEnableParentChildChunking(e.target.checked)}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="enableParentChildChunking" className="text-sm font-medium text-gray-700">
                                        Enable Parent-Child Chunking (Advanced)
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 ml-7">
                                    🔗 Creates hierarchical chunks (parent paragraphs + child sentences) for improved recall and context.
                                    Only works with PDF documents. <span className="text-blue-600">+60-90% recall improvement</span> expected.
                                </p>
                                {enableParentChildChunking && (
                                    <div className="mt-3 ml-7 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                        <div className="flex items-start space-x-2">
                                            <div className="text-blue-600 mt-0.5">ℹ️</div>
                                            <div className="text-xs text-blue-700">
                                                <strong>How it works:</strong>
                                                <ul className="mt-1 space-y-1">
                                                    <li>• <strong>Parent chunks:</strong> Larger sections (~{Math.floor(chunkSize * 1.5)} chars) for context</li>
                                                    <li>• <strong>Child chunks:</strong> Smaller segments (~{Math.floor(chunkSize * 0.6)} chars) for precision</li>
                                                    <li>• <strong>Smart retrieval:</strong> Find precise matches, include parent context</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Uploaded Documents Summary */}
                        {uploadedDocuments.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-blue-900 mb-2">
                                    Ready to Process
                                </h3>
                                <p className="text-sm text-blue-700">
                                    {uploadedDocuments.length} document{uploadedDocuments.length !== 1 ? 's' : ''} will be processed with the selected configuration.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Complete */}
                {currentStep === 'complete' && (
                    <div className="text-center space-y-6">
                        <div className="flex justify-center">
                            <CheckCircle className="h-16 w-16 text-green-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                {mode === 'create-dataset' ? 'Dataset Created Successfully!' : 'Documents Uploaded Successfully!'}
                            </h2>
                            <p className="text-gray-600">
                                {mode === 'create-dataset'
                                    ? `Your dataset "${createdDataset?.name || existingDataset?.name}" has been created and documents are being processed.`
                                    : `${uploadedDocuments.length} document${uploadedDocuments.length !== 1 ? 's' : ''} have been uploaded and are being processed.`
                                }
                            </p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-green-900 mb-2">What's Next?</h3>
                            <ul className="text-sm text-green-700 space-y-1">
                                <li>• Documents are being processed in the background</li>
                                <li>• Embeddings are being generated for search</li>
                                <li>• You can start searching once processing is complete</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-6">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={currentStep === getInitialStep() || loading}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>

                <div className="space-x-3">
                    {currentStep === 'complete' ? (
                        <Button onClick={handleComplete}>
                            Done
                        </Button>
                    ) : (
                        <Button
                            onClick={handleNext}
                            disabled={!canGoNext() || loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Next
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
} 