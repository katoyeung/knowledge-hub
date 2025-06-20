'use client'

import React from 'react'
import { UnifiedDocumentWizard } from './unified-document-wizard'
import { type Dataset, type Document } from '@/lib/api'

interface DatasetCreateWizardProps {
    onComplete?: (dataset: Dataset) => void
    onClose?: () => void
}

export function DatasetCreateWizard({ onComplete, onClose }: DatasetCreateWizardProps) {
    const handleComplete = (result: { dataset: Dataset; documents: Document[] }) => {
        if (onComplete) {
            onComplete(result.dataset)
        }
    }

    return (
        <UnifiedDocumentWizard
            mode="create-dataset"
            onComplete={handleComplete}
            onClose={onClose}
        />
    )
} 