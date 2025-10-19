'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    isLoading?: boolean
    className?: string
}

export function Pagination({
    currentPage,
    totalPages,
    onPageChange,
    isLoading = false,
    className = ''
}: PaginationProps) {
    if (totalPages <= 1) {
        return null
    }

    const getVisiblePages = () => {
        const delta = 2
        const range = []
        const rangeWithDots = []

        for (
            let i = Math.max(2, currentPage - delta);
            i <= Math.min(totalPages - 1, currentPage + delta);
            i++
        ) {
            range.push(i)
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...')
        } else {
            rangeWithDots.push(1)
        }

        rangeWithDots.push(...range)

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages)
        } else if (totalPages > 1) {
            rangeWithDots.push(totalPages)
        }

        return rangeWithDots
    }

    const visiblePages = getVisiblePages()

    return (
        <div className={`flex items-center justify-between ${className}`}>
            <div className="flex items-center space-x-2">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                </button>

                <div className="flex space-x-1">
                    {visiblePages.map((page, index) => {
                        if (page === '...') {
                            return (
                                <span
                                    key={`ellipsis-${index}`}
                                    className="px-3 py-2 text-sm text-gray-500"
                                >
                                    ...
                                </span>
                            )
                        }

                        const pageNumber = page as number
                        const isCurrentPage = pageNumber === currentPage

                        return (
                            <button
                                key={pageNumber}
                                onClick={() => onPageChange(pageNumber)}
                                disabled={isLoading}
                                className={`px-3 py-2 text-sm font-medium rounded-md ${isCurrentPage
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {pageNumber}
                            </button>
                        )
                    })}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || isLoading}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                </button>
            </div>

            <div className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
            </div>
        </div>
    )
}
