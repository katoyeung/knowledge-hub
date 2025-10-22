'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// Global state to track API calls across all component instances
const globalApiCallTracker = {
    userSettings: new Set<string>(),
    conversations: new Set<string>(),
}
import { Send, Bot, ChevronDown, Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SourceChunksDisplay } from '@/components/source-chunks-display'
import { DocumentPreviewModal } from '@/components/document-preview-modal'
import { ChatSettingsPopup } from '@/components/chat-settings-popup'
import { ChatMessage as ChatMessageComponent } from '@/components/chat-message'
import { chatApi, documentApi, datasetApi, userApi, Document, Dataset } from '@/lib/api'
import { ChatMessage, SourceChunk, Conversation, PaginatedMessagesResponse } from '@/lib/types/chat'
import { useToast } from '@/components/ui/simple-toast'
import { authUtil } from '@/lib/auth'

interface DatasetChatPanelProps {
    datasetId: string
    selectedDocumentId?: string
    selectedDocumentIds?: string[]
    selectedSegmentIds?: string[]
    datasetName?: string
    dataset?: Dataset
    requireDocumentSelection?: boolean
}

interface ChatSettings {
    provider?: string
    model?: string
    promptId?: string
    temperature?: number
    maxChunks?: number
    includeConversationHistory?: boolean
    conversationHistoryLimit?: number
}

