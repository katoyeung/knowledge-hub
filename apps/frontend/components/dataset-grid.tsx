'use client'

import { useState, useEffect, useCallback } from 'react'
import { DatasetCard } from './dataset-card'
import { CreateDatasetCard } from './create-dataset-card'
import SearchInput from './search-input'
import { Pagination } from './ui/pagination'
import { datasetApi, type Dataset } from '@/lib/api'

interface DatasetGridProps {
    onCreateDataset: () => void
    onDatasetClick: (dataset: Dataset) => void
}

export function DatasetGrid({ onCreateDataset, onDatasetClick }: DatasetGridProps) {
    const [datasets, setDatasets] = useState<Dataset[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [pageSize] = useState(12) // Base page size

    // Search state
    const [searchQuery, setSearchQuery] = useState('')

    const loadDatasets = useCallback(async (page: number = 1, search: string = '') => {
        try {
            setIsLoading(true)
            setError(null)

            // Calculate actual page size: first page = pageSize - 1, others = pageSize
            const actualPageSize = page === 1 ? pageSize - 1 : pageSize

            // Use search endpoint if there's a search query, otherwise use regular getAll
            const response = search.trim()
                ? await datasetApi.searchDatasets({
                    q: search.trim(),
                    page,
                    limit: actualPageSize,
                    sort: 'createdAt,DESC'
                })
                : await datasetApi.getAll({
                    page,
                    limit: actualPageSize,
                    sort: 'createdAt,DESC'
                })

            setDatasets(response.data)
            setTotalPages(response.pageCount)
            setTotalCount(response.total)
            setCurrentPage(page)
        } catch (err) {
            console.error('Failed to load datasets:', err)
            setError('Failed to load datasets. Please try again.')
            setDatasets([])
        } finally {
            setIsLoading(false)
        }
    }, [pageSize])

    // Load datasets on mount and when search query changes
    useEffect(() => {
        loadDatasets(currentPage, searchQuery)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, searchQuery])

    // Handle search input change
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query)
        setCurrentPage(1) // Reset to first page when searching
    }, [])

    // Handle search clear
    const handleClearSearch = useCallback(() => {
        setSearchQuery('')
        setCurrentPage(1)
    }, [])

    // Handle page change
    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page)
    }, [])

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
            // Update total count to reflect deletion
            setTotalCount(prev => Math.max(0, prev - 1))
        } catch (err) {
            console.error('Failed to delete dataset:', err)
            throw err
        }
    }

    if (isLoading && datasets.length === 0) {
        return (
            <div className="space-y-6">
                {/* Search placeholder */}
                <div className="animate-pulse">
                    <div className="h-10 bg-gray-200 rounded-lg"></div>
                </div>

                {/* Grid placeholder */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="animate-pulse">
                            <div className="bg-gray-200 rounded-lg h-48"></div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error}</p>
                <button
                    onClick={() => loadDatasets(currentPage, searchQuery)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    Try Again
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Search Section */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                    <SearchInput
                        onSearch={handleSearch}
                        onClear={handleClearSearch}
                        isLoading={isLoading}
                        hasResults={datasets.length > 0}
                        placeholder="Search datasets by name..."
                        enableInstantSearch={true}
                        debounceMs={500}
                    />
                </div>

                {/* Results count */}
                <div className="text-sm text-gray-600">
                    {searchQuery ? (
                        <>
                            {totalCount} dataset{totalCount !== 1 ? 's' : ''} found
                            {totalCount > 0 && (
                                <span className="text-gray-400 ml-1">
                                    for &ldquo;{searchQuery}&rdquo;
                                </span>
                            )}
                        </>
                    ) : (
                        `${totalCount} dataset${totalCount !== 1 ? 's' : ''} total`
                    )}
                </div>
            </div>

            {/* Dataset Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Create new dataset card - only on first page */}
                {currentPage === 1 && (
                    <CreateDatasetCard onClick={onCreateDataset} />
                )}

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
                        {searchQuery ? (
                            <div>
                                <p>No datasets found matching &ldquo;{searchQuery}&rdquo;</p>
                                <button
                                    onClick={handleClearSearch}
                                    className="mt-2 text-blue-600 hover:text-blue-800 underline"
                                >
                                    Clear search
                                </button>
                            </div>
                        ) : (
                            <p>No datasets found. Create your first dataset to get started!</p>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center pt-6">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        isLoading={isLoading}
                    />
                </div>
            )}
        </div>
    )
}