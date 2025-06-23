"use client"

import * as React from "react"
// Simple SVG icons instead of lucide-react to avoid dependency issues
const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const AlertCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const AlertTriangle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L5.232 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const Info = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const X = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

type ToastVariant = "default" | "destructive" | "success" | "warning" | "info"

interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant
  onClose?: () => void
}

interface ToastIconProps {
  variant?: ToastVariant
}

const cn = (...classes: (string | undefined)[]) => {
  return classes.filter(Boolean).join(' ')
}

const ToastIcon = ({ variant }: ToastIconProps) => {
  const iconClass = "h-5 w-5 flex-shrink-0"
  
  switch (variant) {
    case "success":
      return <CheckCircle className={cn(iconClass, "text-green-600")} />
    case "destructive":
      return <AlertCircle className={cn(iconClass, "text-red-600")} />
    case "warning":
      return <AlertTriangle className={cn(iconClass, "text-yellow-600")} />
    case "info":
      return <Info className={cn(iconClass, "text-blue-600")} />
    default:
      return <Info className={cn(iconClass, "text-gray-600")} />
  }
}

const getToastStyles = (variant: ToastVariant) => {
  const baseStyles = "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all animate-in slide-in-from-top-2"
  
  switch (variant) {
    case "destructive":
      return cn(baseStyles, "border-red-500 bg-red-50 text-red-900")
    case "success":
      return cn(baseStyles, "border-green-500 bg-green-50 text-green-900")
    case "warning":
      return cn(baseStyles, "border-yellow-500 bg-yellow-50 text-yellow-900")
    case "info":
      return cn(baseStyles, "border-blue-500 bg-blue-50 text-blue-900")
    default:
      return cn(baseStyles, "border-gray-200 bg-white text-gray-900")
  }
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant = "default", onClose, children, ...props }, ref) => {
    React.useEffect(() => {
      // Auto-dismiss after 5 seconds for success/info, longer for errors
      const timeout = variant === "destructive" || variant === "warning" ? 7000 : 5000
      const timer = setTimeout(() => {
        onClose?.()
      }, timeout)

      return () => clearTimeout(timer)
    }, [onClose, variant])

    return (
      <div
        ref={ref}
        className={cn(getToastStyles(variant), className)}
        {...props}
      >
        <div className="flex items-center space-x-3">
          <ToastIcon variant={variant} />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-600 focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
Toast.displayName = "Toast"

interface ToastTitleProps extends React.HTMLAttributes<HTMLDivElement> {}

const ToastTitle = React.forwardRef<HTMLDivElement, ToastTitleProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-sm font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
ToastTitle.displayName = "ToastTitle"

interface ToastDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}

const ToastDescription = React.forwardRef<HTMLDivElement, ToastDescriptionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-sm opacity-90 mt-1", className)}
      {...props}
    />
  )
)
ToastDescription.displayName = "ToastDescription"

export { Toast, ToastTitle, ToastDescription, type ToastProps, type ToastVariant } 