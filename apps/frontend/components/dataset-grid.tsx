'use client'

import { useState, useEffect } from 'react'
import { DatasetCard } from './dataset-card'
import { CreateDatasetCard } from './create-dataset-card'
import { datasetApi, type Dataset } from '@/lib/api'

interface DatasetGridProps {
    onCreateDataset: () => void
    onDatasetClick: (dataset: Dataset) => void
}

export function DatasetGrid({ onCreateDataset, onDatasetClick }: DatasetGridProps) {
    const [datasets, setDatasets] = useState<Dataset[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadDatasets()
    }, [])

    const loadDatasets = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const response = await datasetApi.getAll()

            setDatasets(response.data)
        } catch (err) {
            console.error('Failed to load datasets:', err)
            setError('Failed to load datasets. Please try again.')
            setDatasets([]) // Ensure datasets is always an array
        } finally {
            setIsLoading(false)
        }
    }

    const handleEditDataset = async (id: string, newName: string) => {
        try {
            await datasetApi.update(id, { name: newName })
            setDatasets(prev =>
                prev.map(dataset =>
                    dataset.id === id ? { ...dataset, name: newName } : dataset
                )
            )
        } catch (err) {
            console.error('Failed to update dataset:', err)
            throw err
        }
    }

    const handleDeleteDataset = async (id: string) => {
        try {
            await datasetApi.delete(id)
            setDatasets(prev => prev.filter(dataset => dataset.id !== id))
        } catch (err) {
            console.error('Failed to delete dataset:', err)
            throw err
        }
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                        <div className="bg-gray-200 rounded-lg h-48"></div>
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error}</p>
                <button
                    onClick={loadDatasets}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    Try Again
                </button>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Create new dataset card - always first */}
            <CreateDatasetCard onClick={onCreateDataset} />

            {/* Dataset cards */}
            {datasets && datasets.length > 0 ? (
                datasets.map((dataset) => (
                    <DatasetCard
                        key={dataset.id}
                        dataset={dataset}
                        onEdit={handleEditDataset}
                        onDelete={handleDeleteDataset}
                        onClick={onDatasetClick}
                    />
                ))
            ) : (
                <div className="col-span-full text-center py-12 text-gray-500">
                    <p>No datasets found. Create your first dataset to get started!</p>
                </div>
            )}
        </div>
    )
}
