'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    Plus,
    Database,
    LogOut,
    ChevronDown,
    User,
    Loader2
} from 'lucide-react'
import { datasetApi, type Dataset } from '@/lib/api'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface SidebarProps {
    onCreateDataset?: () => void
    onDatasetClick?: (dataset: Dataset) => void
    onLogout?: () => void
}

export function Sidebar({ onCreateDataset, onDatasetClick, onLogout }: SidebarProps) {
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [datasets, setDatasets] = useState<Dataset[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [user, setUser] = useState<AuthUser | null>(null)

    // Fetch user and datasets on component mount
    useEffect(() => {
        // Get current user
        const currentUser = authUtil.getUser()
        setUser(currentUser)

        const fetchDatasets = async () => {
            try {
                setLoading(true)
                setError(null)
                const response = await datasetApi.getAll({ limit: 10 })

                // Handle different possible response formats
                let datasetList: Dataset[] = []
                if (Array.isArray(response)) {
                    datasetList = response
                } else if (response?.data && Array.isArray(response.data)) {
                    datasetList = response.data
                } else if (response && Array.isArray(response)) {
                    datasetList = response
                } else {
                    console.warn('Unexpected API response format')
                }
                setDatasets(datasetList || [])
            } catch (err) {
                console.error('Failed to fetch datasets:', err)
                setError('Failed to load datasets')
                setDatasets([]) // Ensure always an array
            } finally {
                setLoading(false)
            }
        }

        fetchDatasets()
    }, [])

    // Get first 2 letters of email for avatar
    const getInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase()
    }

    const handleCreateDataset = () => {
        onCreateDataset?.()
    }

    const handleDatasetClick = (dataset: Dataset) => {
        onDatasetClick?.(dataset)
    }

    const handleLogout = async () => {
        setShowUserMenu(false)
        if (onLogout) {
            await onLogout()
        }
    }

    // Fallback user data
    const displayUser = user || { email: 'user@example.com' }

    return (
        <div className="w-80 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-50">
            {/* Logo Section */}
            <div className="p-6 border-b border-gray-200">
                <h1 className="text-2xl font-bold text-blue-600">Knowledge Hub</h1>
            </div>

            {/* Content Section */}
            <div className="flex-1 flex flex-col p-4 space-y-4">
                {/* Create Dataset Button */}
                <Button
                    onClick={handleCreateDataset}
                    className="w-full h-12 text-base font-medium bg-blue-600 hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-5 w-5" />
                    Create Dataset
                </Button>

                {/* Divider */}
                <div className="border-t border-gray-200 my-2"></div>

                {/* Dataset List */}
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        DATASETS
                    </h3>

                    <div className="space-y-1">
                        {loading && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                <span className="ml-2 text-sm text-gray-500">Loading...</span>
                            </div>
                        )}

                        {error && (
                            <div className="px-3 py-2">
                                <p className="text-sm text-red-500">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="text-xs text-blue-500 hover:text-blue-700 mt-1"
                                >
                                    Try again
                                </button>
                            </div>
                        )}

                        {!loading && !error && datasets && datasets.length > 0 && (
                            <>
                                {datasets.map((dataset: Dataset) => (
                                    <button
                                        key={dataset.id}
                                        onClick={() => handleDatasetClick(dataset)}
                                        className="w-full flex items-center p-3 rounded-lg transition-colors text-left group hover:bg-gray-100"
                                    >
                                        <Database className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                        <span
                                            className="text-sm truncate text-gray-700 group-hover:text-gray-900"
                                            title={dataset.name || 'Unnamed Dataset'}
                                        >
                                            {dataset.name || 'Unnamed Dataset'}
                                        </span>
                                    </button>
                                ))}
                            </>
                        )}

                        {!loading && !error && (!datasets || datasets.length === 0) && (
                            <p className="text-sm text-gray-500 px-3 py-2">
                                No datasets available
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* User Profile Section */}
            <div className="border-t border-gray-200 bg-gray-50">
                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-full p-4 flex items-center hover:bg-gray-100 transition-colors"
                    >
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                            {displayUser.email ? getInitials(displayUser.email) : <User className="h-5 w-5" />}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 text-left min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                                {displayUser.email}
                            </div>
                            <div className="text-xs text-gray-500">
                                {user ? 'Authenticated' : 'Demo Mode'}
                            </div>
                        </div>

                        {/* Dropdown Arrow */}
                        <ChevronDown
                            className={showUserMenu ? 'h-4 w-4 text-gray-400 transition-transform rotate-180' : 'h-4 w-4 text-gray-400 transition-transform'}
                        />
                    </button>

                    {/* Dropdown Menu */}
                    {showUserMenu && (
                        <div className="absolute bottom-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mb-1">
                            <button
                                onClick={handleLogout}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center rounded-lg"
                            >
                                <LogOut className="mr-3 h-4 w-4" />
                                {user ? 'Logout' : 'Go to Login'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
} 