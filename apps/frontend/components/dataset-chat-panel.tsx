'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Settings, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModelSelection } from '@/components/model-selection'
import { SourceChunksDisplay } from '@/components/source-chunks-display'
import { DocumentPreviewModal } from '@/components/document-preview-modal'
import { chatApi, documentApi, Document } from '@/lib/api'
import { ChatMessage, SourceChunk } from '@/lib/types/chat'

interface DatasetChatPanelProps {
    datasetId: string
    selectedDocumentId?: string
    selectedSegmentIds?: string[]
    datasetName?: string
}

export function DatasetChatPanel({
    datasetId,
    selectedDocumentId,
    selectedSegmentIds,
    datasetName: _datasetName
}: DatasetChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [conversationId, setConversationId] = useState<string | undefined>()
    const [sourceChunks, setSourceChunks] = useState<SourceChunk[]>([])
    const [selectedProvider, setSelectedProvider] = useState<string>('dashscope')
    const [selectedModel, setSelectedModel] = useState<string>('qwen-max-latest')
    const [showSettings, setShowSettings] = useState(false)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [loadingDocument, setLoadingDocument] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            content: inputValue.trim(),
            role: 'user',
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            const response = await chatApi.chatWithDocuments({
                message: inputValue.trim(),
                datasetId,
                documentIds: selectedDocumentId ? [selectedDocumentId] : undefined,
                segmentIds: selectedSegmentIds,
                llmProvider: selectedProvider,
                model: selectedModel,
                conversationId,
                maxChunks: 10,
                temperature: 0.7
            })

            // Update conversation ID if this is a new conversation
            if (!conversationId) {
                setConversationId(response.conversationId)
            }

            // Add assistant message
            setMessages(prev => [...prev, {
                ...response.message,
                role: response.message.role as 'user' | 'assistant' | 'system',
                status: response.message.status as 'pending' | 'completed' | 'failed'
            }])

            // Update source chunks
            setSourceChunks(response.sourceChunks)

        } catch (error) {
            console.error('Failed to send message:', error)
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                content: 'Sorry, I encountered an error. Please try again.',
                role: 'assistant',
                status: 'failed',
                createdAt: new Date(),
                updatedAt: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const handleViewDocument = async (documentId: string) => {
        setLoadingDocument(true)
        try {
            const document = await documentApi.getById(documentId)
            setPreviewDocument(document)
            setShowPreview(true)
        } catch (error) {
            console.error('Failed to fetch document:', error)
            // You could add a toast notification here
        } finally {
            setLoadingDocument(false)
        }
    }

    const handleClosePreview = () => {
        setShowPreview(false)
        setPreviewDocument(null)
    }

    return (
        <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
            {/* Header */}
            <div className="h-16 px-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                        Chat
                    </h2>
                    {selectedDocumentId && (
                        <p className="text-sm text-gray-500">Chatting with selected document</p>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(!showSettings)}
                    className="text-gray-500 hover:text-gray-700"
                >
                    <Settings className="h-4 w-4" />
                </Button>
            </div>

            {/* Model Selection */}
            {showSettings && (
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <MessageSquare className="h-4 w-4" />
                            Model Configuration
                        </div>
                        <ModelSelection
                            selectedProvider={selectedProvider}
                            selectedModel={selectedModel}
                            onProviderChange={setSelectedProvider}
                            onModelChange={setSelectedModel}
                        />
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                        <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">Start a conversation</p>
                        <p className="text-sm">Ask questions about your dataset or selected document</p>
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div key={message.id} className="space-y-3">
                            <div
                                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {message.role === 'assistant' && (
                                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                        <Bot className="h-4 w-4 text-blue-600" />
                                    </div>
                                )}

                                <div
                                    className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-900'
                                        }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                    <div className={`text-xs mt-1 flex items-center justify-between ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                                        }`}>
                                        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                                        {message.metadata?.model && (
                                            <span className="text-xs opacity-75">
                                                {message.metadata.model}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {message.role === 'user' && (
                                    <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                        <User className="h-4 w-4 text-gray-600" />
                                    </div>
                                )}
                            </div>

                            {/* Show source chunks for the last assistant message */}
                            {message.role === 'assistant' &&
                                index === messages.length - 1 &&
                                sourceChunks.length > 0 && (
                                    <div className="ml-11">
                                        <SourceChunksDisplay
                                            sourceChunks={sourceChunks}
                                            onViewDocument={handleViewDocument}
                                            loadingDocument={loadingDocument}
                                        />
                                    </div>
                                )}
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex gap-3 justify-start">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Bot className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="bg-gray-100 rounded-lg px-4 py-2">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask a question about your dataset..."
                        disabled={isLoading}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading}
                        size="sm"
                        className="px-4"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Document Preview Modal */}
            <DocumentPreviewModal
                document={previewDocument}
                isOpen={showPreview}
                onClose={handleClosePreview}
            />
        </div>
    )
}
