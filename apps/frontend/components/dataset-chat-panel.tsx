'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { Send, Bot, ChevronDown, Plus } from 'lucide-react'
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

// Global state to track API calls across all component instances
const globalApiCallTracker = {
    userSettings: new Set<string>(),
    conversations: new Set<string>(),
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
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [hasMoreMessages, setHasMoreMessages] = useState(true)
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [isInitialLoad, setIsInitialLoad] = useState(true)
    const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]) // Messages loaded from history
    const [localInput, setLocalInput] = useState('') // Fallback input state
    const [streamingMessages, setStreamingMessages] = useState<ChatMessage[]>([]) // Messages from direct API streaming
    const [currentStreamingContent, setCurrentStreamingContent] = useState('') // Current streaming assistant message
    const [isWaitingForResponse, setIsWaitingForResponse] = useState(false) // Show thinking indicator
    const [userScrolledUp, setUserScrolledUp] = useState(false) // Track if user manually scrolled up
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const hasLoadedConversationRef = useRef(false)
    const isLoadingConversationRef = useRef(false)
    const isLoadingMessagesRef = useRef(false)
    const isLoadingPaginationRef = useRef(false)
    const isLoadingUserSettingsRef = useRef(false)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Convert AI SDK message to ChatMessage format
    const convertToChatMessage = (msg: { role: 'user' | 'assistant' | 'system'; content: string }, id?: string): ChatMessage => {
        return {
            id: id || Date.now().toString(),
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            role: msg.role === 'user' ? 'user' : 'assistant',
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    }

    // Use Vercel AI SDK's useChat hook
    const token = authUtil.getToken()
    const chatHook = useChat({
        // @ts-expect-error - api option exists but types may be outdated
        api: '/api/chat',
        headers: token ? {
            Authorization: `Bearer ${token}`,
        } : undefined,
        body: {
            datasetId,
            documentIds: selectedDocumentIds || [],
            segmentIds: selectedSegmentIds,
            maxChunks: chatSettings.maxChunks || 5,
            temperature: chatSettings.temperature || 0.7,
            conversationId: currentConversation?.id,
            includeConversationHistory: chatSettings.includeConversationHistory !== false,
            conversationHistoryLimit: chatSettings.conversationHistoryLimit || 10,
        },
        onFinish: async () => {
            // Try to fetch conversation metadata and source chunks after completion
            if (currentConversation?.id) {
                try {
                    const response: PaginatedMessagesResponse = await chatApi.getConversationMessagesPaginated(
                        currentConversation.id,
                        1,
                        1
                    )
                    if (response.messages.length > 0) {
                        // Extract source chunks if available (this might need API changes)
                        // For now, we'll leave source chunks empty and update when backend provides them
                    }
                } catch (err) {
                    console.warn('Failed to fetch message metadata:', err)
                }
            }
        },
        onError: (err: Error) => {
            console.error('Chat error:', err)
            error(`Chat failed: ${err.message}`)
        },
    })

    // Extract properties from the hook (using any due to type incompatibilities with AI SDK)
    // The useChat hook returns an object with methods directly on it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiMessages = (chatHook as any).messages || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookInput = (chatHook as any).input
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleInputChange = (chatHook as any).handleInputChange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setInput = (chatHook as any).setInput
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSubmitHook = (chatHook as any).handleSubmit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const append = (chatHook as any).append
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isStreaming = (chatHook as any).isLoading || false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatError = (chatHook as any).error as Error | null

    // Debug: Log hook structure to understand what's available
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('useChat hook keys:', Object.keys(chatHook))
            console.log('Available methods:', {
                handleSubmit: !!handleSubmitHook,
                append: !!append,
                setInput: !!setInput,
                handleInputChange: !!handleInputChange,
                input: hookInput,
            })
        }
    }, [chatHook, handleSubmitHook, append, setInput, handleInputChange, hookInput])

    // Use hook's input if available, otherwise use local state
    // This ensures the hook always has the current value for submission
    const input = hookInput !== undefined ? hookInput : localInput

    // Create a proper input change handler
    // Always update both hook and local state to keep them in sync
    const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value

        // Update local state (for immediate UI feedback)
        setLocalInput(value)

        // Update hook state (required for submission)
        if (handleInputChange) {
            handleInputChange(e)
        } else if (setInput) {
            setInput(value)
        }
    }, [handleInputChange, setInput])

    // Custom submit handler that uses the hook's submit
    const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        // Get the current input value (prioritize local state as it's most up-to-date)
        const currentInput = localInput.trim()

        if (!currentInput || isStreaming) {
            return
        }

        // CRITICAL: Ensure hook has the current input value before submitting
        // The hook's handleSubmit reads from hook.input, not from the event
        if (setInput) {
            setInput(currentInput)
        }

        // User sent a message, reset scroll state to allow auto-scroll and scroll to bottom
        setUserScrolledUp(false)

        // Immediately scroll to bottom when user sends a message
        setTimeout(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
        }, 100)

        // Try to submit using available methods
        // Priority: append (modern) > handleSubmit (legacy)
        if (append && typeof append === 'function') {
            // Use append method (modern way - preferred)
            try {
                setIsWaitingForResponse(true)
                append({
                    role: 'user',
                    content: currentInput,
                })
                setLocalInput('')
                // Clear thinking indicator when response starts (hook handles this)
                // We'll clear it when streaming starts or after a timeout
                setTimeout(() => {
                    if (isWaitingForResponse) {
                        setIsWaitingForResponse(false)
                    }
                }, 5000) // Clear after 5 seconds if no response
            } catch (err) {
                console.error('Append error:', err)
                setIsWaitingForResponse(false)
                error('Failed to send message. Please try again.')
            }
        } else if (handleSubmitHook && typeof handleSubmitHook === 'function') {
            // Use handleSubmit (legacy way)
            try {
                setIsWaitingForResponse(true)
                // Ensure hook has the input value
                if (setInput && hookInput !== currentInput) {
                    setInput(currentInput)
                }

                // Use requestAnimationFrame to ensure state is flushed
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        try {
                            // Create a proper synthetic form event
                            const form = e.currentTarget
                            const syntheticEvent = new Event('submit', {
                                bubbles: true,
                                cancelable: true,
                            }) as unknown as React.FormEvent<HTMLFormElement>

                            // Set up the event properties
                            Object.defineProperty(syntheticEvent, 'preventDefault', {
                                value: () => { },
                                writable: false,
                            })
                            Object.defineProperty(syntheticEvent, 'stopPropagation', {
                                value: () => { },
                                writable: false,
                            })
                            Object.defineProperty(syntheticEvent, 'currentTarget', {
                                value: form,
                                writable: false,
                            })
                            Object.defineProperty(syntheticEvent, 'target', {
                                value: form,
                                writable: false,
                            })

                            handleSubmitHook(syntheticEvent)
                            setLocalInput('')
                            // Clear thinking indicator when response starts (hook handles this)
                            setTimeout(() => {
                                if (isWaitingForResponse) {
                                    setIsWaitingForResponse(false)
                                }
                            }, 5000) // Clear after 5 seconds if no response
                        } catch (err) {
                            console.error('Submit error:', err)
                            setIsWaitingForResponse(false)
                            error('Failed to send message. Please try again.')
                        }
                    })
                })
            } catch (err) {
                console.error('Submit error:', err)
                setIsWaitingForResponse(false)
                error('Failed to send message. Please try again.')
            }
        } else {
            // No submit method available - use direct API call via /api/chat endpoint
            console.warn('useChat hook methods not available, using direct API call')
            console.warn('Hook keys:', Object.keys(chatHook))

            // Add user message to display immediately
            const userMessage: ChatMessage = {
                id: Date.now().toString(),
                content: currentInput,
                role: 'user',
                status: 'completed',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            setStreamingMessages(prev => [...prev, userMessage])

            // Call the Next.js API route that useChat would use
            const token = authUtil.getToken()
            if (!token) {
                error('Authentication required')
                return
            }

            // Reset streaming state and show thinking indicator
            setCurrentStreamingContent('')
            setIsWaitingForResponse(true)

            // Use the chatWithDocumentsStream API directly
            chatApi.chatWithDocumentsStream(
                {
                    message: currentInput,
                    datasetId,
                    documentIds: selectedDocumentIds || [],
                    segmentIds: selectedSegmentIds,
                    maxChunks: chatSettings.maxChunks || 5,
                    temperature: chatSettings.temperature || 0.7,
                    conversationId: currentConversation?.id,
                    includeConversationHistory: chatSettings.includeConversationHistory !== false,
                    conversationHistoryLimit: chatSettings.conversationHistoryLimit || 10,
                },
                (token: string) => {
                    // Handle streaming tokens - append to current streaming content
                    // Clear thinking indicator when first token arrives
                    setIsWaitingForResponse(false)
                    setCurrentStreamingContent(prev => prev + token)
                    // Auto-scroll to bottom as content streams
                    setTimeout(() => {
                        if (messagesContainerRef.current) {
                            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
                        }
                    }, 0)
                },
                (response) => {
                    // Handle completion - convert streaming message to completed message
                    const assistantMessage: ChatMessage = {
                        id: response.message.id || Date.now().toString(),
                        content: response.message.content || currentStreamingContent,
                        role: 'assistant',
                        status: 'completed',
                        createdAt: new Date(response.message.createdAt || Date.now()),
                        updatedAt: new Date(response.message.updatedAt || Date.now()),
                    }
                    setStreamingMessages(prev => [...prev, assistantMessage])
                    setCurrentStreamingContent('')

                    if (response.conversationId && !currentConversation) {
                        const user = authUtil.getUser()
                        setCurrentConversation({
                            id: response.conversationId,
                            title: currentInput.substring(0, 50),
                            datasetId,
                            userId: user?.id || '',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        })
                    }
                    if (response.sourceChunks && response.sourceChunks.length > 0) {
                        setSourceChunks(response.sourceChunks)
                    }
                },
                (errorMsg: string) => {
                    console.error('Streaming error:', errorMsg)
                    setCurrentStreamingContent('')
                    setIsWaitingForResponse(false)
                    error(`Chat failed: ${errorMsg}`)
                }
            ).catch((err) => {
                console.error('API call error:', err)
                setCurrentStreamingContent('')
                setIsWaitingForResponse(false)
                error('Failed to send message. Please try again.')
            })

            setLocalInput('')
        }
    }, [localInput, isStreaming, setInput, handleSubmitHook, append, hookInput, chatHook, error, datasetId, selectedDocumentIds, selectedSegmentIds, chatSettings, currentConversation])

    // Helper function to set input value programmatically
    const setInputValue = (value: string) => {
        setLocalInput(value)
        // Also sync with hook if available
        if (setInput) {
            setInput(value)
        } else if (handleInputChange) {
            handleInputChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>)
        }
    }

    // Convert AI SDK messages to ChatMessage format for display
    const displayMessages: ChatMessage[] = [
        ...historyMessages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...aiMessages.map((msg: any) => {
            const role = msg.role || 'assistant'
            const content = msg.content || msg.text || JSON.stringify(msg)
            return convertToChatMessage(
                {
                    role: role === 'user' ? 'user' : 'assistant',
                    content: typeof content === 'string' ? content : JSON.stringify(content),
                },
                msg.id
            )
        }),
        ...streamingMessages,
        // Add streaming content if it exists
        ...(currentStreamingContent ? [{
            id: 'streaming',
            content: currentStreamingContent,
            role: 'assistant' as const,
            status: 'streaming' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
        }] : []),
        // Add thinking indicator if waiting for response
        ...(isWaitingForResponse ? [{
            id: 'thinking',
            content: 'Thinking...',
            role: 'assistant' as const,
            status: 'streaming' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
        }] : []),
    ]

    const scrollToBottomButton = useCallback(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            setUserScrolledUp(false) // Reset scroll state when user clicks scroll to bottom
        }
    }, [])

    const checkAndLoadUserSettingsIfNeeded = useCallback(async (datasetData: Dataset) => {
        const hasValidDatasetSettings = datasetData?.settings?.chat_settings &&
            (datasetData.settings.chat_settings.provider ||
                datasetData.settings.chat_settings.model ||
                datasetData.settings.chat_settings.temperature !== undefined ||
                datasetData.settings.chat_settings.maxChunks !== undefined)

        if (!hasValidDatasetSettings) {
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

            if (datasetData.settings && datasetData.settings.chat_settings) {
                setChatSettings(datasetData.settings.chat_settings)
                if (datasetData.settings.chat_settings.provider) {
                    setSelectedProvider(datasetData.settings.chat_settings.provider)
                }
                if (datasetData.settings.chat_settings.model) {
                    setSelectedModel(datasetData.settings.chat_settings.model)
                }
            }

            await checkAndLoadUserSettingsIfNeeded(datasetData)
        } catch {
        }
    }, [datasetId, checkAndLoadUserSettingsIfNeeded])

    const loadConversationMessages = useCallback(async (conversationId: string, page: number, limit: number) => {
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
                setHistoryMessages(response.messages)
            } else {
                setHistoryMessages(prev => {
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
            // Track if user has scrolled up (not at bottom)
            setUserScrolledUp(!isAtBottom)

            if (scrollTop < 100 && hasMoreMessages && !isLoadingHistory) {
                if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current)
                }

                scrollTimeoutRef.current = setTimeout(() => {
                    loadMoreMessages()
                }, 100)
            }
        }
    }, [hasMoreMessages, isLoadingHistory, loadMoreMessages])

    // Stay at bottom when streaming - always auto-scroll during streaming
    useEffect(() => {
        if (isStreaming) {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
        }
    }, [isStreaming, aiMessages])

    // Also auto-scroll when streaming content changes
    useEffect(() => {
        if (currentStreamingContent && !userScrolledUp) {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
        }
    }, [currentStreamingContent, userScrolledUp])

    // Load dataset and chat settings on mount
    useEffect(() => {
        if (propDataset) {
            setDataset(propDataset)
            if (propDataset.settings && propDataset.settings.chat_settings) {
                setChatSettings(propDataset.settings.chat_settings)
                if (propDataset.settings.chat_settings.provider) {
                    setSelectedProvider(propDataset.settings.chat_settings.provider)
                }
                if (propDataset.settings.chat_settings.model) {
                    setSelectedModel(propDataset.settings.chat_settings.model)
                }
            }
        } else {
            loadDataset()
        }

        if (propDataset) {
            checkAndLoadUserSettingsIfNeeded(propDataset)
        }
    }, [datasetId, propDataset, loadDataset, checkAndLoadUserSettingsIfNeeded])

    // Load latest conversation for this dataset
    useEffect(() => {
        let isMounted = true
        let timeoutId: NodeJS.Timeout

        const loadConversation = async () => {
            hasLoadedConversationRef.current = false
            isLoadingConversationRef.current = false
            isLoadingMessagesRef.current = false
            isLoadingPaginationRef.current = false
            isLoadingUserSettingsRef.current = false
            setCurrentConversation(null)
            setHistoryMessages([])
            setSourceChunks([])
            setCurrentPage(1)
            setHasMoreMessages(true)

            if (isMounted) {
                timeoutId = setTimeout(async () => {
                    if (isMounted) {
                        try {
                            const callKey = `conversation-${datasetId}-${componentId.current}`
                            if (globalApiCallTracker.conversations.has(callKey)) {
                                return
                            }
                            globalApiCallTracker.conversations.add(callKey)
                            isLoadingConversationRef.current = true

                            const conversation = await chatApi.getLatestConversation(datasetId)
                            if (conversation && isMounted) {
                                setCurrentConversation(conversation)
                                await loadConversationMessages(conversation.id, 1, 10)
                            }
                            hasLoadedConversationRef.current = true
                        } catch (err) {
                            console.warn('Failed to load latest conversation:', err)
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
            const callKey = `conversation-${datasetId}-${componentId.current}`
            globalApiCallTracker.conversations.delete(callKey)
        }
    }, [datasetId, loadConversationMessages])

    // Scroll to bottom when messages change, but only if:
    // 1. User hasn't manually scrolled up, OR
    // 2. It's a new conversation/initial load, OR
    // 3. A new message was just added (user sent a message)
    useEffect(() => {
        if (messagesContainerRef.current && !userScrolledUp) {
            // Only auto-scroll if user is already near the bottom or it's initial load
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

            if (isNearBottom || isInitialLoad) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
        }
    }, [displayMessages, currentConversation, datasetId, userScrolledUp, isInitialLoad])

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

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            const form = e.currentTarget.closest('form')
            if (form) {
                const formEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as React.FormEvent<HTMLFormElement>
                Object.defineProperty(formEvent, 'currentTarget', { value: form })
                handleSubmit(formEvent)
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            const form = e.currentTarget.closest('form')
            if (form) {
                const formEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as React.FormEvent<HTMLFormElement>
                Object.defineProperty(formEvent, 'currentTarget', { value: form })
                handleSubmit(formEvent)
            }
        }
    }, [handleSubmit])

    const handleViewDocument = async (documentId: string) => {
        setLoadingDocument(true)
        try {
            const document = await documentApi.getById(documentId)
            setPreviewDocument(document)
            setShowPreview(true)
        } catch {
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
        const messageIndex = displayMessages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return

        let userMessageIndex = -1
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (displayMessages[i].role === 'user') {
                userMessageIndex = i
                break
            }
        }

        if (userMessageIndex === -1) return

        const userMessage = displayMessages[userMessageIndex]

        // Reset to before this message and resubmit
        // This is complex with useChat - we might need to manage state manually here
        // For now, just set the input and let user resubmit
        setInputValue(userMessage.content)
    }

    const handleNewChat = () => {
        setCurrentConversation(null)
        setHistoryMessages([])
        setSourceChunks([])
        setCurrentPage(1)
        setHasMoreMessages(true)
        hasLoadedConversationRef.current = false
        isLoadingConversationRef.current = false
        isLoadingMessagesRef.current = false
        isLoadingPaginationRef.current = false
        isLoadingUserSettingsRef.current = false
        // Note: useChat doesn't have a direct reset method, so we'll need to handle this differently
        // For now, we'll just clear our local state
    }

    // Show error from chat
    useEffect(() => {
        if (chatError) {
            error(`Chat error: ${chatError.message}`)
        }
    }, [chatError, error])

    // Sync local input with hook input when hook clears it (after submit)
    useEffect(() => {
        if (hookInput === '' && localInput !== '') {
            setLocalInput('')
        } else if (hookInput && hookInput !== localInput && hookInput !== undefined) {
            // Sync local input to hook input (in case hook updates from elsewhere)
            setLocalInput(hookInput)
        }
    }, [hookInput, localInput])

    // Clear thinking indicator when hook starts receiving messages
    useEffect(() => {
        if (isWaitingForResponse && aiMessages.length > 0) {
            // Check if the last message is from assistant (response started)
            const lastMessage = aiMessages[aiMessages.length - 1]
            if (lastMessage && (lastMessage as any).role === 'assistant') {
                setIsWaitingForResponse(false)
            }
        }
    }, [aiMessages, isWaitingForResponse])

    return (
        <div className={`h-full flex flex-col bg-white border border-gray-200 rounded-lg ${requireDocumentSelection ? '' : 'min-h-0'}`}>
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
                        currentSettings={chatSettings}
                        onSettingsChange={handleChatSettingsChange}
                        onSaveSettings={handleSaveChatSettings}
                    />
                </div>
            </div>

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                className={`flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-h-0 relative ${requireDocumentSelection
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
                {!hasMoreMessages && displayMessages.length > 0 && (
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
                ) : displayMessages.length === 0 ? (
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
                    displayMessages.map((message, index) => (
                        <div key={`${message.id}-${index}`}>
                            <ChatMessageComponent
                                message={message}
                                isLast={index === displayMessages.length - 1}
                                onRegenerate={message.role === 'assistant' ? () => handleRegenerateMessage(message.id) : undefined}
                            />

                            {/* Show source chunks for the last assistant message */}
                            {message.role === 'assistant' &&
                                index === displayMessages.length - 1 &&
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

                {/* Always keep this at the bottom for proper scrolling */}
                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom button - centered inside chat box, above input */}
            {showScrollButton && (
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-20">
                    <button
                        onClick={scrollToBottomButton}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-lg transition-all backdrop-blur-sm hover:scale-105"
                        title="Scroll to bottom"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <Input
                        value={input}
                        onChange={onInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0)
                                ? "Select documents to start chatting..."
                                : "Ask a question about your dataset..."
                        }
                        disabled={!!isStreaming || (requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0))}
                        className="flex-1"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <Button
                        type="submit"
                        disabled={!input.trim() || !!isStreaming || (requireDocumentSelection && (!selectedDocumentIds || selectedDocumentIds.length === 0))}
                        size="sm"
                        className="px-4"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
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
