'use client'

import { useState } from 'react'
import { Edit2, Trash2, Check, X } from 'lucide-react'
// import { Button } from '@/components/ui/simple-button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import type { Dataset } from '@/lib/api'

interface DatasetCardProps {
    dataset: Dataset
    onEdit: (id: string, newName: string) => Promise<void>
    onDelete: (id: string) => Promise<void>
    onClick: (dataset: Dataset) => void
}

export function DatasetCard({ dataset, onEdit, onDelete, onClick }: DatasetCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(dataset.name)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const handleEdit = async () => {
        if (editName.trim() && editName !== dataset.name) {
            setIsLoading(true)
            try {
                await onEdit(dataset.id, editName.trim())
                setIsEditing(false)
            } catch (error) {
                console.error('Failed to update dataset:', error)
                setEditName(dataset.name) // Reset to original name on error
            } finally {
                setIsLoading(false)
            }
        } else {
            setIsEditing(false)
            setEditName(dataset.name)
        }
    }

    const handleCancelEdit = () => {
        setIsEditing(false)
        setEditName(dataset.name)
    }

    const handleDelete = async () => {
        setIsLoading(true)
        try {
            await onDelete(dataset.id)
            setShowDeleteDialog(false)
        } catch (error) {
            console.error('Failed to delete dataset:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    return (
        <>
            <Card
                className="group hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                onClick={() => !isEditing && onClick(dataset)}
            >
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-end">
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleEdit()
                                        }}
                                        disabled={isLoading}
                                        className="h-8 w-8 p-0 inline-flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-50"
                                    >
                                        <Check className="h-4 w-4 text-green-600" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleCancelEdit()
                                        }}
                                        disabled={isLoading}
                                        className="h-8 w-8 p-0 inline-flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-50"
                                    >
                                        <X className="h-4 w-4 text-red-600" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setIsEditing(true)
                                        }}
                                        className="h-8 w-8 p-0 inline-flex items-center justify-center rounded hover:bg-gray-100"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setShowDeleteDialog(true)
                                        }}
                                        className="h-8 w-8 p-0 inline-flex items-center justify-center rounded hover:bg-gray-100"
                                    >
                                        <Trash2 className="h-4 w-4 text-red-600" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-0 pb-6">
                    {isEditing ? (
                        <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="text-2xl font-bold border-0 p-0 h-auto focus:ring-0 focus:border-0"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                            }}
                        />
                    ) : (
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">
                            {dataset.name}
                        </h3>
                    )}

                    <div className="text-sm text-gray-500">
                        Created {formatDate(dataset.createdAt)}
                    </div>
                </CardContent>
            </Card>

            {/* Delete confirmation dialog */}
            {showDeleteDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteDialog(false)} />
                    <div className="relative bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Dataset</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Are you sure you want to delete &quot;{dataset.name}&quot;? This action cannot be undone and will permanently remove all associated documents and data.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDeleteDialog(false)}
                                disabled={isLoading}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isLoading}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                                {isLoading ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
