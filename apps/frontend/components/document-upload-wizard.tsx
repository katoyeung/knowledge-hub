'use client'

import React from 'react'
import { UnifiedDocumentWizard } from './unified-document-wizard'
import { type Dataset, type Document } from '@/lib/api'

interface DocumentUploadWizardProps {
    dataset: Dataset
    onComplete?: (documents: Document[]) => void
    onClose?: () => void
}

export function DocumentUploadWizard({ dataset, onComplete, onClose }: DocumentUploadWizardProps) {
    const handleComplete = (result: { dataset: Dataset; documents: Document[] }) => {
        if (onComplete) {
            onComplete(result.documents)
        }
    }

    return (
        <UnifiedDocumentWizard
            mode="upload-documents"
            existingDataset={dataset}
            onComplete={handleComplete}
            onClose={onClose}
        />
    )
} 