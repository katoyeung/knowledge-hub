'use client'

import { useState, useEffect } from 'react'
import { ToastProvider } from './simple-toast'

interface ToastProviderWrapperProps {
    children: React.ReactNode
}

/**
 * Client-only wrapper for ToastProvider that prevents SSR issues
 * by only rendering the provider after client-side hydration
 */
export function ToastProviderWrapper({ children }: ToastProviderWrapperProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // During SSR, render null or a minimal wrapper to prevent any rendering issues
    // This completely avoids rendering the ToastProvider during static generation
    if (!mounted) {
        // Return a fragment without any providers during SSR
        return <>{children}</>
    }

    // After hydration, render with ToastProvider
    return <ToastProvider>{children}</ToastProvider>
}

