'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { datasetApi, documentApi, type Dataset, type Document } from '@/lib/api'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, ArrowLeft, ChevronDown, LogOut, MessageSquare, FileText, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'
import { DatasetDocumentsPanel } from '@/components/dataset-documents-panel'
import { DatasetChatPanel } from '@/components/dataset-chat-panel'
import { SimpleChatPanel } from '@/components/simple-chat-panel'
import { DatasetNotesPanel } from '@/components/dataset-notes-panel'
import { DocumentPreviewModal } from '@/components/document-preview-modal'

// Collapsed Documents Panel Component
interface CollapsedDocumentsPanelProps {
    datasetId: string
    onDocumentClick?: (document: Document) => void
    onExpand: () => void
}

function CollapsedDocumentsPanel({ datasetId, onDocumentClick, onExpand }: CollapsedDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)

    useEffect(() => {
        const loadDocuments = async () => {
            try {
                setLoading(true)
                const docs = await documentApi.getByDataset(datasetId)
                setDocuments(docs)
            } catch (err) {
                console.error('Failed to load documents:', err)
            } finally {
                setLoading(false)
            }
        }
        loadDocuments()
    }, [datasetId])

    const handleDocumentClick = (document: Document) => {
        setPreviewDocument(document)
        setShowPreview(true)
        if (onDocumentClick) {
            onDocumentClick(document)
        }
    }

    const handleClosePreview = () => {
        setShowPreview(false)
        setPreviewDocument(null)
    }

    return (
        <>
            <div className="h-full bg-white border border-gray-200 rounded-lg flex flex-col">
                <div className="p-2 border-b border-gray-200">
                    <button
                        onClick={onExpand}
                        className="w-full p-2 hover:bg-gray-100 rounded flex items-center justify-center"
                        title="Expand documents panel"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-xs text-gray-400 text-center">
                                No docs
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {documents.map((document) => (
                                <button
                                    key={document.id}
                                    onClick={() => handleDocumentClick(document)}
                                    className="w-full p-2 hover:bg-gray-100 rounded flex items-center justify-center group"
                                    title={document.name}
                                >
                                    <FileText className="h-4 w-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Document Preview Modal */}
            <DocumentPreviewModal
                document={previewDocument}
                isOpen={showPreview}
                onClose={handleClosePreview}
            />
        </>
    )
}

export default function DatasetDetailPage() {
    const params = useParams()
    const router = useRouter()
    const datasetId = params.id as string

    const [dataset, setDataset] = useState<Dataset | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
    const [leftCollapsed, setLeftCollapsed] = useState(false)
    const [rightCollapsed, setRightCollapsed] = useState(false)
    const [user, setUser] = useState<AuthUser | null>(null)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'documents' | 'chat' | 'notes'>('chat')
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const currentUser = authUtil.getUser()
        if (currentUser) {
            setUser(currentUser)
        } else {
            router.push('/login')
        }
    }, [router])

    // Handle responsive behavior
    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 1024) // lg breakpoint
        }

        checkScreenSize()
        window.addEventListener('resize', checkScreenSize)
        return () => window.removeEventListener('resize', checkScreenSize)
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

            {/* Responsive Layout */}
            {isMobile ? (
                /* Mobile/Tablet Tab Layout */
                <div className="flex-1 flex flex-col px-4 mt-4 pb-4">
                    {/* Tab Navigation */}
                    <div className="flex bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'documents'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <FileText className="h-4 w-4" />
                            Documents
                        </button>
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'chat'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <MessageSquare className="h-4 w-4" />
                            Chat
                        </button>
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'notes'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <StickyNote className="h-4 w-4" />
                            Notes
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 min-h-0">
                        {activeTab === 'documents' && (
                            <DatasetDocumentsPanel
                                datasetId={datasetId}
                                onDocumentClick={handleDocumentClick}
                                showCollapseButton={false}
                            />
                        )}
                        {activeTab === 'chat' && (
                            <DatasetChatPanel
                                datasetId={datasetId}
                                selectedDocumentId={selectedDocument?.id}
                                datasetName={dataset?.name}
                            />
                        )}
                        {activeTab === 'notes' && (
                            <DatasetNotesPanel
                                datasetId={datasetId}
                                showCollapseButton={false}
                            />
                        )}
                    </div>
                </div>
            ) : (
                /* Desktop 3-Column Layout */
                <div className="flex-1 flex px-6 gap-4 mt-4 pb-4">
                    {/* Left Column - Documents */}
                    <div className={`${leftCollapsed ? 'w-12' : 'w-80'} flex-shrink-0 transition-all duration-300`}>
                        {leftCollapsed ? (
                            <CollapsedDocumentsPanel
                                datasetId={datasetId}
                                onDocumentClick={handleDocumentClick}
                                onExpand={() => setLeftCollapsed(false)}
                            />
                        ) : (
                            <DatasetDocumentsPanel
                                datasetId={datasetId}
                                onDocumentClick={handleDocumentClick}
                                onCollapse={() => setLeftCollapsed(true)}
                            />
                        )}
                    </div>

                    {/* Middle Column - Chat */}
                    <div className="flex-1 min-w-0">
                        <DatasetChatPanel
                            datasetId={datasetId}
                            selectedDocumentId={selectedDocument?.id}
                            datasetName={dataset?.name}
                        />
                    </div>

                    {/* Right Column - Notes */}
                    <div className={`${rightCollapsed ? 'w-12' : 'w-80'} flex-shrink-0 transition-all duration-300`}>
                        {rightCollapsed ? (
                            <div className="h-full bg-white border border-gray-200 rounded-lg flex flex-col">
                                <div className="p-2 border-b border-gray-200">
                                    <button
                                        onClick={() => setRightCollapsed(false)}
                                        className="w-full p-2 hover:bg-gray-100 rounded flex items-center justify-center"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-xs text-gray-500 transform -rotate-90 whitespace-nowrap">
                                        Notes
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <DatasetNotesPanel
                                datasetId={datasetId}
                                onCollapse={() => setRightCollapsed(true)}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}