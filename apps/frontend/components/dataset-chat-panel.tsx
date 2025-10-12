'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SourceChunksDisplay } from '@/components/source-chunks-display'
import { DocumentPreviewModal } from '@/components/document-preview-modal'
import { ChatSettingsPopup } from '@/components/chat-settings-popup'
import { chatApi, documentApi, datasetApi, Document } from '@/lib/api'
import { ChatMessage, SourceChunk } from '@/lib/types/chat'
import { useToast } from '@/components/ui/simple-toast'

interface DatasetChatPanelProps {
    datasetId: string
    selectedDocumentId?: string
    selectedSegmentIds?: string[]
    datasetName?: string
    dataset?: any
}

interface ChatSettings {
    provider?: string
    model?: string
    promptId?: string
    temperature?: number
    maxChunks?: number
}

export function DatasetChatPanel({
    datasetId,
    selectedDocumentId,
    selectedSegmentIds,
    datasetName: _datasetName,
    dataset: propDataset
}: DatasetChatPanelProps) {
    const { success, error } = useToast()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [conversationId, setConversationId] = useState<string | undefined>()
    const [sourceChunks, setSourceChunks] = useState<SourceChunk[]>([])
    const [selectedProvider, setSelectedProvider] = useState<string>('dashscope')
    const [selectedModel, setSelectedModel] = useState<string>('qwen-max-latest')
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [loadingDocument, setLoadingDocument] = useState(false)
    const [chatSettings, setChatSettings] = useState<ChatSettings>({})
    const [dataset, setDataset] = useState<any>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const loadDataset = useCallback(async () => {
        try {
            const datasetData = await datasetApi.getById(datasetId)
            setDataset(datasetData)

            // Load chat settings from dataset
            if (datasetData.settings && datasetData.settings.chat_settings) {
                setChatSettings(datasetData.settings.chat_settings)
                // Update local state with saved settings
                if (datasetData.settings.chat_settings.provider) {
                    setSelectedProvider(datasetData.settings.chat_settings.provider)
                }
                if (datasetData.settings.chat_settings.model) {
                    setSelectedModel(datasetData.settings.chat_settings.model)
                }
            }
        } catch (err) {
            console.error('Failed to load dataset:', err)
        }
    }, [datasetId])

    // Load dataset and chat settings on mount
    useEffect(() => {
        if (propDataset) {
            // Use dataset passed as prop
            setDataset(propDataset)
            if (propDataset.settings && propDataset.settings.chat_settings) {
                setChatSettings(propDataset.settings.chat_settings)
                // Update local state with saved settings
                if (propDataset.settings.chat_settings.provider) {
                    setSelectedProvider(propDataset.settings.chat_settings.provider)
                }
                if (propDataset.settings.chat_settings.model) {
                    setSelectedModel(propDataset.settings.chat_settings.model)
                }
            }
        } else {
            // Fallback to fetching dataset if not provided as prop
            loadDataset()
        }
    }, [datasetId, propDataset, loadDataset])

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
            // Use chat settings if available, otherwise fallback to defaults
            const settings = chatSettings.provider ? chatSettings : {
                temperature: 0.7,
                maxChunks: 5
            }

            const response = await chatApi.chatWithDocuments({
                message: inputValue.trim(),
                datasetId,
                documentIds: selectedDocumentId ? [selectedDocumentId] : undefined,
                segmentIds: selectedSegmentIds,
                conversationId,
                maxChunks: settings.maxChunks || 5,
                temperature: settings.temperature || 0.7
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

    const handleChatSettingsChange = (newSettings: ChatSettings) => {
        setChatSettings(newSettings)
        // Update local state immediately for UI responsiveness
        if (newSettings.provider) {
            setSelectedProvider(newSettings.provider)
        }
        if (newSettings.model) {
            setSelectedModel(newSettings.model)
        }
    }

    const handleSaveChatSettings = async (newSettings: ChatSettings) => {
        try {
            await datasetApi.update(datasetId, {
                settings: {
                    chat_settings: newSettings
                }
            })
            setChatSettings(newSettings)
            setDataset((prev: any) => prev ? {
                ...prev,
                settings: {
                    ...prev.settings,
                    chat_settings: newSettings
                }
            } : null)
        } catch (err) {
            console.error('Failed to save chat settings:', err)
            throw err
        }
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
                <ChatSettingsPopup
                    datasetId={datasetId}
                    currentSettings={chatSettings}
                    onSettingsChange={handleChatSettingsChange}
                    onSaveSettings={handleSaveChatSettings}
                />
            </div>

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
