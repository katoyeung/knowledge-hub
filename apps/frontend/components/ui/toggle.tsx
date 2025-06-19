"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ToggleProps {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    size?: "sm" | "md" | "lg"
    className?: string
    label?: string
    description?: string
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
    ({ checked, onCheckedChange, disabled = false, size = "md", className, label, description, ...props }, ref) => {
        const sizeClasses = {
            sm: "h-4 w-7",
            md: "h-5 w-9",
            lg: "h-6 w-11"
        }

        const thumbSizeClasses = {
            sm: "h-3 w-3",
            md: "h-4 w-4",
            lg: "h-5 w-5"
        }

        const translateClasses = {
            sm: checked ? "translate-x-3" : "translate-x-0",
            md: checked ? "translate-x-4" : "translate-x-0",
            lg: checked ? "translate-x-5" : "translate-x-0"
        }

        const handleClick = () => {
            if (!disabled) {
                onCheckedChange(!checked)
            }
        }

        const toggleElement = (
            <button
                ref={ref}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={handleClick}
                className={cn(
                    "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                    sizeClasses[size],
                    checked
                        ? "bg-blue-600"
                        : "bg-gray-200",
                    disabled && "opacity-50 cursor-not-allowed",
                    className
                )}
                {...props}
            >
                <span
                    className={cn(
                        "pointer-events-none inline-block rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out",
                        thumbSizeClasses[size],
                        translateClasses[size]
                    )}
                />
            </button>
        )

        if (label || description) {
            return (
                <div className="flex items-center space-x-3">
                    {toggleElement}
                    <div className="flex flex-col">
                        {label && (
                            <span className={cn(
                                "text-sm font-medium text-gray-900",
                                disabled && "text-gray-500"
                            )}>
                                {label}
                            </span>
                        )}
                        {description && (
                            <span className="text-xs text-gray-500">
                                {description}
                            </span>
                        )}
                    </div>
                </div>
            )
        }

        return toggleElement
    }
)

Toggle.displayName = "Toggle"

export { Toggle } 