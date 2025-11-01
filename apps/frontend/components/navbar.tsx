'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, LogOut, Settings, Bot, FileText, Workflow, Key, Newspaper } from 'lucide-react'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface NavbarProps {
    onLogout: () => void
}

export function Navbar({ onLogout }: NavbarProps) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
    const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const currentUser = authUtil.getUser()
        setUser(currentUser)
    }, [])

    const handleLogout = async () => {
        try {
            await authUtil.logout()
            onLogout()
            router.push('/login')
        } catch (error) {
            console.error('Logout failed:', error)
            onLogout()
            router.push('/login')
        }
    }

    const getUserInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase()
    }

    const handleSettingsClick = (path: string) => {
        setIsSettingsDropdownOpen(false)
        router.push(path)
    }

    if (!user) {
        return null
    }

    return (
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                {/* Left side - App icon/name */}
                <div className="flex items-center">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                            KH
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Knowledge Hub</h1>
                    </Link>
                </div>

                {/* Center - Main navigation */}
                <div className="flex items-center space-x-6">
                    <Link
                        href="/workflows"
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <Workflow className="w-5 h-5 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Workflows</span>
                    </Link>
                    <Link
                        href="/posts"
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <Newspaper className="w-5 h-5 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Posts</span>
                    </Link>
                </div>

                {/* Right side - Settings and User dropdowns */}
                <div className="flex items-center space-x-4">
                    {/* Settings dropdown */}
                    <div className="relative">
                        <button
                            className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-gray-100"
                            onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                        >
                            <Settings className="w-5 h-5 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Settings</span>
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        </button>

                        {/* Settings dropdown menu */}
                        {isSettingsDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                                <div className="py-1">
                                    <button
                                        onClick={() => handleSettingsClick('/settings/ai-providers')}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <Bot className="w-4 h-4 mr-3" />
                                        AI Providers
                                    </button>
                                    <button
                                        onClick={() => handleSettingsClick('/settings/prompts')}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <FileText className="w-4 h-4 mr-3" />
                                        Prompts
                                    </button>
                                    <button
                                        onClick={() => handleSettingsClick('/settings/chat-settings')}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <Settings className="w-4 h-4 mr-3" />
                                        Chat Settings
                                    </button>
                                    <button
                                        onClick={() => handleSettingsClick('/settings/api-keys')}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <Key className="w-4 h-4 mr-3" />
                                        API Keys
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User dropdown */}
                    <div className="relative">
                        <button
                            className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-gray-100"
                            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                        >
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                {getUserInitials(user.email)}
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        </button>

                        {/* User dropdown menu */}
                        {isUserDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                            {getUserInitials(user.email)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{user.email}</p>
                                            <p className="text-xs text-gray-500">User</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="py-1">
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                        <LogOut className="w-4 h-4 mr-3" />
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Overlay to close dropdowns when clicking outside */}
            {(isUserDropdownOpen || isSettingsDropdownOpen) && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                        setIsUserDropdownOpen(false)
                        setIsSettingsDropdownOpen(false)
                    }}
                />
            )}
        </nav>
    )
}
