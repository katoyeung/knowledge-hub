'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectProps {
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
    className?: string
}

interface SelectTriggerProps {
    className?: string
    children: React.ReactNode
}

interface SelectContentProps {
    className?: string
    children: React.ReactNode
}

interface SelectItemProps {
    value: string
    className?: string
    children: React.ReactNode
}

interface SelectValueProps {
    placeholder?: string
}

const SelectContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
    open: boolean
    setOpen: (open: boolean) => void
    triggerRef: React.RefObject<HTMLButtonElement | null>
    disabled?: boolean
}>({
    open: false,
    setOpen: () => { },
    triggerRef: React.createRef<HTMLButtonElement | null>(),
    disabled: false
})

export function Select({ value, onValueChange, disabled, children, className }: SelectProps) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }

        if (open) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [open])

    return (
        <SelectContext.Provider value={{ value, onValueChange, open, setOpen, triggerRef, disabled }}>
            <div className={cn('relative', className)}>
                {children}
            </div>
        </SelectContext.Provider>
    )
}

export function SelectTrigger({ className, children }: SelectTriggerProps) {
    const { open, setOpen, triggerRef, disabled } = React.useContext(SelectContext)

    return (
        <button
            ref={triggerRef}
            type="button"
            className={cn(
                'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            onClick={() => setOpen(!open)}
            disabled={disabled}
        >
            {children}
            <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
    )
}

export function SelectValue({ placeholder }: SelectValueProps) {
    const { value } = React.useContext(SelectContext)

    return (
        <span className={cn(!value && 'text-muted-foreground')}>
            {value || placeholder}
        </span>
    )
}

export function SelectContent({ className, children }: SelectContentProps) {
    const { open } = React.useContext(SelectContext)

    if (!open) return null

    return (
        <div
            className={cn(
                'absolute top-full z-[9999] mt-1 w-full overflow-hidden rounded-md border bg-white text-gray-900 shadow-lg',
                className
            )}
            style={{ minWidth: '200px' }}
        >
            <div className="p-1">
                {children}
            </div>
        </div>
    )
}

export function SelectItem({ value, className, children }: SelectItemProps) {
    const { value: selectedValue, onValueChange, setOpen } = React.useContext(SelectContext)
    const isSelected = selectedValue === value

    return (
        <div
            className={cn(
                'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                isSelected && 'bg-accent text-accent-foreground',
                className
            )}
            onClick={() => {
                onValueChange?.(value)
                setOpen(false)
            }}
        >
            {isSelected && (
                <Check className="absolute left-2 h-4 w-4" />
            )}
            {children}
        </div>
    )
}
