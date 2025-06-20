'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { datasetApi, type Dataset } from '@/lib/api'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { DocumentList } from '@/components/document-list'
import { Sidebar } from '@/components/sidebar'
import { authUtil } from '@/lib/auth'

export default function DatasetDetailPage() {
    const params = useParams()
    const router = useRouter()
    const datasetId = params.id as string

    const [dataset, setDataset] = useState<Dataset | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fix hydration mismatch by using consistent initial state
    const [sidebarMinimized, setSidebarMinimized] = useState(false) // Always start with false for SSR

    // Set client state after hydration to prevent mismatch
    useEffect(() => {
        const saved = localStorage.getItem('sidebarMinimized')
        if (saved) {
            setSidebarMinimized(JSON.parse(saved))
        }
    }, [])

    useEffect(() => {
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

        if (datasetId) {
            fetchDataset()
        }
    }, [datasetId])

    const handleCreateDataset = () => {
        router.push('/')
    }

    const handleDatasetClick = (dataset: Dataset) => {
        router.push(`/datasets/${dataset.id}`)
    }

    const handleLogout = async () => {
        try {
            await authUtil.logout()
            router.push('/login')
        } catch (error) {
            console.error('Logout failed:', error)
            router.push('/login')
        }
    }

    const handleToggleSidebar = () => {
        const newState = !sidebarMinimized
        setSidebarMinimized(newState)
        if (typeof window !== 'undefined') {
            localStorage.setItem('sidebarMinimized', JSON.stringify(newState))
        }
    }

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
        <div className="min-h-screen bg-gray-50">
            <Sidebar
                onCreateDataset={handleCreateDataset}
                onDatasetClick={handleDatasetClick}
                onLogout={handleLogout}
                minimized={sidebarMinimized}
                onToggleMinimized={handleToggleSidebar}
            />

            <div className={`${sidebarMinimized ? 'ml-16' : 'ml-80'} transition-all duration-300`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center space-x-4 mb-4">
                            <Link
                                href="/"
                                className="flex items-center text-blue-600 hover:text-blue-700"
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                Back to Home
                            </Link>
                        </div>

                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {dataset?.name || 'Dataset'}
                            </h1>
                            {dataset?.description && (
                                <p className="text-gray-600 mt-2">{dataset.description}</p>
                            )}
                        </div>
                    </div>

                    {/* Documents List */}
                    {dataset && (
                        <DocumentList
                            datasetId={datasetId}
                            dataset={dataset}
                            onDatasetDeleted={() => {
                                // Navigate back to home when dataset is deleted
                                window.location.href = '/'
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    )
} 