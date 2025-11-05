'use client'

import React, { useState } from 'react'
import { Bot, User, Copy, Check, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { ChatMessage as ChatMessageType } from '@/lib/types/chat'

interface ChatMessageProps {
    message: ChatMessageType
    isLast?: boolean
    onRegenerate?: () => void
}

export function ChatMessage({
    message,
    isLast = false,
    onRegenerate,
}: ChatMessageProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy text: ', err)
        }
    }

    const formatTime = (date: string | Date) => {
        return new Date(date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const isUser = message.role === 'user'
    const isAssistant = message.role === 'assistant'
    const isFailed = message.status === 'failed'
    const isStreaming = message.status === 'streaming'
    const isThinking = message.content === 'Thinking...'

    return (
        <div className="space-y-3">
            <div
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
                {isAssistant && (
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                )}

                <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${isUser
                        ? 'bg-blue-600 text-white'
                        : isFailed
                            ? 'bg-red-50 text-red-900 border border-red-200'
                            : 'bg-gray-100 text-gray-900'
                        } overflow-hidden`}
                >
                    {isAssistant ? (
                        isThinking ? (
                            <div className="flex items-center gap-2 text-gray-600">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                                <span className="text-sm italic">Thinking...</span>
                            </div>
                        ) : (
                            <div className="prose prose-sm max-w-none break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        code({ inline, className, children, ...props }) {
                                            const match = /language-(\w+)/.exec(className || '')
                                            return !inline && match ? (
                                                <div className="w-full my-2" style={{ maxWidth: '100%' }}>
                                                    <SyntaxHighlighter
                                                        style={oneLight}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        className="rounded-md"
                                                        customStyle={{
                                                            margin: 0,
                                                            overflow: 'visible',
                                                            boxSizing: 'border-box',
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-word',
                                                            overflowWrap: 'anywhere',
                                                        }}
                                                        codeTagProps={{
                                                            style: {
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                                overflowWrap: 'anywhere',
                                                                display: 'block',
                                                            }
                                                        }}
                                                        {...props}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                </div>
                                            ) : (
                                                <code className={`${className} break-words`} {...props}>
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
                                    {message.content}
                                </ReactMarkdown>
                                {isStreaming && !isThinking && (
                                    <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
                                )}
                            </div>
                        )
                    ) : (
                        <p className="text-sm whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{message.content}</p>
                    )}

                    <div
                        className={`text-xs mt-2 flex items-center justify-between ${isUser ? 'text-blue-100' : 'text-gray-500'
                            }`}
                    >
                        <span>{formatTime(message.createdAt)}</span>
                        <div className="flex items-center gap-2">
                            {message.metadata?.model && (
                                <span className="text-xs opacity-75">
                                    {message.metadata.model}
                                </span>
                            )}
                            {isAssistant && (
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopy}
                                        className="h-6 w-6 p-0 hover:bg-gray-200"
                                    >
                                        {copied ? (
                                            <Check className="h-3 w-3" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                    {onRegenerate && isLast && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={onRegenerate}
                                            className="h-6 w-6 p-0 hover:bg-gray-200"
                                            title="Regenerate response"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {isUser && (
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-600" />
                    </div>
                )}
            </div>

            {/* Error message for failed messages */}
            {isFailed && (
                <div className="ml-11 text-sm text-red-600">
                    Failed to generate response. Please try again.
                </div>
            )}
        </div>
    )
}
