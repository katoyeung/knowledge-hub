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
    Database
} from 'lucide-react'
import { datasetApi, documentApi, type Dataset, type Document, type CsvConnectorTemplate, type CsvUploadConfig, CsvConnectorType } from '@/lib/api'
import { EmbeddingConfigStep, EmbeddingConfigData } from './embedding-config/embedding-config-step'
import { EmbeddingConfigService } from '@/lib/services/embedding-config.service'

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


type WizardStep = 'dataset-and-upload' | 'embedding-config' | 'complete'

export function UnifiedDocumentWizard({
    mode,
    existingDataset,
    onComplete,
    onClose
}: UnifiedDocumentWizardProps) {
    // Determine initial step based on mode
    const getInitialStep = (): WizardStep => {
        return mode === 'create-dataset' ? 'dataset-and-upload' : 'dataset-and-upload'
    }

    const [currentStep, setCurrentStep] = useState<WizardStep>(getInitialStep())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 1: Dataset Info and Document Upload
    const [datasetName, setDatasetName] = useState('')
    const [createdDataset, setCreatedDataset] = useState<Dataset | null>(existingDataset || null)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploadedDocuments, setUploadedDocuments] = useState<Document[]>([])

    // CSV-related state
    const [csvTemplates, setCsvTemplates] = useState<CsvConnectorTemplate[]>([])
    const [csvConfig, setCsvConfig] = useState<CsvUploadConfig | null>(null)
    const [showCsvConfig, setShowCsvConfig] = useState(false)

    // Step 2: Embedding Configuration
    const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfigData>(() => {
        const recommended = EmbeddingConfigService.getRecommendedConfig('general')
        return recommended
    })

    // Validate embedding configuration
    const validateEmbeddingConfig = useCallback(() => {
        return EmbeddingConfigService.validateConfig(embeddingConfig)
    }, [embeddingConfig])

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

    // CSV detection and configuration
    const hasCsvFiles = selectedFiles.some(file =>
        file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
    )

    // Load CSV templates when component mounts
    React.useEffect(() => {
        const loadCsvTemplates = async () => {
            try {
                const templates = await documentApi.getCsvTemplates()
                setCsvTemplates(templates)
            } catch (error) {
                console.error('Failed to load CSV templates:', error)
            }
        }
        loadCsvTemplates()
    }, [])

    // Handle CSV connector selection
    const handleCsvConnectorSelect = useCallback((connectorType: CsvConnectorType) => {
        setCsvConfig({
            connectorType,
            fieldMappings: {},
            searchableColumns: [],
        })
        setShowCsvConfig(true)
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
            })

            setCreatedDataset(result.data)
            // After creating dataset, upload documents
            await handleUploadDocuments(result.data)
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Failed to create dataset')
        } finally {
            setLoading(false)
        }
    }

    // Step 2: Upload Documents
    const handleUploadDocuments = async (dataset?: Dataset) => {
        const targetDataset = dataset || createdDataset || existingDataset
        if (!targetDataset || selectedFiles.length === 0) {
            setError('Please select files to upload')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const result = await datasetApi.uploadDocuments(targetDataset.id, selectedFiles, csvConfig || undefined)
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

        // Validate embedding configuration
        const validation = validateEmbeddingConfig()
        if (!validation.isValid) {
            setError(`Configuration error: ${validation.errors.join(', ')}`)
            return
        }

        // Show warnings if any
        if (validation.warnings.length > 0) {
            // Configuration warnings can be handled by UI notifications
        }

        setLoading(true)
        setError(null)

        try {
            // Convert configuration to backend DTO format
            const configDto = EmbeddingConfigService.toBackendDto(embeddingConfig)

            await datasetApi.processDocuments({
                datasetId: targetDataset.id,
                documentIds: uploadedDocuments.map(doc => doc.id),
                ...configDto,
            } as Parameters<typeof datasetApi.processDocuments>[0])

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
        if (currentStep === 'embedding-config') {
            setCurrentStep('dataset-and-upload')
        } else if (currentStep === 'dataset-and-upload') {
            // For the first step, close the wizard
            if (onClose) {
                onClose()
            }
        }
    }

    const getStepNumber = () => {
        switch (currentStep) {
            case 'dataset-and-upload': return 1
            case 'embedding-config': return 2
            case 'complete': return 3
            default: return 1
        }
    }



    const getStepLabels = () => {
        return ['Dataset & Upload', 'Embedding Config', 'Complete']
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
            case 'dataset-and-upload':
                if (mode === 'create-dataset') {
                    return datasetName.trim().length > 0 && selectedFiles.length > 0
                } else {
                    return selectedFiles.length > 0
                }
            case 'embedding-config':
                const validation = validateEmbeddingConfig()
                return validation.isValid
            default:
                return false
        }
    }

    const handleNext = () => {
        switch (currentStep) {
            case 'dataset-and-upload':
                if (mode === 'create-dataset') {
                    // First create dataset, then upload documents
                    handleCreateDataset()
                } else {
                    // Just upload documents
                    handleUploadDocuments()
                }
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
                {/* Step 1: Dataset Info and Upload Documents */}
                {currentStep === 'dataset-and-upload' && (
                    <div className="space-y-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <Database className="h-6 w-6 text-blue-600" />
                            <h2 className="text-xl font-semibold text-gray-900">
                                {mode === 'create-dataset' ? 'Create Dataset & Upload Documents' : 'Upload Documents'}
                            </h2>
                        </div>

                        {/* Dataset Name (only for create-dataset mode) */}
                        {mode === 'create-dataset' && (
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
                            </div>
                        )}

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
                                    Supports PDF, TXT, MD, DOC, DOCX, and CSV files
                                </p>
                            </div>
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.txt,.md,.doc,.docx,.csv"
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
                                                {file.type === 'text/csv' && (
                                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                        CSV
                                                    </span>
                                                )}
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

                        {/* CSV Configuration */}
                        {hasCsvFiles && !csvConfig && (
                            <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center space-x-2">
                                    <Database className="h-5 w-5 text-blue-600" />
                                    <h4 className="text-sm font-medium text-blue-900">
                                        CSV Files Detected
                                    </h4>
                                </div>
                                <p className="text-sm text-blue-700">
                                    Select a connector template to configure how your CSV data should be processed.
                                </p>
                                <div className="space-y-2">
                                    <h5 className="text-xs font-medium text-blue-800">Available Connectors:</h5>
                                    <div className="grid grid-cols-1 gap-2">
                                        {csvTemplates.map((template) => (
                                            <button
                                                key={template.name}
                                                onClick={() => handleCsvConnectorSelect(template.name as CsvConnectorType)}
                                                className="text-left p-3 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                                            >
                                                <div className="font-medium text-sm text-gray-900">
                                                    {template.displayName}
                                                </div>
                                                <div className="text-xs text-gray-600 mt-1">
                                                    {template.description}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* CSV Configuration Details */}
                        {csvConfig && (
                            <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                        <h4 className="text-sm font-medium text-green-900">
                                            CSV Configuration
                                        </h4>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setCsvConfig(null)
                                            setShowCsvConfig(false)
                                        }}
                                        className="text-xs text-green-700 hover:text-green-900"
                                    >
                                        Change
                                    </button>
                                </div>
                                <div className="text-sm text-green-700">
                                    <strong>Connector:</strong> {csvTemplates.find(t => t.name === csvConfig.connectorType)?.displayName}
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* Step 2: Embedding Configuration */}
                {currentStep === 'embedding-config' && (
                    <EmbeddingConfigStep
                        config={embeddingConfig}
                        onChange={setEmbeddingConfig}
                        disabled={loading}
                        uploadedDocumentsCount={uploadedDocuments.length}
                    />
                )}

                {/* Step 3: Complete */}
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
                            <h3 className="text-sm font-medium text-green-900 mb-2">What&apos;s Next?</h3>
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
                    disabled={loading}
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