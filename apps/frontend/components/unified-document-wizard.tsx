'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    ArrowLeft,
    ArrowRight,
    Upload,
    File,
    X,
    Loader2,
    CheckCircle,
    Database,
    Eye
} from 'lucide-react'
import { datasetApi, documentApi, postsApi, type Dataset, type Document, type CsvConnectorTemplate, type CsvUploadConfig, CsvConnectorType, type PostSearchParams, type Post } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
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
    // Datasource state
    type DataSourceType = 'upload_file' | 'posts' | 'from_api'
    const [dataSource, setDataSource] = useState<DataSourceType>('upload_file')

    const [datasetName, setDatasetName] = useState('')
    const [createdDataset, setCreatedDataset] = useState<Dataset | null>(existingDataset || null)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploadedDocuments, setUploadedDocuments] = useState<Document[]>([])

    // CSV-related state
    const [csvTemplates, setCsvTemplates] = useState<CsvConnectorTemplate[]>([])
    const [csvConfig, setCsvConfig] = useState<CsvUploadConfig | null>(null)
    const [showCsvConfig, setShowCsvConfig] = useState(false)

    // Posts filter state
    const [postFilters, setPostFilters] = useState<PostSearchParams>({
        provider: '',
        source: '',
        title: '',
        metaKey: '',
        metaValue: '',
        postedAtStart: '',
        postedAtEnd: '',
    })
    const [metaValueError, setMetaValueError] = useState<string | null>(null)

    // Posts preview state
    const [showPreviewDialog, setShowPreviewDialog] = useState(false)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewData, setPreviewData] = useState<{ total: number; samplePosts: Post[] } | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)

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

    // Load CSV templates only when wizard is opened and CSV files are selected (lazy loading)
    React.useEffect(() => {
        // Only load templates when CSV files are detected - don't load on mount
        if (!hasCsvFiles) return

        const loadCsvTemplates = async () => {
            try {
                const templates = await documentApi.getCsvTemplates()
                setCsvTemplates(templates)
            } catch (error) {
                console.error('Failed to load CSV templates:', error)
            }
        }
        loadCsvTemplates()
    }, [hasCsvFiles]) // Only load when CSV files are detected

    // Handle CSV connector selection
    const handleCsvConnectorSelect = useCallback((connectorType: CsvConnectorType) => {
        setCsvConfig({
            connectorType,
            fieldMappings: {},
            searchableColumns: [],
        })
        setShowCsvConfig(true)
    }, [])

    // Validate regex pattern for meta value
    const validateRegexPattern = (value: string): string | null => {
        if (!value.trim()) {
            return null
        }

        const regexFormat = /^\/(.+)\/([gimsuvy]*)$/
        const regexMatch = value.match(regexFormat)

        if (regexMatch) {
            try {
                new RegExp(regexMatch[1], regexMatch[2])
                return null
            } catch (error) {
                return `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
        }

        const hasRegexMetacharacters = /[()|\[\]*+?{}^$\.]/.test(value)
        if (hasRegexMetacharacters && !value.includes('/')) {
            try {
                new RegExp(value)
                return null
            } catch (error) {
                return `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
        }

        return null
    }

    // Handle post filter change
    const handlePostFilterChange = (key: keyof PostSearchParams, value: string) => {
        setPostFilters(prev => ({ ...prev, [key]: value }))

        if (key === 'metaValue') {
            const error = validateRegexPattern(value)
            setMetaValueError(error)
        } else if (metaValueError) {
            setMetaValueError(null)
        }

        // Reset preview when filters change
        setPreviewData(null)
    }

    // Fetch posts preview
    const fetchPostsPreview = async () => {
        if (metaValueError) {
            setPreviewError('Please fix the meta value regex pattern')
            return
        }

        setPreviewLoading(true)
        setPreviewError(null)

        try {
            // Clean up empty filter values
            const cleanFilters: PostSearchParams = {
                page: 1,
                limit: 10, // Get 10 sample posts
            }
            Object.entries(postFilters).forEach(([key, value]) => {
                if (value && value.trim() && key !== 'page' && key !== 'limit') {
                    cleanFilters[key as keyof PostSearchParams] = value
                }
            })

            const response = await postsApi.getAll(cleanFilters)
            setPreviewData({
                total: response.total || 0,
                samplePosts: response.data || [],
            })
            setShowPreviewDialog(true)
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string }
            setPreviewError(error.response?.data?.message || error.message || 'Failed to fetch preview')
            setShowPreviewDialog(true)
        } finally {
            setPreviewLoading(false)
        }
    }

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

    // Step 2: Upload Documents or Sync Posts
    const handleUploadDocuments = async (dataset?: Dataset) => {
        const targetDataset = dataset || createdDataset || existingDataset
        if (!targetDataset) {
            setError('Dataset is required')
            return
        }

        if (dataSource === 'upload_file' && selectedFiles.length === 0) {
            setError('Please select files to upload')
            return
        }

        if (dataSource === 'posts' && metaValueError) {
            setError('Please fix the meta value regex pattern')
            return
        }

        setLoading(true)
        setError(null)

        try {
            let result

            if (dataSource === 'upload_file') {
                result = await datasetApi.uploadDocuments(targetDataset.id, selectedFiles, csvConfig || undefined)
            } else if (dataSource === 'posts') {
                // Clean up empty filter values
                const cleanFilters: PostSearchParams = {}
                Object.entries(postFilters).forEach(([key, value]) => {
                    if (value && value.trim()) {
                        cleanFilters[key as keyof PostSearchParams] = value
                    }
                })
                result = await datasetApi.syncPostsFromDataset(targetDataset.id, cleanFilters)
            } else {
                throw new Error('Unsupported datasource type')
            }

            if (result.data.documents.length === 0) {
                setError('No documents found. Please check your filters or select files.')
                return
            }

            setUploadedDocuments(result.data.documents)
            setCurrentStep('embedding-config')
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || `${dataSource === 'posts' ? 'Sync' : 'Upload'} failed`)
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
        // Reset preview state
        setPreviewData(null)
        setPreviewError(null)
        setShowPreviewDialog(false)
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
                    if (!datasetName.trim().length) return false
                    if (dataSource === 'upload_file') {
                        return selectedFiles.length > 0 && !(hasCsvFiles && !csvConfig)
                    } else if (dataSource === 'posts') {
                        return metaValueError === null
                    }
                    return false
                } else {
                    if (dataSource === 'upload_file') {
                        return selectedFiles.length > 0 && !(hasCsvFiles && !csvConfig)
                    } else if (dataSource === 'posts') {
                        return metaValueError === null
                    }
                    return false
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
                if (dataSource === 'posts') {
                    // For posts, show preview first if not already shown
                    if (!previewData) {
                        fetchPostsPreview()
                        return
                    }
                }

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

                        {/* Data Source Selector */}
                        <div className="space-y-2">
                            <Label>Data Source</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={dataSource === 'upload_file' ? 'default' : 'outline'}
                                    onClick={() => setDataSource('upload_file')}
                                    className="flex-1"
                                >
                                    Upload File
                                </Button>
                                <Button
                                    type="button"
                                    variant={dataSource === 'posts' ? 'default' : 'outline'}
                                    onClick={() => setDataSource('posts')}
                                    className="flex-1"
                                >
                                    Posts
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled
                                    className="flex-1 opacity-50"
                                    title="Coming soon"
                                >
                                    From API
                                </Button>
                            </div>
                        </div>

                        {dataSource === 'upload_file' && (
                            <>
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
                            </>
                        )}

                        {dataSource === 'posts' && (
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <h4 className="text-sm font-medium text-blue-900 mb-2">
                                        Filter Posts
                                    </h4>
                                    <p className="text-sm text-blue-700 mb-4">
                                        Configure filters to select which posts to sync to this dataset. Each matching post will become a document with its content as a segment.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="filter-provider">Provider</Label>
                                        <Input
                                            id="filter-provider"
                                            placeholder="Filter by provider"
                                            value={postFilters.provider || ''}
                                            onChange={(e) => handlePostFilterChange('provider', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="filter-source">Source</Label>
                                        <Input
                                            id="filter-source"
                                            placeholder="Filter by source"
                                            value={postFilters.source || ''}
                                            onChange={(e) => handlePostFilterChange('source', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="filter-title">Title</Label>
                                        <Input
                                            id="filter-title"
                                            placeholder="Search in title"
                                            value={postFilters.title || ''}
                                            onChange={(e) => handlePostFilterChange('title', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="filter-status">Status</Label>
                                        <Select
                                            value={postFilters.status || 'all'}
                                            onValueChange={(value) => handlePostFilterChange('status', value === 'all' ? '' : value)}
                                        >
                                            <SelectTrigger id="filter-status">
                                                <SelectValue placeholder="All Statuses" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Statuses</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="approved">Approved</SelectItem>
                                                <SelectItem value="rejected">Rejected</SelectItem>
                                                <SelectItem value="review">Review</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="filter-posted-at-start">Posted At Start</Label>
                                        <Input
                                            id="filter-posted-at-start"
                                            type="date"
                                            value={postFilters.postedAtStart || ''}
                                            onChange={(e) => handlePostFilterChange('postedAtStart', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="filter-posted-at-end">Posted At End</Label>
                                        <Input
                                            id="filter-posted-at-end"
                                            type="date"
                                            value={postFilters.postedAtEnd || ''}
                                            onChange={(e) => handlePostFilterChange('postedAtEnd', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t">
                                    <div>
                                        <Label htmlFor="filter-meta-key">Meta Key</Label>
                                        <Input
                                            id="filter-meta-key"
                                            placeholder="Meta key (e.g., site)"
                                            value={postFilters.metaKey || ''}
                                            onChange={(e) => handlePostFilterChange('metaKey', e.target.value)}
                                        />
                                    </div>
                                    {postFilters.metaKey && (
                                        <div>
                                            <Label htmlFor="filter-meta-value">Meta Value (Supports Regex)</Label>
                                            <Textarea
                                                id="filter-meta-value"
                                                placeholder="Meta value or regex pattern (e.g., /pattern/i or (限时|特惠))"
                                                value={postFilters.metaValue || ''}
                                                onChange={(e) => handlePostFilterChange('metaValue', e.target.value)}
                                                rows={3}
                                                className={`resize-none ${metaValueError ? 'border-red-300 focus:border-red-500' : ''}`}
                                            />
                                            {metaValueError ? (
                                                <p className="text-xs text-red-600 mt-1">
                                                    {metaValueError}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Use regex pattern: /pattern/flags (e.g., /test/i) or just pattern with metacharacters
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Preview Button */}
                                <div className="pt-4 border-t">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={fetchPostsPreview}
                                        disabled={previewLoading || metaValueError !== null}
                                        className="w-full"
                                    >
                                        {previewLoading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Loading Preview...
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="h-4 w-4 mr-2" />
                                                Preview Posts ({previewData?.total ?? '?'})
                                            </>
                                        )}
                                    </Button>
                                    {previewError && (
                                        <p className="text-xs text-red-600 mt-2">{previewError}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {dataSource === 'upload_file' && hasCsvFiles && !csvConfig && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm text-amber-600 text-center">
                                    Please configure CSV connector before proceeding
                                </p>
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

            {/* Posts Preview Dialog */}
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Posts Preview</DialogTitle>
                        <DialogDescription>
                            Preview of posts that will be synced to the dataset based on your current filters.
                        </DialogDescription>
                    </DialogHeader>

                    {previewError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{previewError}</p>
                        </div>
                    ) : previewData ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-blue-900">
                                            Total Posts Found
                                        </p>
                                        <p className="text-2xl font-bold text-blue-600 mt-1">
                                            {previewData.total.toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-blue-700">
                                            Sample Posts
                                        </p>
                                        <p className="text-sm text-blue-600">
                                            {previewData.samplePosts.length} shown
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {previewData.samplePosts.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-gray-900">
                                        Sample Posts (first 10):
                                    </h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {previewData.samplePosts.map((post) => (
                                            <div
                                                key={post.id}
                                                className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">
                                                            {post.title || 'No title'}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {post.provider && (
                                                                <span className="text-xs text-gray-500">
                                                                    Provider: {post.provider}
                                                                </span>
                                                            )}
                                                            {post.source && (
                                                                <span className="text-xs text-gray-500">
                                                                    Source: {post.source}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {post.meta?.content && (
                                                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                                                {post.meta.content}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {previewData.total === 0 && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm text-amber-700">
                                        No posts found matching your filters. Please adjust your filter criteria.
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowPreviewDialog(false)}
                        >
                            Close
                        </Button>
                        {previewData && previewData.total > 0 && (
                            <Button
                                onClick={() => {
                                    setShowPreviewDialog(false)
                                    // Proceed to next step
                                    if (mode === 'create-dataset') {
                                        handleCreateDataset()
                                    } else {
                                        handleUploadDocuments()
                                    }
                                }}
                            >
                                Proceed with {previewData.total.toLocaleString()} Posts
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
} 