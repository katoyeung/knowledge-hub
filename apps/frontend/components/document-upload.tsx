'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Upload,
    File,
    X,
    Loader2,
    CheckCircle,
    AlertCircle,
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