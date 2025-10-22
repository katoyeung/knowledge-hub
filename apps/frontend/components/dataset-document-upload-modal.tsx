'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { datasetApi, documentApi, type Dataset, type Document, type CsvConnectorTemplate, type CsvUploadConfig, CsvConnectorType } from '@/lib/api'

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
        setShowCsvConfig(false)
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
        setShowCsvConfig(true)
    }, [])


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
        if (selectedFiles.length === 0) {
            setError('Please select at least one file to upload')
            return
        }

        setUploading(true)
        setError(null)

        try {
            // Step 1: Upload documents
            setCurrentStep('processing')
            const uploadResult = await datasetApi.uploadDocuments(dataset.id, selectedFiles, csvConfig || undefined)
            setUploadedDocuments(uploadResult.data.documents)

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
                message: `Successfully uploaded and started processing ${uploadResult.data.documents.length} document(s) with the dataset's existing settings.`
            })

            // Call success callback
            onUploadSuccess?.(uploadResult.data.documents)

            // Reset form after a delay
            setTimeout(() => {
                handleClose()
            }, 2000)

        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Upload failed')
            setCurrentStep('upload')
        } finally {
            setUploading(false)
        }
    }

    // Handle modal close
    const handleClose = () => {
        setSelectedFiles([])
        setUploading(false)
        setDragActive(false)
        setError(null)
        setUploadResult(null)
        setCurrentStep('upload')
        setUploadedDocuments([])
        setCsvConfig(null)
        setShowCsvConfig(false)
        setCsvValidation(null)
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

                            {/* Upload Button */}
                            <div className="flex justify-end space-x-3">
                                <Button variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={
                                        selectedFiles.length === 0 ||
                                        uploading ||
                                        (hasCsvFiles && !csvConfig)
                                    }
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Upload Documents
                                        </>
                                    )}
                                </Button>
                            </div>
                            {hasCsvFiles && !csvConfig && (
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
        </div>
    )
}
