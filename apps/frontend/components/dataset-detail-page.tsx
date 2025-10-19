'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, Plus, Network, FileText, Settings } from 'lucide-react'
import { DocumentUploadWizard } from './document-upload-wizard'
import { GraphPage } from './graph-page'
import { type Dataset, type Document } from '@/lib/api'

interface DatasetDetailPageProps {
    dataset: Dataset
}

export function DatasetDetailPage({ dataset }: DatasetDetailPageProps) {
    const [showUploadWizard, setShowUploadWizard] = useState(false)
    const [documents, setDocuments] = useState<Document[]>([])

    const handleUploadComplete = (newDocuments: Document[]) => {
        setDocuments(prev => [...prev, ...newDocuments])
        setShowUploadWizard(false)

        // Optionally show a success message or refresh the page
    }

    const handleUploadClose = () => {
        setShowUploadWizard(false)
    }

    if (showUploadWizard) {
        return (
            <DocumentUploadWizard
                dataset={dataset}
                onComplete={handleUploadComplete}
                onClose={handleUploadClose}
            />
        )
    }

    return (
        <div className="max-w-6xl mx-auto p-6">
            {/* Dataset Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{dataset.name}</h1>
                        {dataset.description && (
                            <p className="text-gray-600 mt-2">{dataset.description}</p>
                        )}
                    </div>
                    <Button
                        onClick={() => setShowUploadWizard(true)}
                        className="flex items-center space-x-2"
                    >
                        <Upload className="h-4 w-4" />
                        <span>Upload Documents</span>
                    </Button>
                </div>

                {/* Dataset Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-500">Documents</h3>
                        <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-500">Embedding Model</h3>
                        <p className="text-sm text-gray-900">{'Not configured'}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-500">Status</h3>
                        <p className="text-sm text-gray-900">Active</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="graph" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="documents" className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>Documents</span>
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="flex items-center space-x-2">
                        <Network className="h-4 w-4" />
                        <span>Graph</span>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center space-x-2">
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="documents">
                    {/* Documents List */}
                    <div className="bg-white border border-gray-200 rounded-lg">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                        </div>

                        {documents.length === 0 ? (
                            <div className="p-8 text-center">
                                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
                                <p className="text-gray-600 mb-4">
                                    Upload your first documents to get started with this dataset.
                                </p>
                                <Button
                                    onClick={() => setShowUploadWizard(true)}
                                    className="flex items-center space-x-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    <span>Upload Documents</span>
                                </Button>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200">
                                {documents.map((doc, index) => (
                                    <div key={doc.id || index} className="px-6 py-4 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-900">{doc.name}</h3>
                                            <p className="text-xs text-gray-500">
                                                Uploaded • {doc.docType} • {doc.wordCount || 0} words
                                            </p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${doc.indexingStatus === 'completed'
                                                ? 'bg-green-100 text-green-800'
                                                : doc.indexingStatus === 'processing'
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {doc.indexingStatus || 'waiting'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="graph">
                    <GraphPage datasetId={dataset.id} datasetName={dataset.name} />
                </TabsContent>

                <TabsContent value="settings">
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dataset Settings</h2>
                        <p className="text-gray-600">Settings configuration coming soon...</p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
} 