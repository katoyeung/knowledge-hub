'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Check, ChevronDown, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SearchableSelectOption {
    id: string
    name: string
    description?: string
}

interface SearchableSelectProps {
    label?: string
    placeholder?: string
    value?: string
    options: SearchableSelectOption[]
    onChange: (value: string) => void
    disabled?: boolean
    loading?: boolean
    className?: string
}

export function SearchableSelect({
    label,
    placeholder = 'Search and select...',
    value,
    options,
    onChange,
    disabled = false,
    loading = false,
    className = ''
}: SearchableSelectProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [showDropdown, setShowDropdown] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Set search query to selected option name when value changes
    useEffect(() => {
        if (value) {
            const selectedOption = options.find(opt => opt.id === value)
            if (selectedOption) {
                setSearchQuery(selectedOption.name)
            }
        } else {
            setSearchQuery('')
        }
    }, [value, options])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current && !inputRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
                setHighlightedIndex(-1)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Filter options based on search query
    const filteredOptions = options.filter(option => {
        if (!searchQuery.trim()) return true
        const query = searchQuery.toLowerCase()
        return (
            option.name.toLowerCase().includes(query) ||
            option.description?.toLowerCase().includes(query)
        )
    })

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value
        setSearchQuery(query)
        setShowDropdown(true)
        setHighlightedIndex(-1)
    }

    const handleInputFocus = () => {
        setShowDropdown(true)
    }

    const handleSelectOption = (option: SearchableSelectOption) => {
        onChange(option.id)
        setSearchQuery(option.name)
        setShowDropdown(false)
        setHighlightedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || filteredOptions.length === 0) return

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                )
                break
            case 'ArrowUp':
                e.preventDefault()
                setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
                break
            case 'Enter':
                e.preventDefault()
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleSelectOption(filteredOptions[highlightedIndex])
                }
                break
            case 'Escape':
                setShowDropdown(false)
                setHighlightedIndex(-1)
                break
        }
    }

    return (
        <div className={`space-y-2 ${className}`}>
            {label && <Label>{label}</Label>}
            <div className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={handleInputChange}
                        onFocus={handleInputFocus}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled || loading}
                        className="pl-10 pr-10"
                    />
                    {loading && (
                        <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                    )}
                    {searchQuery && !loading && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('')
                                setShowDropdown(false)
                                onChange('')
                            }}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    {!searchQuery && !loading && (
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    )}
                </div>

                {/* Dropdown */}
                {showDropdown && filteredOptions.length > 0 && (
                    <div
                        ref={dropdownRef}
                        className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                    >
                        {filteredOptions.map((option, index) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => handleSelectOption(option)}
                                className={`w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between ${index === highlightedIndex ? 'bg-gray-100' : ''
                                    } ${value === option.id ? 'bg-blue-50' : ''}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-gray-900 truncate">
                                        {option.name}
                                    </div>
                                    {option.description && (
                                        <div className="text-xs text-gray-500 truncate mt-0.5">
                                            {option.description}
                                        </div>
                                    )}
                                </div>
                                {value === option.id && (
                                    <Check className="h-4 w-4 text-blue-600 ml-2 flex-shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {showDropdown && searchQuery && filteredOptions.length === 0 && !loading && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 text-center text-sm text-gray-500">
                        No options found
                    </div>
                )}
            </div>
        </div>
    )
}
