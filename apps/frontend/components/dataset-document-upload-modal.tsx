'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2, Plus, Settings, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { datasetApi, documentApi, postsApi, type Dataset, type Document, type CsvConnectorTemplate, type CsvUploadConfig, CsvConnectorType, type PostSearchParams, type Post } from '@/lib/api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface DatasetDocumentUploadModalProps {
    isOpen: boolean
    onClose: () => void
    dataset: Dataset
    onUploadSuccess?: (documents: Document[]) => void
}

export function DatasetDocumentUploadModal({
    isOpen,
    onClose,
    dataset,
    onUploadSuccess
}: DatasetDocumentUploadModalProps) {
    // Datasource state
    type DataSourceType = 'upload_file' | 'posts' | 'from_api'
    const [dataSource, setDataSource] = useState<DataSourceType>('upload_file')

    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [uploadResult, setUploadResult] = useState<{
        success: boolean
        message: string
    } | null>(null)
    const [currentStep, setCurrentStep] = useState<'upload' | 'processing'>('upload')
    const [uploadedDocuments, setUploadedDocuments] = useState<Document[]>([])

    // CSV-related state
    const [csvTemplates, setCsvTemplates] = useState<CsvConnectorTemplate[]>([])
    const [csvConfig, setCsvConfig] = useState<CsvUploadConfig | null>(null)
    const [csvValidation, setCsvValidation] = useState<{
        isValid: boolean
        missingColumns: string[]
        extraColumns: string[]
    } | null>(null)

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

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load CSV templates on component mount
    useEffect(() => {
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

    // Check if any selected files are CSV
    const hasCsvFiles = selectedFiles.some(file =>
        file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
    )

    // Handle file selection
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        setSelectedFiles(files)
        setError(null)

        // Reset CSV config when files change
        setCsvConfig(null)
        setCsvValidation(null)
    }, [])

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
            setSelectedFiles(prev => [...prev, ...droppedFiles])
            setError(null)
        }
    }, [])

    // Remove file from list
    const removeFile = useCallback((index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    }, [])

    // Handle CSV connector selection
    const handleCsvConnectorSelect = useCallback((connectorType: CsvConnectorType) => {
        setCsvConfig({
            connectorType,
            fieldMappings: {},
            searchableColumns: [],
        })
    }, [])


    // Format file size
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

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

    // Upload files or sync posts
    const handleUpload = async () => {
        if (dataSource === 'upload_file') {
            if (selectedFiles.length === 0) {
                setError('Please select at least one file to upload')
                return
            }
        } else if (dataSource === 'posts') {
            // Validate meta value if provided
            if (postFilters.metaValue && metaValueError) {
                setError('Please fix the meta value regex pattern')
                return
            }

            // For posts, show preview first if not already shown
            if (!previewData) {
                await fetchPostsPreview()
                return
            }
        }

        setUploading(true)
        setError(null)

        try {
            // Step 1: Upload documents or sync posts
            setCurrentStep('processing')
            let uploadResult

            if (dataSource === 'upload_file') {
                uploadResult = await datasetApi.uploadDocuments(dataset.id, selectedFiles, csvConfig || undefined)
            } else if (dataSource === 'posts') {
                // Clean up empty filter values
                const cleanFilters: PostSearchParams = {}
                Object.entries(postFilters).forEach(([key, value]) => {
                    if (value && value.trim()) {
                        cleanFilters[key as keyof PostSearchParams] = value
                    }
                })
                uploadResult = await datasetApi.syncPostsFromDataset(dataset.id, cleanFilters)
            } else {
                throw new Error('Unsupported datasource type')
            }

            setUploadedDocuments(uploadResult.data.documents)

            if (uploadResult.data.documents.length === 0) {
                setError('No documents found. Please check your filters or select files.')
                setCurrentStep('upload')
                return
            }

            // Small delay to show the processing step
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Step 2: Get dataset's effective configuration
            const effectiveConfig = await datasetApi.getEffectiveConfig(dataset.id)

            // Step 3: Process documents with dataset's existing configuration
            await datasetApi.processDocuments({
                datasetId: dataset.id,
                documentIds: uploadResult.data.documents.map(doc => doc.id),
                embeddingModel: effectiveConfig.embeddingModel,
                textSplitter: effectiveConfig.effectiveConfiguration.textSplitter,
                chunkSize: effectiveConfig.effectiveConfiguration.chunkSize,
                chunkOverlap: effectiveConfig.effectiveConfiguration.chunkOverlap,
                embeddingModelProvider: 'local', // Default to local
            })

            setUploadResult({
                success: true,
                message: `Successfully ${dataSource === 'posts' ? 'synced' : 'uploaded'} and started processing ${uploadResult.data.documents.length} document(s) with the dataset's existing settings.`
            })

            // Call success callback
            onUploadSuccess?.(uploadResult.data.documents)

            // Reset form after a delay
            setTimeout(() => {
                handleClose()
            }, 2000)

        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || `${dataSource === 'posts' ? 'Sync' : 'Upload'} failed`)
            setCurrentStep('upload')
        } finally {
            setUploading(false)
        }
    }

    // Handle modal close
    const handleClose = () => {
        setDataSource('upload_file')
        setSelectedFiles([])
        setUploading(false)
        setDragActive(false)
        setError(null)
        setUploadResult(null)
        setCurrentStep('upload')
        setUploadedDocuments([])
        setCsvConfig(null)
        setCsvValidation(null)
        setPostFilters({
            provider: '',
            source: '',
            title: '',
            metaKey: '',
            metaValue: '',
            postedAtStart: '',
            postedAtEnd: '',
        })
        setMetaValueError(null)
        setPreviewData(null)
        setPreviewError(null)
        setShowPreviewDialog(false)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Add Documents to Dataset</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
                    {currentStep === 'upload' && (
                        <div className="space-y-6">
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
                                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-300 hover:border-gray-400'
                                            }`}
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                    >
                                        <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                                            Upload Documents
                                        </h3>
                                        <p className="text-gray-600 mb-4">
                                            Drag and drop files here, or click to select files
                                        </p>
                                        <Button
                                            onClick={() => fileInputRef.current?.click()}
                                            variant="outline"
                                            className="mb-4"
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Select Files
                                        </Button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            onChange={handleFileSelect}
                                            className="hidden"
                                            accept=".pdf,.txt,.doc,.docx,.md,.csv"
                                        />
                                        <p className="text-sm text-gray-500">
                                            Supported formats: PDF, TXT, DOC, DOCX, MD, CSV
                                        </p>
                                    </div>

                                    {/* Selected Files */}
                                    {selectedFiles.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium text-gray-900">Selected Files</h4>
                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                {selectedFiles.map((file, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                                                    >
                                                        <div className="flex items-center space-x-2">
                                                            <FileText className="h-4 w-4 text-gray-500" />
                                                            <span className="text-sm text-gray-900">{file.name}</span>
                                                            <span className="text-xs text-gray-500">
                                                                ({formatFileSize(file.size)})
                                                            </span>
                                                            {file.type === 'text/csv' && (
                                                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                                    CSV
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => removeFile(index)}
                                                            className="p-1 hover:bg-gray-200 rounded"
                                                        >
                                                            <X className="h-4 w-4 text-gray-500" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* CSV Configuration */}
                                    {hasCsvFiles && !csvConfig && (
                                        <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                            <div className="flex items-center space-x-2">
                                                <Settings className="h-5 w-5 text-blue-600" />
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
                                                    }}
                                                    className="text-xs text-green-700 hover:text-green-900"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                            <div className="text-sm text-green-700">
                                                <strong>Connector:</strong> {csvTemplates.find(t => t.name === csvConfig.connectorType)?.displayName}
                                            </div>
                                            {csvValidation && (
                                                <div className="text-xs">
                                                    {csvValidation.isValid ? (
                                                        <span className="text-green-700">✓ CSV structure is valid</span>
                                                    ) : (
                                                        <div className="text-red-700">
                                                            <div>⚠ CSV validation issues:</div>
                                                            {csvValidation.missingColumns.length > 0 && (
                                                                <div>Missing columns: {csvValidation.missingColumns.join(', ')}</div>
                                                            )}
                                                            {csvValidation.extraColumns.length > 0 && (
                                                                <div>Extra columns: {csvValidation.extraColumns.join(', ')}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Error Display */}
                                    {error && (
                                        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <AlertCircle className="h-5 w-5 text-red-500" />
                                            <span className="text-sm text-red-700">{error}</span>
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

                            {/* Upload Button */}
                            <div className="flex justify-end space-x-3">
                                <Button variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={
                                        uploading ||
                                        (dataSource === 'upload_file' && (selectedFiles.length === 0 || (hasCsvFiles && !csvConfig))) ||
                                        (dataSource === 'posts' && metaValueError !== null)
                                    }
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {dataSource === 'posts' ? 'Syncing...' : 'Uploading...'}
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            {dataSource === 'posts' ? 'Sync Posts' : 'Upload Documents'}
                                        </>
                                    )}
                                </Button>
                            </div>
                            {dataSource === 'upload_file' && hasCsvFiles && !csvConfig && (
                                <p className="text-sm text-amber-600 text-center">
                                    Please configure CSV connector before uploading
                                </p>
                            )}
                        </div>
                    )}


                    {currentStep === 'processing' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <Loader2 className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">
                                    Processing Documents
                                </h3>
                                <p className="text-gray-600">
                                    Please wait while your documents are being processed and indexed...
                                </p>
                            </div>

                            {/* Processing Status */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-gray-900">Processing Status</h4>
                                <div className="space-y-1">
                                    {uploadedDocuments.map((doc) => (
                                        <div
                                            key={doc.id}
                                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <FileText className="h-4 w-4 text-gray-500" />
                                                <span className="text-sm text-gray-900">{doc.name}</span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                                <span className="text-xs text-gray-500">Processing...</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Success Result */}
                    {uploadResult?.success && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">
                                    Upload Successful!
                                </h3>
                                <p className="text-gray-600">{uploadResult.message}</p>
                            </div>

                            <div className="flex justify-center">
                                <Button onClick={handleClose}>
                                    Close
                                </Button>
                            </div>
                        </div>
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
                                onClick={async () => {
                                    setShowPreviewDialog(false)
                                    // Proceed with upload - skip preview check since we already confirmed
                                    const targetDataset = dataset
                                    if (!targetDataset) {
                                        setError('Dataset is required')
                                        return
                                    }

                                    setUploading(true)
                                    setError(null)

                                    try {
                                        // Clean up empty filter values
                                        const cleanFilters: PostSearchParams = {}
                                        Object.entries(postFilters).forEach(([key, value]) => {
                                            if (value && value.trim()) {
                                                cleanFilters[key as keyof PostSearchParams] = value
                                            }
                                        })

                                        const uploadResult = await datasetApi.syncPostsFromDataset(targetDataset.id, cleanFilters)
                                        setUploadedDocuments(uploadResult.data.documents)

                                        if (uploadResult.data.documents.length === 0) {
                                            setError('No documents found. Please check your filters.')
                                            setUploading(false)
                                            return
                                        }

                                        // Small delay to show the processing step
                                        await new Promise(resolve => setTimeout(resolve, 1000))

                                        // Get dataset's effective configuration
                                        const effectiveConfig = await datasetApi.getEffectiveConfig(targetDataset.id)

                                        // Process documents with dataset's existing configuration
                                        await datasetApi.processDocuments({
                                            datasetId: targetDataset.id,
                                            documentIds: uploadResult.data.documents.map(doc => doc.id),
                                            embeddingModel: effectiveConfig.embeddingModel,
                                            textSplitter: effectiveConfig.effectiveConfiguration.textSplitter,
                                            chunkSize: effectiveConfig.effectiveConfiguration.chunkSize,
                                            chunkOverlap: effectiveConfig.effectiveConfiguration.chunkOverlap,
                                            embeddingModelProvider: 'local',
                                        })

                                        setUploadResult({
                                            success: true,
                                            message: `Successfully synced and started processing ${uploadResult.data.documents.length} document(s) with the dataset's existing settings.`
                                        })

                                        onUploadSuccess?.(uploadResult.data.documents)

                                        setTimeout(() => {
                                            handleClose()
                                        }, 2000)
                                    } catch (err: unknown) {
                                        const error = err as { response?: { data?: { message?: string } } }
                                        setError(error.response?.data?.message || 'Sync failed')
                                    } finally {
                                        setUploading(false)
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
