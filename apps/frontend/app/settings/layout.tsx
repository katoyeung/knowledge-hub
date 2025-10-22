'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bot, FileText, Settings, Menu, X, Network } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { AuthGuard } from '@/components/auth-guard'

interface SettingsLayoutProps {
    children: React.ReactNode
}

const menuItems = [
    {
        href: '/settings/ai-providers',
        label: 'AI Providers',
        icon: Bot,
    },
    {
        href: '/settings/prompts',
        label: 'Prompts',
        icon: FileText,
    },
    {
        href: '/settings/chat-settings',
        label: 'Chat Settings',
        icon: Settings,
    },
    {
        href: '/settings/graph-settings',
        label: 'Graph Settings',
        icon: Network,
    },
]

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    const handleLogout = () => {
        // The navbar handles the actual logout logic
    }

    return (
        <AuthGuard>
            <div className="min-h-screen bg-gray-50">
                <Navbar onLogout={handleLogout} />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
                        {/* Mobile menu button */}
                        <div className="lg:hidden">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                <Menu className="w-4 h-4 mr-2" />
                                Settings Menu
                                {isMobileMenuOpen ? (
                                    <X className="w-4 h-4 ml-2" />
                                ) : (
                                    <Menu className="w-4 h-4 ml-2" />
                                )}
                            </button>
                        </div>

                        {/* Left sidebar navigation */}
                        <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} lg:block w-full lg:w-64 lg:min-w-64`}>
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>
                                <nav className="space-y-1">
                                    {menuItems.map((item) => {
                                        const Icon = item.icon
                                        const isActive = pathname === item.href

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive
                                                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                                    }`}
                                            >
                                                <Icon className="w-4 h-4 mr-3" />
                                                {item.label}
                                            </Link>
                                        )
                                    })}
                                </nav>
                            </div>
                        </div>

                        {/* Main content area */}
                        <div className="flex-1 min-w-0">
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthGuard>
    )
}
