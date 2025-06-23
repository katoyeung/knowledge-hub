"use client"

import React, { createContext, useContext, useState, useCallback } from 'react'
import { Toast, ToastTitle, ToastDescription } from './toast'

interface ToastOptions {
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info'
  duration?: number
}

interface ToastData extends ToastOptions {
  id: string
}

interface ToastContextType {
  toast: (options: ToastOptions) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: ToastData = {
      id,
      ...options
    }
    setToasts(prev => [...prev, newToast])
  }, [])

  const success = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'success' })
  }, [toast])

  const error = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'destructive' })
  }, [toast])

  const warning = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'warning' })
  }, [toast])

  const info = useCallback((title: string, description?: string) => {
    toast({ title, description, variant: 'info' })
  }, [toast])

  const contextValue: ToastContextType = {
    toast,
    success,
    error,
    warning,
    info
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
        {toasts.map((toastData) => (
          <Toast
            key={toastData.id}
            variant={toastData.variant}
            onClose={() => removeToast(toastData.id)}
            className="mb-2"
          >
            {toastData.title && <ToastTitle>{toastData.title}</ToastTitle>}
            {toastData.description && (
              <ToastDescription>{toastData.description}</ToastDescription>
            )}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  )
} 