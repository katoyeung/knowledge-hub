'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Copy, Trash2, Key, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiKeyApi, type ApiKey, type ApiKeyCreateResponse } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { authUtil } from '@/lib/auth'
import type { AuthUser } from '@knowledge-hub/shared-types'

export default function ApiKeysPage() {
    const { success, error } = useToast()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showKeyModal, setShowKeyModal] = useState(false)
    const [newKeyName, setNewKeyName] = useState('')
    const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
    const [showFullKey, setShowFullKey] = useState(false)

    const loadApiKeys = useCallback(async () => {
        try {
            setLoading(true)
            const keys = await apiKeyApi.list()
            setApiKeys(keys)
        } catch (err) {
            error('Failed to load API keys')
            console.error('Error loading API keys:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        const currentUser = authUtil.getUser()
        setUser(currentUser)
    }, [])

    useEffect(() => {
        if (user) {
            loadApiKeys()
        }
    }, [user, loadApiKeys])

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) {
            error('Please enter a name for the API key')
            return
        }

        try {
            setCreating(true)
            const newKey = await apiKeyApi.create(newKeyName.trim())
            setCreatedKey(newKey)
            setShowCreateModal(false)
            setShowKeyModal(true)
            setNewKeyName('')
            await loadApiKeys()
            success('API key created successfully')
        } catch {
            error('Failed to create API key')
        } finally {
            setCreating(false)
        }
    }

    const handleDeleteKey = async (keyId: string) => {
        if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
            return
        }

        try {
            setDeleting(keyId)
            await apiKeyApi.delete(keyId)
            await loadApiKeys()
            success('API key deleted successfully')
        } catch {
            error('Failed to delete API key')
        } finally {
            setDeleting(null)
        }
    }

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            success('Copied to clipboard')
        } catch {
            error('Failed to copy to clipboard')
        }
    }

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (!user) {
        return null
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
                    <p className="text-gray-600">
                        Manage your API keys for programmatic access to the Knowledge Hub API
                    </p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create API Key
                </Button>
            </div>

            {/* Security Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
                    <div>
                        <h3 className="text-sm font-medium text-yellow-800">Security Notice</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                            API keys provide full access to your account. Keep them secure and never share them publicly.
                            You can only see the full key once when it&apos;s created.
                        </p>
                    </div>
                </div>
            </div>

            {/* API Keys List */}
            <div className="bg-white shadow rounded-lg">
                {loading ? (
                    <div className="p-6 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-500 mt-2">Loading API keys...</p>
                    </div>
                ) : apiKeys.length === 0 ? (
                    <div className="p-6 text-center">
                        <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No API keys</h3>
                        <p className="text-gray-500 mb-4">
                            Create your first API key to start using the Knowledge Hub API
                        </p>
                        <Button onClick={() => setShowCreateModal(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create API Key
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Key
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Last Used
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {apiKeys.map((key) => (
                                    <tr key={key.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{key.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <code className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                                                    {key.prefix}
                                                </code>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(key.prefix)}
                                                    className="ml-2 h-6 w-6 p-0"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDate(key.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteKey(key.id)}
                                                disabled={deleting === key.id}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                {deleting === key.id ? (
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create API Key Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create API Key</h2>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="keyName">Name</Label>
                                <Input
                                    id="keyName"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="e.g., My App API Key"
                                    className="mt-1"
                                />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowCreateModal(false)
                                        setNewKeyName('')
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={handleCreateKey} disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Key'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Show Created Key Modal */}
            {showKeyModal && createdKey && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Key Created</h2>
                        <div className="space-y-4">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <div className="flex items-start">
                                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
                                    <div>
                                        <h3 className="text-sm font-medium text-yellow-800">Important</h3>
                                        <p className="text-sm text-yellow-700 mt-1">
                                            This is the only time you&apos;ll see the full API key. Copy it now and store it securely.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <Label>API Key</Label>
                                <div className="mt-1 flex items-center space-x-2">
                                    <code className="flex-1 text-sm font-mono bg-gray-100 p-3 rounded border">
                                        {showFullKey ? createdKey.key : createdKey.prefix + '...'}
                                    </code>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowFullKey(!showFullKey)}
                                    >
                                        {showFullKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(createdKey.key)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={() => setShowKeyModal(false)}>
                                    I&apos;ve Saved the Key
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
