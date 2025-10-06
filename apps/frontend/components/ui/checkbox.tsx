'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    onCheckedChange?: (checked: boolean) => void
}

export function Checkbox({ className, onCheckedChange, onChange, ...props }: CheckboxProps) {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onCheckedChange?.(event.target.checked)
        onChange?.(event)
    }

    return (
        <input
            type="checkbox"
            className={cn(
                'h-4 w-4 rounded border border-input bg-background text-primary ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            onChange={handleChange}
            {...props}
        />
    )
}
