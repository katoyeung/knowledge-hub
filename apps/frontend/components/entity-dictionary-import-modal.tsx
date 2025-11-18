'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface EntityDictionaryImportModalProps {
    datasetId: string;
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: (result: { created: number; skipped: number; errors: string[] }) => void;
}

// This modal is kept for backward compatibility but is no longer used
// Export functionality has been moved to EntityDictionaryManager
export const EntityDictionaryImportModal: React.FC<EntityDictionaryImportModalProps> = ({
    datasetId: _datasetId,
    isOpen,
    onClose,
    onImportComplete: _onImportComplete,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">Export Entity Dictionary</h2>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="p-6">
                    <p className="text-muted-foreground">
                        Export functionality has been moved to the Entity Dictionary page.
                        Please use the Export button in the filters section.
                    </p>
                </div>
            </div>
        </div>
    );
};
