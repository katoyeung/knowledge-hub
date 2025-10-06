'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Search, Brain, FileText } from 'lucide-react'

interface RAGQueryTestProps {
    datasetId: string
}

interface QueryResult {
    query: string
    answer: string
    sourceChunks: Array<{
        content: string
        source: string
        similarity: number
    }>
    config: {
        llmProvider: string
        llmModel: string
        embeddingModel: string
    }
}

export function RAGQueryTest({ datasetId }: RAGQueryTestProps) {
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<QueryResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Pre-defined test queries
    const testQueries = [
        "Which wizard lived in Orthanc?",
        "What was the name of the inn in the village of Bree?",
        "Who married Aragorn?",
        "Which type of blade was Frodo stabbed with?",
        "What was Gollum's real name?",
        "What did Frodo see on the ring after Gandalf threw it into the fire?",
        "What was the full name of Pippin?",
        "What was Gandalf's sword's name?",
        "What food does Gollum like?",
        "Which eagle rescued Gandalf from the tower of Isengard?"
    ]

    const handleQuery = async () => {
        if (!query.trim()) return

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const response = await fetch('/api/langchain-rag/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    datasetId,
                    query: query.trim(),
                    llmProvider: 'local-direct',
                    llmModel: 'google/gemma-2-9b-it',
                    embeddingModel: 'BAAI/bge-m3',
                    numChunks: 5
                }),
            })

            const data = await response.json()

            if (data.success) {
                setResult(data.data)
            } else {
                setError(data.message || 'Query failed')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    const handleTestQuery = (testQuery: string) => {
        setQuery(testQuery)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Brain className="h-5 w-5 text-blue-600" />
                        <span>LangChain RAG Query Test</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="query">Ask a question about your documents:</Label>
                        <div className="flex space-x-2 mt-2">
                            <Input
                                id="query"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="e.g., Which wizard lived in Orthanc?"
                                onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
                                disabled={loading}
                            />
                            <Button
                                onClick={handleQuery}
                                disabled={loading || !query.trim()}
                                className="min-w-[100px]"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Asking...
                                    </>
                                ) : (
                                    <>
                                        <Search className="mr-2 h-4 w-4" />
                                        Ask
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Test Queries */}
                    <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Try these test queries:
                        </Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {testQueries.map((testQuery, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestQuery(testQuery)}
                                    disabled={loading}
                                    className="text-left justify-start h-auto p-2 text-xs"
                                >
                                    {testQuery}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Error Display */}
            {error && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="text-red-800">
                            <strong>Error:</strong> {error}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Result Display */}
            {result && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <FileText className="h-5 w-5 text-green-600" />
                            <span>Query Result</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium text-gray-700">Question:</Label>
                            <p className="mt-1 text-gray-900">{result.query}</p>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-gray-700">Answer:</Label>
                            <div className="mt-1 p-3 bg-gray-50 rounded border">
                                <p className="text-gray-900">{result.answer}</p>
                            </div>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-gray-700">
                                Sources ({result.sourceChunks.length} chunks found):
                            </Label>
                            <div className="mt-2 space-y-2">
                                {result.sourceChunks.map((chunk, index) => (
                                    <div key={index} className="p-3 bg-blue-50 rounded border border-blue-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-medium text-blue-800">
                                                {chunk.source}
                                            </span>
                                            <span className="text-xs text-blue-600">
                                                Similarity: {chunk.similarity.toFixed(3)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-blue-700 line-clamp-3">
                                            {chunk.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="text-xs text-gray-500">
                            <strong>Configuration:</strong> {result.config.llmProvider} / {result.config.llmModel} / {result.config.embeddingModel}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
