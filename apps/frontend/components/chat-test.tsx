'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatasetChatPanel } from '@/components/dataset-chat-panel'

export function ChatTest() {
    const [showChat, setShowChat] = useState(false)
    const [datasetId] = useState('test-dataset-id')

    return (
        <div className="p-4 space-y-4">
            <h2 className="text-xl font-bold">Chat UI Test</h2>

            <div className="space-y-2">
                <Button onClick={() => setShowChat(!showChat)}>
                    {showChat ? 'Hide' : 'Show'} Chat Panel
                </Button>

                <p className="text-sm text-gray-600">
                    Dataset ID: {datasetId}
                </p>
            </div>

            {showChat && (
                <div className="h-96 border border-gray-200 rounded-lg">
                    <DatasetChatPanel
                        datasetId={datasetId}
                        datasetName="Test Dataset"
                    />
                </div>
            )}
        </div>
    )
}
