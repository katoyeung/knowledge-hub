'use client'

import React, { useState } from 'react'
import { Search, Loader2, AlertCircle, FileText } from 'lucide-react'
import { datasetApi, DocumentSegment } from '@/lib/api'

interface SearchResult {
    id: string
    content: string
    similarity: number
    segment: DocumentSegment
}

interface SegmentSearchProps {
    datasetId: string
    onSearchResults?: (results: SearchResult[]) => void
    placeholder?: string
    className?: string
}

export default function SegmentSearch({
    datasetId,
    onSearchResults,
    placeholder = "Search segments using semantic similarity...",
    className = ""
}: SegmentSearchProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showResults, setShowResults] = useState(false)
    const [searchInfo, setSearchInfo] = useState<{
        count: number
        model?: string
        message?: string
    }>({ count: 0 })

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!query.trim()) {
            setResults([])
            setShowResults(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await datasetApi.search({
                datasetId,
                query: query.trim(),
                limit: 20,
                similarityThreshold: 0.3
            })

            setResults(response.results)
            setSearchInfo({
                count: response.count,
                model: response.model,
                message: response.message
            })
            setShowResults(true)

            if (onSearchResults) {
                onSearchResults(response.results)
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Search failed')
            setResults([])
            setShowResults(false)
        } finally {
            setLoading(false)
        }
    }

    const handleClearSearch = () => {
        setQuery('')
        setResults([])
        setShowResults(false)
        setError(null)
        setSearchInfo({ count: 0 })

        if (onSearchResults) {
            onSearchResults([])
        }
    }

    const formatSimilarity = (similarity: number) => {
        return `${(similarity * 100).toFixed(1)}%`
    }

    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return text

        const regex = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        const parts = text.split(regex)

        return parts.map((part, index) =>
            regex.test(part) ? (
                <mark key={index} className="bg-yellow-200 px-1 rounded">
                    {part}
                </mark>
            ) : (
                part
            )
        )
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Search Form */}
            <form onSubmit={handleSearch} className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={placeholder}
                        className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        disabled={loading}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            disabled={loading}
                        >
                            ×
                        </button>
                    )}
                </div>

                {loading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                )}
            </form>

            {/* Search Info */}
            {showResults && (
                <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <div>
                        Found {searchInfo.count} segments
                        {searchInfo.model && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {searchInfo.model}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleClearSearch}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                        Clear Search
                    </button>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Message Display */}
            {searchInfo.message && (
                <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{searchInfo.message}</span>
                </div>
            )}

            {/* Search Results */}
            {showResults && results.length > 0 && (
                <div className="space-y-3">
                    <h3 className="font-medium text-gray-900">Search Results</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {results.map((result) => (
                            <div
                                key={result.id}
                                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        <span className="text-sm font-medium text-gray-900">
                                            Segment {result.segment.position}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            • {result.segment.wordCount} words
                                        </span>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                            {formatSimilarity(result.similarity)} match
                                        </span>
                                        <span className={`text-xs px-2 py-1 rounded ${result.segment.status === 'completed'
                                            ? 'bg-green-100 text-green-800'
                                            : result.segment.status === 'waiting'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-red-100 text-red-800'
                                            }`}>
                                            {result.segment.status}
                                        </span>
                                    </div>
                                </div>

                                <div className="text-sm text-gray-700 leading-relaxed">
                                    {highlightText(
                                        result.content.length > 300
                                            ? result.content.substring(0, 300) + '...'
                                            : result.content,
                                        query
                                    )}
                                </div>

                                {result.segment.document && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        From: {result.segment.document.name}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No Results */}
            {showResults && results.length === 0 && !searchInfo.message && (
                <div className="text-center py-8 text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No segments found matching your search.</p>
                    <p className="text-sm mt-1">Try adjusting your search terms or check if the dataset has been processed for embeddings.</p>
                </div>
            )}
        </div>
    )
} 