export function DatasetChatPanel({
    datasetId,
    selectedDocumentId,
    selectedDocumentIds,
    selectedSegmentIds,
    datasetName: _datasetName, // eslint-disable-line @typescript-eslint/no-unused-vars
    dataset: propDataset,
    requireDocumentSelection = true
}: DatasetChatPanelProps) {
    const componentId = useRef(Math.random().toString(36).substr(2, 9))
    const { error } = useToast()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputValue, setInputValue] = useState('')
    const [conversationId, setConversationId] = useState<string | undefined>()
    const [sourceChunks, setSourceChunks] = useState<SourceChunk[]>([])
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [loadingDocument, setLoadingDocument] = useState(false)
    const [chatSettings, setChatSettings] = useState<ChatSettings>({})
    const [showScrollButton, setShowScrollButton] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [selectedProvider, setSelectedProvider] = useState<string>('dashscope')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [selectedModel, setSelectedModel] = useState<string>('qwen-max-latest')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [dataset, setDataset] = useState<Dataset | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [streamingMessage, setStreamingMessage] = useState<string>('')
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [hasMoreMessages, setHasMoreMessages] = useState(true)
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [isInitialLoad, setIsInitialLoad] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const hasLoadedConversationRef = useRef(false)
    const isLoadingConversationRef = useRef(false)
    const isLoadingMessagesRef = useRef(false)
    const isLoadingPaginationRef = useRef(false)
    const isLoadingUserSettingsRef = useRef(false)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)


    const scrollToBottomButton = useCallback(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
        }
    }, [])

    const checkAndLoadUserSettingsIfNeeded = useCallback(async (datasetData: Dataset) => {
        // Only load user settings if dataset doesn't have valid chat settings
        const hasValidDatasetSettings = datasetData?.settings?.chat_settings &&
            (datasetData.settings.chat_settings.provider ||
                datasetData.settings.chat_settings.model ||
                datasetData.settings.chat_settings.temperature !== undefined ||
                datasetData.settings.chat_settings.maxChunks !== undefined)

        if (!hasValidDatasetSettings) {
            // Call loadUserSettings directly to avoid circular dependency
            const callKey = `user-settings-${componentId.current}`
            if (globalApiCallTracker.userSettings.has(callKey)) {
                return
            }

            try {
                globalApiCallTracker.userSettings.add(callKey)
                isLoadingUserSettingsRef.current = true
                const user = authUtil.getUser()
                if (!user) return

                const userSettings = await userApi.getSettings(user.id)
                const userChatSettings = (userSettings as Record<string, unknown>)?.chat_settings

                if (userChatSettings && Object.keys(userChatSettings).length > 0) {
                    const settings = userChatSettings as Record<string, unknown>
                    setChatSettings(settings as ChatSettings)
                    // Update local state with saved settings
                    if (typeof settings.provider === 'string') {
                        setSelectedProvider(settings.provider)
                    }
                    if (typeof settings.model === 'string') {
                        setSelectedModel(settings.model)
                    }
                }
            } catch {
            } finally {
                isLoadingUserSettingsRef.current = false
            }
        }
    }, [])

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

            // Check if we need to load user settings as fallback
            await checkAndLoadUserSettingsIfNeeded(datasetData)
        } catch {
        }
    }, [datasetId, checkAndLoadUserSettingsIfNeeded])

    // Remove unused loadUserSettings function

    const loadConversationMessages = useCallback(async (conversationId: string, page: number, limit: number) => {
        // Prevent duplicate calls
        if (isLoadingMessagesRef.current) {
            return
        }

        try {
            isLoadingMessagesRef.current = true
            setIsLoadingHistory(true)
            const response: PaginatedMessagesResponse = await chatApi.getConversationMessagesPaginated(
                conversationId,
                page,
                limit
            )

            if (page === 1) {
                // First page - replace messages
                setMessages(response.messages)
            } else {
                // Subsequent pages - prepend older messages, ensuring no duplicates
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMessages = response.messages.filter(m => !existingIds.has(m.id))
                    return [...newMessages, ...prev]
                })
            }

            setCurrentPage(page)
            setHasMoreMessages(response.hasMore)
        } catch {
        } finally {
            isLoadingMessagesRef.current = false
            setIsLoadingHistory(false)
        }
    }, [])


    const loadMoreMessages = useCallback(async () => {
        if (!currentConversation || isLoadingHistory || !hasMoreMessages || isLoadingPaginationRef.current) {
            return
        }

        const nextPage = currentPage + 1

        try {
            isLoadingPaginationRef.current = true
            await loadConversationMessages(currentConversation.id, nextPage, 10)
        } finally {
            isLoadingPaginationRef.current = false
        }
    }, [currentConversation, currentPage, isLoadingHistory, hasMoreMessages, loadConversationMessages])

    const handleScroll = useCallback(() => {
        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

            setShowScrollButton(!isAtBottom)

            // Check if user scrolled near the top for infinite scroll
            if (scrollTop < 100 && hasMoreMessages && !isLoadingHistory) {
                // Clear any existing timeout
                if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current)
                }

                // Debounce the loadMoreMessages call
                scrollTimeoutRef.current = setTimeout(() => {
                    loadMoreMessages()
                }, 100) // 100ms debounce
            }
        }
    }, [hasMoreMessages, isLoadingHistory, loadMoreMessages])

    // Stay at bottom when streaming - no scroll animation
    useEffect(() => {
        if (isStreaming && streamingMessage) {
            // Immediately go to bottom without animation
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
        }
    }, [isStreaming, streamingMessage])

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

        // Check if we need to load user settings as fallback
        if (propDataset) {
            checkAndLoadUserSettingsIfNeeded(propDataset)
        }
    }, [datasetId, propDataset, loadDataset, checkAndLoadUserSettingsIfNeeded])

    // Load latest conversation for this dataset (separate effect to prevent duplicate calls)
    useEffect(() => {
        let isMounted = true
        let timeoutId: NodeJS.Timeout

        const loadConversation = async () => {
            // Reset conversation state when datasetId changes
            hasLoadedConversationRef.current = false
            isLoadingConversationRef.current = false
            isLoadingMessagesRef.current = false
            isLoadingPaginationRef.current = false
            isLoadingUserSettingsRef.current = false
            setCurrentConversation(null)
            setConversationId(undefined)
            setMessages([])
            setSourceChunks([])
            setCurrentPage(1)
            setHasMoreMessages(true)

            if (isMounted) {
                // Add a small delay to prevent rapid successive calls
                timeoutId = setTimeout(async () => {
                    if (isMounted) {
                        // Call loadLatestConversation directly here instead of using the callback
                        try {
                            // Prevent duplicate calls using global tracker
                            const callKey = `conversation-${datasetId}-${componentId.current}`
                            if (globalApiCallTracker.conversations.has(callKey)) {
                                return
                            }
                            globalApiCallTracker.conversations.add(callKey)
                            isLoadingConversationRef.current = true

                            const conversation = await chatApi.getLatestConversation(datasetId)
                            if (conversation && isMounted) {
                                setCurrentConversation(conversation)
                                setConversationId(conversation.id)
                                await loadConversationMessages(conversation.id, 1, 10)
                            }
                            hasLoadedConversationRef.current = true
                        } catch (err) {
                            console.warn('Failed to load latest conversation:', err)
                            // Don't show error to user for conversation loading - it's not critical
                        } finally {
                            if (isMounted) {
                                setIsInitialLoad(false)
                                isLoadingConversationRef.current = false
                            }
                        }
                    }
                }, 100)
            }
        }

        loadConversation()

        return () => {
            isMounted = false
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current)
            }
            // Clean up global tracker
            const callKey = `conversation-${datasetId}-${componentId.current}`
            globalApiCallTracker.conversations.delete(callKey)
        }
    }, [datasetId, loadConversationMessages]) // Add loadConversationMessages back since we use it directly

    // Just stay at bottom - no scrolling effects
    useEffect(() => {
        // Immediately go to bottom without any animation or delay
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
    }, [messages, currentConversation, datasetId])

    // Add scroll event listener
    useEffect(() => {
        const container = messagesContainerRef.current
        if (container) {
            container.addEventListener('scroll', handleScroll)
            return () => {
                container.removeEventListener('scroll', handleScroll)
                if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current)
                }
            }
        }
    }, [handleScroll])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading || isStreaming || (requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0))) return

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            content: inputValue.trim(),
            role: 'user',
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date()
        }


        setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            if (existingIds.has(userMessage.id)) {
                return prev // Don't add if already exists
            }
            return [...prev, userMessage]
        })
        const messageText = inputValue.trim()
        setInputValue('')
        setIsStreaming(true)
        setStreamingMessage('')

        try {
            // Use chat settings if available, otherwise fallback to defaults
            const settings = Object.keys(chatSettings).length > 0 ? chatSettings : {
                temperature: 0.7,
                maxChunks: 5,
                includeConversationHistory: true,
                conversationHistoryLimit: 10
            }

            await chatApi.chatWithDocumentsStream(
                {
                    message: messageText,
                    datasetId,
                    documentIds: selectedDocumentIds || [],
                    segmentIds: selectedSegmentIds,
                    conversationId,
                    maxChunks: settings.maxChunks || 5,
                    temperature: settings.temperature || 0.7,
                    includeConversationHistory: settings.includeConversationHistory,
                    conversationHistoryLimit: settings.conversationHistoryLimit
                },
                // onToken callback
                (token: string) => {
                    setStreamingMessage(prev => prev + token)
                },
                // onComplete callback
                (response) => {
                    // Update conversation ID if this is a new conversation
                    if (!conversationId) {
                        setConversationId(response.conversationId)
                        // Reset pagination state for new conversation
                        setCurrentPage(1)
                        setHasMoreMessages(true)
                    }


                    // Add the complete assistant message (check for duplicates)
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id))
                        if (existingIds.has(response.message.id)) {
                            return prev // Don't add if already exists
                        }
                        return [...prev, {
                            ...response.message,
                            role: response.message.role as 'user' | 'assistant' | 'system',
                            status: response.message.status as 'pending' | 'completed' | 'failed'
                        }]
                    })

                    // Update source chunks
                    setSourceChunks(response.sourceChunks)

                    // Clear streaming state
                    setStreamingMessage('')
                    setIsStreaming(false)
                },
                // onError callback
                (errorMsg: string) => {
                    console.error('Chat streaming error:', errorMsg)
                    error(`Chat failed: ${errorMsg}`)

                    // Add error message to chat
                    const errorMessage: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        content: `Sorry, I encountered an error: ${errorMsg}`,
                        role: 'assistant',
                        status: 'failed',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id))
                        if (existingIds.has(errorMessage.id)) {
                            return prev // Don't add if already exists
                        }
                        return [...prev, errorMessage]
                    })

                    // Reset streaming state
                    setStreamingMessage('')
                    setIsStreaming(false)

                    // Reset loading state to allow new submissions
                    setIsLoading(false)
                }
            )

        } catch (err) {
            console.error('Chat request failed:', err)
            error('Sorry, I encountered an error. Please try again.')

            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                content: 'Sorry, I encountered an error. Please try again.',
                role: 'assistant',
                status: 'failed',
                createdAt: new Date(),
                updatedAt: new Date()
            }
            setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id))
                if (existingIds.has(errorMessage.id)) {
                    return prev // Don't add if already exists
                }
                return [...prev, errorMessage]
            })

            // Reset all states to allow new submissions
            setStreamingMessage('')
            setIsStreaming(false)
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSendMessage()
        } else if (e.key === 'Enter' && !e.shiftKey) {
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
        } catch {
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
            setDataset((prev: Dataset | null) => prev ? {
                ...prev,
                settings: {
                    ...prev.settings,
                    chat_settings: newSettings
                }
            } : null)
        } catch (err) {
            throw err
        }
    }

    const handleRegenerateMessage = async (messageId: string) => {
        // Find the user message that preceded this assistant message
        const messageIndex = messages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return

        // Find the previous user message
        let userMessageIndex = -1
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMessageIndex = i
                break
            }
        }

        if (userMessageIndex === -1) return

        const userMessage = messages[userMessageIndex]

        // Remove the assistant message and all messages after it
        setMessages(prev => prev.slice(0, userMessageIndex + 1))

        // Set the input to the user message and trigger a new response
        setInputValue(userMessage.content)

        // Trigger a new message send
        setTimeout(() => {
            handleSendMessage()
        }, 100)
    }

    const handleNewChat = () => {
        // Clear current conversation and messages
        setCurrentConversation(null)
        setConversationId(undefined)
        setMessages([])
        setSourceChunks([])
        setCurrentPage(1)
        setHasMoreMessages(true)
        hasLoadedConversationRef.current = false // Reset to allow loading new conversation
        isLoadingConversationRef.current = false
        isLoadingMessagesRef.current = false
        isLoadingPaginationRef.current = false
        isLoadingUserSettingsRef.current = false
        setInputValue('')
    }

    return (
        <div className={`h-full flex flex-col bg-white border border-gray-200 rounded-lg ${requireDocumentSelection ? '' : 'min-h-0'
            }`}>
            {/* Header */}
            <div className="h-16 px-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                        Chat
                    </h2>
                    {currentConversation && (
                        <p className="text-sm text-gray-500">{currentConversation.title}</p>
                    )}
                    {selectedDocumentId && (
                        <p className="text-sm text-gray-500">Chatting with selected document</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNewChat}
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Chat
                    </Button>
                    <ChatSettingsPopup
                        datasetId={datasetId}
                        currentSettings={chatSettings}
                        onSettingsChange={handleChatSettingsChange}
                        onSaveSettings={handleSaveChatSettings}
                    />
                </div>
            </div>

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                className={`flex-1 overflow-y-auto p-4 space-y-4 min-h-0 ${requireDocumentSelection
                    ? 'max-h-[calc(100vh-16rem)]'
                    : 'max-h-[calc(100vh-8rem)] sm:max-h-[calc(100vh-12rem)] pb-20'
                    }`}
            >
                {/* Loading indicator for history */}
                {isLoadingHistory && (
                    <div className="flex justify-center py-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                            <span>Loading older messages...</span>
                        </div>
                    </div>
                )}

                {/* No more messages indicator */}
                {!hasMoreMessages && messages.length > 0 && (
                    <div className="flex justify-center py-2">
                        <span className="text-xs text-gray-400">No more messages</span>
                    </div>
                )}

                {isInitialLoad ? (
                    <div className="text-center text-gray-500 mt-8 px-4">
                        <div className="flex items-center justify-center space-x-2 mb-4">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                            <span>Loading conversation...</span>
                        </div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8 px-4">
                        <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">Start a conversation</p>
                        <p className="text-sm mb-6">Ask questions about your dataset or selected document</p>

                        {/* Example questions */}
                        <div className="space-y-2 max-w-md mx-auto">
                            <p className="text-xs text-gray-400 mb-3">Try asking:</p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setInputValue("What is this dataset about?")}
                                    className="block w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    &ldquo;What is this dataset about?&rdquo;
                                </button>
                                <button
                                    onClick={() => setInputValue("Summarize the key points")}
                                    className="block w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    &ldquo;Summarize the key points&rdquo;
                                </button>
                                <button
                                    onClick={() => setInputValue("Find information about...")}
                                    className="block w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    &ldquo;Find information about...&rdquo;
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div key={`${message.id}-${index}`}>
                            <ChatMessageComponent
                                message={message}
                                isLast={index === messages.length - 1}
                                onViewDocument={handleViewDocument}
                                loadingDocument={loadingDocument}
                                onRegenerate={message.role === 'assistant' ? () => handleRegenerateMessage(message.id) : undefined}
                            />

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

                {isStreaming && (
                    <div className="flex gap-3 justify-start">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Bot className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="bg-gray-100 rounded-lg px-4 py-2 max-w-[80%]">
                            {streamingMessage ? (
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                return !inline && match ? (
                                                    <SyntaxHighlighter
                                                        style={oneLight}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        className="rounded-md"
                                                        {...props}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                )
                                            },
                                            a({ href, children, ...props }) {
                                                return (
                                                    <a
                                                        href={href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                                        {...props}
                                                    >
                                                        [{children}]
                                                    </a>
                                                )
                                            },
                                        }}
                                    >
                                        {streamingMessage}
                                    </ReactMarkdown>
                                    <span className="inline-block w-2 h-4 bg-blue-600 ml-1 animate-pulse"></span>
                                </div>
                            ) : (
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Always keep this at the bottom for proper scrolling */}
                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom button */}
            {showScrollButton && (
                <div className="absolute bottom-20 right-6 z-20">
                    <button
                        onClick={scrollToBottomButton}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-lg transition-colors backdrop-blur-sm"
                        title="Scroll to bottom"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <div className="flex gap-2">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={
                            requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0)
                                ? "Select documents to start chatting..."
                                : "Ask a question about your dataset..."
                        }
                        disabled={isLoading || isStreaming || (requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0))}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading || isStreaming || (requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0))}
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
