'use client'

import React, { useState, useEffect } from 'react'
import { MessageSquare, StickyNote, Network } from 'lucide-react'
import { DatasetDocumentsPanel } from './dataset-documents-panel'
import { DatasetChatPanel } from './dataset-chat-panel'
import { DatasetNotesPanel } from './dataset-notes-panel'
import { GraphPage } from './graph-page'
import type { Document, Dataset } from '@/lib/api'

interface DatasetLeftRightLayoutProps {
    datasetId: string
    dataset: Dataset | null
    documents: Document[]
    documentsLoading: boolean
    onDocumentClick?: (document: Document) => void
    onSelectedDocumentsChange?: (documents: Document[]) => void
}

type RightPanelTab = 'chat' | 'graph' | 'notes'

export function DatasetLeftRightLayout({
    datasetId,
    dataset,
    documents,
    documentsLoading,
    onDocumentClick,
    onSelectedDocumentsChange
}: DatasetLeftRightLayoutProps) {
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
    const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])
    const [activeRightTab, setActiveRightTab] = useState<RightPanelTab>('chat')
    const [isMobile, setIsMobile] = useState<boolean | null>(null)

    // Handle responsive behavior
    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768) // md breakpoint
        }

        checkScreenSize()
        window.addEventListener('resize', checkScreenSize)
        return () => window.removeEventListener('resize', checkScreenSize)
    }, [])

    const handleDocumentClick = (document: Document) => {
        setSelectedDocument(document)
        if (onDocumentClick) {
            onDocumentClick(document)
        }
    }

    const handleSelectedDocumentsChange = (docs: Document[]) => {
        setSelectedDocuments(docs)
        if (onSelectedDocumentsChange) {
            onSelectedDocumentsChange(docs)
        }
    }

    if (isMobile === null) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (isMobile) {
        // Mobile layout - stacked tabs
        return (
            <div className="h-full flex flex-col">
                {/* Mobile Tab Navigation */}
                <div className="flex bg-white border-b border-gray-200">
                    <button
                        onClick={() => setActiveRightTab('chat')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors ${activeRightTab === 'chat'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Chat
                    </button>
                    <button
                        onClick={() => setActiveRightTab('graph')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors ${activeRightTab === 'graph'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <Network className="h-4 w-4" />
                        Graph
                    </button>
                    <button
                        onClick={() => setActiveRightTab('notes')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors ${activeRightTab === 'notes'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        <StickyNote className="h-4 w-4" />
                        Notes
                    </button>
                </div>

                {/* Mobile Content - Sources */}
                <div className="flex-1 min-h-0">
                    <DatasetDocumentsPanel
                        datasetId={datasetId}
                        documents={documents}
                        loading={documentsLoading}
                        onDocumentClick={handleDocumentClick}
                        onSelectedDocumentsChange={handleSelectedDocumentsChange}
                        showCollapseButton={false}
                        dataset={dataset || undefined}
                    />
                </div>

                {/* Mobile Right Panel - Overlay */}
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
                    <div className="bg-white w-full h-3/4 rounded-t-lg flex flex-col">
                        <div className="p-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold capitalize">{activeRightTab}</h3>
                        </div>
                        <div className="flex-1 min-h-0">
                            {activeRightTab === 'chat' && (
                                <DatasetChatPanel
                                    key={`chat-${datasetId}`}
                                    datasetId={datasetId}
                                    selectedDocumentId={selectedDocument?.id}
                                    selectedDocumentIds={selectedDocuments.map(doc => doc.id)}
                                    datasetName={dataset?.name}
                                    dataset={dataset || undefined}
                                    requireDocumentSelection={false}
                                />
                            )}
                            {activeRightTab === 'graph' && (
                                <GraphPage
                                    datasetId={datasetId}
                                    datasetName={dataset?.name}
                                />
                            )}
                            {activeRightTab === 'notes' && (
                                <DatasetNotesPanel
                                    datasetId={datasetId}
                                    showCollapseButton={false}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Desktop layout - Left/Right
    return (
        <div className="h-full flex gap-2 p-4">
            {/* Left Panel - Sources */}
            <div className="w-[300px] bg-white border border-gray-200 rounded-lg flex flex-col flex-shrink-0">
                <div className="flex-1 min-h-0">
                    <DatasetDocumentsPanel
                        datasetId={datasetId}
                        documents={documents}
                        loading={documentsLoading}
                        onDocumentClick={handleDocumentClick}
                        onSelectedDocumentsChange={handleSelectedDocumentsChange}
                        showCollapseButton={false}
                        dataset={dataset || undefined}
                    />
                </div>
            </div>

            {/* Right Panel - Chat/Graph/Notes */}
            <div className="flex-1 flex flex-col gap-2">
                {/* Right Panel Header with Tabs */}
                <div className="p-4 border border-gray-200 rounded-lg bg-white">
                    <div className="flex space-x-1">
                        <button
                            onClick={() => setActiveRightTab('chat')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeRightTab === 'chat'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                        >
                            <MessageSquare className="h-4 w-4 inline mr-2" />
                            Chat
                        </button>
                        <button
                            onClick={() => setActiveRightTab('graph')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeRightTab === 'graph'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                        >
                            <Network className="h-4 w-4 inline mr-2" />
                            Graph
                        </button>
                        <button
                            onClick={() => setActiveRightTab('notes')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeRightTab === 'notes'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                        >
                            <StickyNote className="h-4 w-4 inline mr-2" />
                            Notes
                        </button>
                    </div>
                </div>

                {/* Right Panel Content */}
                <div className="flex-1 min-h-0">
                    {activeRightTab === 'chat' && (
                        <DatasetChatPanel
                            key={`chat-${datasetId}`}
                            datasetId={datasetId}
                            selectedDocumentId={selectedDocument?.id}
                            selectedDocumentIds={selectedDocuments.map(doc => doc.id)}
                            datasetName={dataset?.name}
                            dataset={dataset || undefined}
                            requireDocumentSelection={false}
                        />
                    )}
                    {activeRightTab === 'graph' && (
                        <GraphPage
                            datasetId={datasetId}
                            datasetName={dataset?.name}
                        />
                    )}
                    {activeRightTab === 'notes' && (
                        <DatasetNotesPanel
                            datasetId={datasetId}
                            showCollapseButton={false}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
