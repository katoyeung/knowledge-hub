'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, LogOut } from 'lucide-react'
// import { Button } from '@/components/ui/simple-button'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

interface NavbarProps {
    onLogout: () => void
}

export function Navbar({ onLogout }: NavbarProps) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
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

                {/* Right side - User avatar and dropdown */}
                <div className="relative">
                    <button
                        className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-gray-100"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                            {getUserInitials(user.email)}
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>

                    {/* Dropdown menu */}
                    {isDropdownOpen && (
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

            {/* Overlay to close dropdown when clicking outside */}
            {isDropdownOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDropdownOpen(false)}
                />
            )}
        </nav>
    )
}
