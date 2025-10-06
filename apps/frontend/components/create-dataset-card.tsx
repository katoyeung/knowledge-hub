'use client'

import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface CreateDatasetCardProps {
    onClick: () => void
}

export function CreateDatasetCard({ onClick }: CreateDatasetCardProps) {
    return (
        <Card
            className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
            onClick={onClick}
        >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px] p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                    <Plus className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Create New Dataset
                </h3>
                <p className="text-sm text-gray-600 text-center">
                    Start building your knowledge base with documents and AI-powered search
                </p>
            </CardContent>
        </Card>
    )
}
