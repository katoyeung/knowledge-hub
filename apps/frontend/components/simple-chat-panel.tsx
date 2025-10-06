'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SimpleChatPanelProps {
    datasetId: string
    selectedDocumentId?: string
    datasetName?: string
}

export function SimpleChatPanel({ datasetId, selectedDocumentId, datasetName }: SimpleChatPanelProps) {
    const [messages, setMessages] = useState<Array<{
        id: string
        type: 'user' | 'assistant'
        content: string
        timestamp: Date
    }>>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return

        const userMessage = {
            id: Date.now().toString(),
            type: 'user' as const,
            content: inputValue.trim(),
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000))

            const assistantMessage = {
                id: (Date.now() + 1).toString(),
                type: 'assistant' as const,
                content: `I understand you're asking about "${userMessage.content}". This is a test response for dataset: ${datasetId}`,
                timestamp: new Date()
            }

            setMessages(prev => [...prev, assistantMessage])
        } catch (error) {
            console.error('Failed to send message:', error)
            const errorMessage = {
                id: (Date.now() + 1).toString(),
                type: 'assistant' as const,
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date()
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

    return (
        <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
            {/* Header */}
            <div className="h-16 px-4 border-b border-gray-200 flex items-center">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                        Simple Chat Test
                    </h2>
                    {selectedDocumentId && (
                        <p className="text-sm text-gray-500">Chatting with selected document</p>
                    )}
                </div>
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
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.type === 'assistant' && (
                                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <Bot className="h-4 w-4 text-blue-600" />
                                </div>
                            )}

                            <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 ${message.type === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-900'
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                <p className={`text-xs mt-1 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                                    }`}>
                                    {message.timestamp.toLocaleTimeString()}
                                </p>
                            </div>

                            {message.type === 'user' && (
                                <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                    <User className="h-4 w-4 text-gray-600" />
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
        </div>
    )
}
