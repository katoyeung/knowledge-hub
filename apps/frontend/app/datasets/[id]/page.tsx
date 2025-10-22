'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { datasetApi, documentApi, type Dataset, type Document } from '@/lib/api'
import { Loader2, AlertCircle, ArrowLeft, ChevronDown, LogOut } from 'lucide-react'
import Link from 'next/link'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'
import { DatasetLeftRightLayout } from '@/components/dataset-left-right-layout'
import { AuthGuard } from '@/components/auth-guard'


function DatasetDetailContent() {
    const params = useParams()
    const router = useRouter()
    const datasetId = params.id as string

    const [dataset, setDataset] = useState<Dataset | null>(null)
    const [documents, setDocuments] = useState<Document[]>([])
    const [documentsLoading, setDocumentsLoading] = useState(true)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    // These are passed as props to DatasetThreeColumnLayout
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])
    const [user, setUser] = useState<AuthUser | null>(null)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    // Refs to prevent duplicate API calls in React StrictMode
    const dataFetchedRef = useRef(false)
    const currentDatasetIdRef = useRef<string | null>(null)
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        const currentUser = authUtil.getUser()
        if (currentUser) {
            setUser(currentUser)
        }
    }, [])


    useEffect(() => {
        // Prevent duplicate API calls in React StrictMode
        if (dataFetchedRef.current && currentDatasetIdRef.current === datasetId) {
            return
        }

        const fetchDataset = async () => {
            try {
                setLoading(true)
                setError(null)
                const datasetData = await datasetApi.getById(datasetId)
                setDataset(datasetData)
            } catch (err: unknown) {
                const error = err as { response?: { data?: { message?: string } } }
                setError(error.response?.data?.message || 'Failed to load dataset')
            } finally {
                setLoading(false)
            }
        }

        const fetchDocuments = async () => {
            try {
                setDocumentsLoading(true)
                const docs = await documentApi.getByDataset(datasetId)
                setDocuments(docs)
            } catch (err) {
                console.error('Failed to load documents:', err)
            } finally {
                setDocumentsLoading(false)
            }
        }

        if (datasetId) {
            dataFetchedRef.current = true
            currentDatasetIdRef.current = datasetId
            fetchDataset()
            fetchDocuments()
        }
    }, [datasetId])

    // Helper function to check if any documents are processing
    const hasProcessingDocuments = useCallback(() => {
        return documents.some(doc =>
            doc.indexingStatus === 'waiting' ||
            doc.indexingStatus === 'processing' ||
            doc.indexingStatus === 'parsing' ||
            doc.indexingStatus === 'splitting' ||
            doc.indexingStatus === 'indexing'
        )
    }, [documents])

    // Polling effect for document status updates
    useEffect(() => {
        const startPolling = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
            }

            if (hasProcessingDocuments()) {
                pollingIntervalRef.current = setInterval(async () => {
                    try {
                        const docs = await documentApi.getByDataset(datasetId)
                        setDocuments(docs)
                    } catch (err) {
                        console.error('Failed to refresh documents during polling:', err)
                    }
                }, 3000) // Poll every 3 seconds
            }
        }

        const stopPolling = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
            }
        }

        // Start polling if there are processing documents
        if (hasProcessingDocuments()) {
            startPolling()
        } else {
            stopPolling()
        }

        // Cleanup on unmount
        return () => {
            stopPolling()
        }
    }, [datasetId, hasProcessingDocuments])

    // Handle page visibility changes to pause/resume polling
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Page is hidden, stop polling
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current)
                    pollingIntervalRef.current = null
                }
            } else if (hasProcessingDocuments()) {
                // Page is visible and has processing documents, resume polling
                pollingIntervalRef.current = setInterval(async () => {
                    try {
                        const docs = await documentApi.getByDataset(datasetId)
                        setDocuments(docs)
                    } catch (err) {
                        console.error('Failed to refresh documents during polling:', err)
                    }
                }, 3000)
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [datasetId, hasProcessingDocuments])

    const handleLogout = async () => {
        try {
            await authUtil.logout()
            router.push('/login')
        } catch (error) {
            console.error('Logout failed:', error)
            router.push('/login')
        }
    }

    const getUserInitials = (email: string) => {
        if (!email) return '?'
        return email.substring(0, 2).toUpperCase()
    }

    const handleDocumentClick = (document: Document) => {
        setSelectedDocument(document)
    }

    const handleSelectedDocumentsChange = useCallback((documents: Document[]) => {
        setSelectedDocuments(documents)
    }, [])

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading dataset...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Dataset</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Link
                        href="/"
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Home
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen bg-gray-50 flex flex-col">
            {/* Full-width Header */}
            <div className="bg-white border-b border-gray-200 w-full flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link
                                href="/"
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                title="Back to Home"
                            >
                                <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                                    KH
                                </div>
                            </Link>
                            <div className="h-4 w-px bg-gray-300"></div>
                            <h1 className="text-xl font-semibold text-gray-900">
                                {dataset?.name || 'Dataset'}
                            </h1>
                        </div>

                        {/* User avatar and dropdown */}
                        <div className="relative">
                            <button
                                className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-gray-100"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                    {user ? getUserInitials(user.email) : 'U'}
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                            </button>

                            {/* Dropdown menu */}
                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <p className="text-sm font-medium text-gray-800">{user?.email}</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Simple Left-Right Layout */}
            <div className="flex-1 min-h-0">
                <DatasetLeftRightLayout
                    datasetId={datasetId}
                    dataset={dataset}
                    documents={documents}
                    documentsLoading={documentsLoading}
                    onDocumentClick={handleDocumentClick}
                    onSelectedDocumentsChange={handleSelectedDocumentsChange}
                />
            </div>
        </div>
    )
}

export default function DatasetDetailPage() {
    return (
        <AuthGuard>
            <DatasetDetailContent />
        </AuthGuard>
    )
}