'use client'

import React, { useState, useEffect } from 'react'
import { Search, Loader2, AlertCircle, FileText, ChevronLeft, ChevronRight, X, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { datasetApi, DocumentSegment } from '@/lib/api'

interface SearchResult {
    id: string
    content: string
    similarity: number
    segment: DocumentSegment
    matchType: string
    scores: {
        bm25: number
        semantic: number
        reranker: number
        final: number
    }
}

interface DocumentSearchProps {
    documentId: string
    onSearchResults?: (results: SearchResult[]) => void
    onHighlightSegment?: (segmentId: string) => void
    className?: string
}

type SearchMode = 'hybrid' | 'embedding' | 'keyword'

export function DocumentSearch({
    documentId,
    onSearchResults,
    onHighlightSegment,
    className = ""
}: DocumentSearchProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showResults, setShowResults] = useState(false)
    const [searchMode, setSearchMode] = useState<SearchMode>('hybrid')
    const [showSettings, setShowSettings] = useState(false)
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
    const [searchInfo, setSearchInfo] = useState<{
        count: number
        model?: string
        message?: string
        rerankerType?: string
    }>({ count: 0 })

    // Search configuration
    const [searchConfig, setSearchConfig] = useState({
        bm25Weight: 0.4,
        embeddingWeight: 0.6,
        similarityThreshold: 0.3,
        limit: 20,
        rerankerType: 'mathematical' as 'mathematical' | 'ml-cross-encoder' | 'none'
    })

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!query.trim()) {
            setResults([])
            setShowResults(false)
            setCurrentMatchIndex(0)
            if (onSearchResults) {
                onSearchResults([])
            }
            return
        }

        setLoading(true)
        setError(null)

        try {
            const searchParams = {
                documentId: documentId,
                query: query.trim(),
                limit: searchConfig.limit,
                similarityThreshold: searchConfig.similarityThreshold,
                rerankerType: searchConfig.rerankerType,
                // Configure weights based on search mode
                ...(searchMode === 'hybrid' && {
                    bm25Weight: searchConfig.bm25Weight,
                    embeddingWeight: searchConfig.embeddingWeight
                }),
                ...(searchMode === 'embedding' && {
                    bm25Weight: 0,
                    embeddingWeight: 1
                }),
                ...(searchMode === 'keyword' && {
                    bm25Weight: 1,
                    embeddingWeight: 0
                })
            }

            const response = await datasetApi.search(searchParams)

            setResults(response.results)
            setSearchInfo({
                count: response.count,
                model: response.model,
                message: response.message,
                rerankerType: response.rerankerType
            })
            setShowResults(true)
            setCurrentMatchIndex(0)

            if (onSearchResults) {
                onSearchResults(response.results)
            }

            // Highlight first result if available
            if (response.results.length > 0 && onHighlightSegment) {
                onHighlightSegment(response.results[0].segment.id)
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } }
            setError(error.response?.data?.message || 'Search failed')
            setResults([])
            setShowResults(false)
            setCurrentMatchIndex(0)
        } finally {
            setLoading(false)
        }
    }

    const handleClearSearch = () => {
        setQuery('')
        setResults([])
        setShowResults(false)
        setError(null)
        setCurrentMatchIndex(0)
        setSearchInfo({ count: 0 })

        if (onSearchResults) {
            onSearchResults([])
        }
    }

    const navigateToMatch = (direction: 'next' | 'prev') => {
        if (results.length === 0) return

        const newIndex = direction === 'next'
            ? (currentMatchIndex + 1) % results.length
            : (currentMatchIndex - 1 + results.length) % results.length

        setCurrentMatchIndex(newIndex)

        if (onHighlightSegment) {
            onHighlightSegment(results[newIndex].segment.id)
        }
    }

    const formatSimilarity = (similarity: number, mode: SearchMode) => {
        // For keyword search, don't show similarity percentage as it's not meaningful
        if (mode === 'keyword') {
            return 'Match'
        }
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

    const getSearchModeDescription = (mode: SearchMode) => {
        switch (mode) {
            case 'hybrid':
                return 'Combines keyword and semantic search for best results'
            case 'embedding':
                return 'Semantic search using AI embeddings - finds similar meaning'
            case 'keyword':
                return 'Exact keyword matching - finds documents containing your search terms'
            default:
                return ''
        }
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Search Form */}
            <form onSubmit={handleSearch} className="space-y-3">
                <div className="flex gap-2">
                    {/* Search Mode Dropdown */}
                    <Select value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="hybrid">Hybrid</SelectItem>
                            <SelectItem value="embedding">Semantic</SelectItem>
                            <SelectItem value="keyword">Keyword</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search document content..."
                            className="pl-10 pr-10"
                            disabled={loading}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={handleClearSearch}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                disabled={loading}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSettings(!showSettings)}
                        className="px-3"
                    >
                        <Settings className="w-4 h-4" />
                    </Button>
                    <Button type="submit" disabled={loading || !query.trim()}>
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Search className="w-4 h-4" />
                        )}
                    </Button>
                </div>

                {/* Search Settings */}
                {showSettings && (
                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="bm25Weight" className="text-xs">BM25 Weight</Label>
                                <Input
                                    id="bm25Weight"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={searchConfig.bm25Weight}
                                    onChange={(e) => setSearchConfig(prev => ({
                                        ...prev,
                                        bm25Weight: parseFloat(e.target.value) || 0
                                    }))}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div>
                                <Label htmlFor="embeddingWeight" className="text-xs">Embedding Weight</Label>
                                <Input
                                    id="embeddingWeight"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={searchConfig.embeddingWeight}
                                    onChange={(e) => setSearchConfig(prev => ({
                                        ...prev,
                                        embeddingWeight: parseFloat(e.target.value) || 0
                                    }))}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="similarityThreshold" className="text-xs">Similarity Threshold</Label>
                                <Input
                                    id="similarityThreshold"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={searchConfig.similarityThreshold}
                                    onChange={(e) => setSearchConfig(prev => ({
                                        ...prev,
                                        similarityThreshold: parseFloat(e.target.value) || 0
                                    }))}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div>
                                <Label htmlFor="limit" className="text-xs">Result Limit</Label>
                                <Input
                                    id="limit"
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={searchConfig.limit}
                                    onChange={(e) => setSearchConfig(prev => ({
                                        ...prev,
                                        limit: parseInt(e.target.value) || 20
                                    }))}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Search Mode Description */}
                <p className="text-xs text-gray-500">
                    {getSearchModeDescription(searchMode)}
                </p>
            </form>

            {/* Search Info and Navigation */}
            {showResults && results.length > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-4">
                        <span>
                            Found {searchInfo.count} segments
                            {searchInfo.model && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                    {searchInfo.model}
                                </span>
                            )}
                        </span>
                        {results.length > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigateToMatch('prev')}
                                    className="h-6 w-6 p-0"
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <span className="text-xs">
                                    {currentMatchIndex + 1} of {results.length}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigateToMatch('next')}
                                    className="h-6 w-6 p-0"
                                >
                                    <ChevronRight className="w-3 h-3" />
                                </Button>
                            </div>
                        )}
                    </div>
                    <Button
                        onClick={handleClearSearch}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                    >
                        Clear Search
                    </Button>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Message Display */}
            {searchInfo.message && (
                <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{searchInfo.message}</span>
                </div>
            )}

            {/* Search Results */}
            {showResults && results.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {results.map((result, index) => (
                        <div
                            key={result.id}
                            className={`border rounded-lg p-3 transition-all ${index === currentMatchIndex
                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                : 'border-gray-200 hover:shadow-sm'
                                }`}
                            onClick={() => {
                                setCurrentMatchIndex(index)
                                if (onHighlightSegment) {
                                    onHighlightSegment(result.segment.id)
                                }
                            }}
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
                                    <span className={`text-xs px-2 py-1 rounded ${searchMode === 'keyword'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-green-100 text-green-800'
                                        }`}>
                                        {formatSimilarity(result.similarity, searchMode)} match
                                    </span>
                                    <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                                        {searchMode === 'keyword' ? 'Keyword' :
                                            searchMode === 'embedding' ? 'Semantic' :
                                                'Hybrid'}
                                    </span>
                                </div>
                            </div>

                            <div className="text-sm text-gray-700 leading-relaxed">
                                {highlightText(
                                    result.content.length > 200
                                        ? result.content.substring(0, 200) + '...'
                                        : result.content,
                                    query
                                )}
                            </div>

                            {/* Detailed Scores for Different Search Modes */}
                            {searchMode === 'hybrid' && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Scores: BM25: {result.scores.bm25.toFixed(3)},
                                    Semantic: {result.scores.semantic.toFixed(3)},
                                    Final: {result.scores.final.toFixed(3)}
                                </div>
                            )}
                            {searchMode === 'embedding' && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Semantic Similarity: {result.scores.semantic.toFixed(3)}
                                </div>
                            )}
                            {searchMode === 'keyword' && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Keyword Match (BM25): {result.scores.bm25.toFixed(3)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* No Results */}
            {showResults && results.length === 0 && !searchInfo.message && (
                <div className="text-center py-8 text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No segments found matching your search.</p>
                    <p className="text-sm mt-1">Try adjusting your search terms or search mode.</p>
                </div>
            )}
        </div>
    )
}
