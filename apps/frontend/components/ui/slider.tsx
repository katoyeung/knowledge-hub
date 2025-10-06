import React from 'react'

interface SliderProps {
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    className?: string
    disabled?: boolean
}

export const Slider: React.FC<SliderProps> = ({
    value,
    onChange,
    min = 0,
    max = 1,
    step = 0.1,
    className = '',
    disabled = false,
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseFloat(e.target.value)
        onChange(newValue)
    }

    const percentage = ((value - min) / (max - min)) * 100

    return (
        <div className={`relative ${className}`}>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb:appearance-none slider-thumb:h-4 slider-thumb:w-4 slider-thumb:rounded-full slider-thumb:bg-blue-600 slider-thumb:cursor-pointer slider-thumb:border-2 slider-thumb:border-white slider-thumb:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`
                }}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{min}</span>
                <span className="font-medium text-gray-700">{value.toFixed(1)}</span>
                <span>{max}</span>
            </div>
        </div>
    )
}

export default Slider 