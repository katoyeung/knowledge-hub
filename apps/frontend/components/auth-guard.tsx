'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authUtil } from '@/lib/auth'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
    children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const checkAuth = () => {
            const token = authUtil.getToken()
            const user = authUtil.getUser()

            if (token && user) {
                setIsAuthenticated(true)
            } else {
                // Clear any invalid auth data
                localStorage.removeItem('authToken')
                localStorage.removeItem('authUser')
                router.push('/login')
            }
            setIsLoading(false)
        }

        checkAuth()
    }, [router])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return null // Will redirect to login
    }

    return <>{children}</>
}
