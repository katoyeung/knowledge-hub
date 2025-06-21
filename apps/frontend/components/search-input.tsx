'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchInputProps {
    onSearch: (query: string) => void
    onClear: () => void
    isLoading?: boolean
    hasResults?: boolean
    placeholder?: string
    className?: string
    enableInstantSearch?: boolean
    debounceMs?: number
}

export default function SearchInput({
    onSearch,
    onClear,
    isLoading = false,
    hasResults = false,
    placeholder = "Search segments using semantic similarity...",
    className = "",
    enableInstantSearch = true,
    debounceMs = 800
}: SearchInputProps) {
    const [inputValue, setInputValue] = useState('')
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleClear = useCallback(() => {
        // Clear debounce timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current)
            debounceTimeoutRef.current = null
        }
        
        setInputValue('')
        onClear()
    }, [onClear])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setInputValue(value)

        // Clear existing timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current)
        }

        // Set up debounced instant search
        if (enableInstantSearch) {
            if (value.trim()) {
                // Start new timeout for search
                debounceTimeoutRef.current = setTimeout(() => {
                    onSearch(value.trim())
                }, debounceMs)
            } else {
                // Clear search immediately if input is empty
                onClear()
            }
        }
    }, [enableInstantSearch, debounceMs, onSearch, onClear])

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
            }
        }
    }, [])

    return (
        <div className={`mb-4 ${className}`}>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleChange}
                        placeholder={placeholder}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoading}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {isLoading && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        </div>
                    )}
                </div>
                {hasResults && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
                    >
                        <X className="h-4 w-4" />
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
} 