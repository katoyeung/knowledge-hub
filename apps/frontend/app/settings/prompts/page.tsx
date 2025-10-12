'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, FileText, Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { promptApi, type Prompt } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'

interface CreatePromptDto {
    name: string
    systemPrompt: string
    userPromptTemplate?: string
    description?: string
    jsonSchema?: object
    type: 'intention' | 'chat' | 'system' | 'custom'
    isGlobal: boolean
    isActive: boolean
}

function PromptsContent() {
    const { success, error } = useToast()
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
    const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage] = useState(20)

    const loadPrompts = useCallback(async () => {
        setLoading(true)
        try {
            const response = await promptApi.getAll()
            setPrompts(response.data || [])
        } catch (err) {
            console.error('Failed to load prompts:', err)
            error('Failed to Load', 'Could not load prompts')
        } finally {
            setLoading(false)
        }
    }, [error])

    useEffect(() => {
        loadPrompts()
    }, [loadPrompts])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await promptApi.create(formData)
            success('Prompt Added', `${formData.name} has been added successfully`)
            setShowCreateModal(false)
            setFormData({
                name: '',
                systemPrompt: '',
                userPromptTemplate: '',
                description: '',
                jsonSchema: undefined,
                type: 'chat',
                isGlobal: false,
                isActive: true,
            })
            loadPrompts()
        } catch (err) {
            console.error('Failed to create prompt:', err)
            error('Failed to Add', 'Could not add prompt')
        }
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingPrompt) return

        try {
            await promptApi.update(editingPrompt.id, formData)
            success('Prompt Updated', `${formData.name} has been updated successfully`)
            setShowCreateModal(false)
            setEditingPrompt(null)
            setFormData({
                name: '',
                systemPrompt: '',
                userPromptTemplate: '',
                description: '',
                jsonSchema: undefined,
                type: 'chat',
                isGlobal: false,
                isActive: true,
            })
            loadPrompts()
        } catch (err) {
            console.error('Failed to update prompt:', err)
            error('Failed to Update', 'Could not update prompt')
        }
    }

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this prompt?')) {
            try {
                await promptApi.remove(id)
                success('Prompt Deleted', 'Prompt has been deleted successfully')
                loadPrompts()
            } catch (err) {
                console.error('Failed to delete prompt:', err)
                error('Failed to Delete', 'Could not delete prompt')
            }
        }
    }

    const handleEditClick = (prompt: Prompt) => {
        setEditingPrompt(prompt)
        setFormData({
            name: prompt.name,
            systemPrompt: prompt.systemPrompt,
            userPromptTemplate: prompt.userPromptTemplate || '',
            description: prompt.description || '',
            jsonSchema: prompt.jsonSchema || undefined,
            type: prompt.type,
            isGlobal: prompt.isGlobal,
            isActive: prompt.isActive,
        })
        setShowCreateModal(true)
    }

    const togglePromptExpansion = (promptId: string) => {
        setExpandedPrompts(prev => {
            const newSet = new Set(prev)
            if (newSet.has(promptId)) {
                newSet.delete(promptId)
            } else {
                newSet.add(promptId)
            }
            return newSet
        })
    }

    const filteredPrompts = prompts.filter(prompt =>
        prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prompt.systemPrompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (prompt.userPromptTemplate && prompt.userPromptTemplate.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const totalPages = Math.ceil(filteredPrompts.length / itemsPerPage)
    const paginatedPrompts = filteredPrompts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )


    const promptTypes = [
        { value: 'intention', label: 'Intention' },
        { value: 'chat', label: 'Chat' },
        { value: 'system', label: 'System' },
        { value: 'custom', label: 'Custom' },
    ]

    const [formData, setFormData] = useState<CreatePromptDto>({
        name: '',
        systemPrompt: '',
        userPromptTemplate: '',
        description: '',
        jsonSchema: undefined,
        type: 'chat',
        isGlobal: false,
        isActive: true,
    })

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Loading prompts...</div>
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Prompts</h1>
                        <p className="text-gray-600">
                            Manage your AI prompts and templates
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Prompt
                    </button>
                </div>
            </div>

            {/* Search and Filter */}
            <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-auto flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setCurrentPage(1) // Reset to first page on search
                        }}
                        className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                </div>
                {searchQuery ? (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto justify-center"
                    >
                        Clear search
                    </button>
                ) : (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto justify-center"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Prompt
                    </button>
                )}
            </div>

            {/* Prompts List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-500">Loading prompts...</div>
                    </div>
                ) : prompts.length === 0 ? (
                    <div className="p-8 text-center">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="mt-2 text-lg font-medium text-gray-900">No Prompts</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Get started by adding your first prompt.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Prompt
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {paginatedPrompts.map((prompt) => (
                            <div key={prompt.id} className="p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => togglePromptExpansion(prompt.id)}
                                            className="mr-2 text-gray-500 hover:text-gray-700"
                                        >
                                            {expandedPrompts.has(prompt.id) ? (
                                                <ChevronDown className="w-5 h-5" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5" />
                                            )}
                                        </button>
                                        <FileText className="w-5 h-5 text-gray-400 mr-3" />
                                        <div>
                                            <h3 className="text-lg font-medium text-gray-900">{prompt.name}</h3>
                                            <div className="mt-1 flex items-center text-sm text-gray-500">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {prompt.type}
                                                </span>
                                                {prompt.isGlobal && (
                                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                        Global
                                                    </span>
                                                )}
                                                <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${prompt.isActive
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {prompt.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => handleEditClick(prompt)}
                                            className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(prompt.id)}
                                            className="inline-flex items-center p-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {expandedPrompts.has(prompt.id) && (
                                    <div className="mt-4 pl-8 border-l border-gray-200 space-y-3">
                                        {prompt.description && (
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">Description:</p>
                                                <p className="text-sm text-gray-600">{prompt.description}</p>
                                            </div>
                                        )}

                                        <div>
                                            <p className="text-sm font-medium text-gray-700">System Prompt:</p>
                                            <div className="bg-gray-50 p-3 rounded-md text-sm font-mono whitespace-pre-wrap">
                                                {prompt.systemPrompt}
                                            </div>
                                        </div>

                                        {prompt.userPromptTemplate && (
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">User Prompt Template:</p>
                                                <div className="bg-gray-50 p-3 rounded-md text-sm font-mono whitespace-pre-wrap">
                                                    {prompt.userPromptTemplate}
                                                </div>
                                            </div>
                                        )}

                                        {prompt.jsonSchema && (
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">JSON Schema:</p>
                                                <div className="bg-gray-50 p-3 rounded-md text-sm font-mono whitespace-pre-wrap">
                                                    {JSON.stringify(prompt.jsonSchema, null, 2)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPrompts.length)} of {filteredPrompts.length} prompts
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={goToPreviousPage}
                            disabled={currentPage === 1}
                            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </button>

                        <div className="flex space-x-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                                // Show first page, last page, current page, and pages around current page
                                const shouldShow =
                                    page === 1 ||
                                    page === totalPages ||
                                    (page >= currentPage - 1 && page <= currentPage + 1)

                                if (!shouldShow) {
                                    // Show ellipsis for gaps
                                    if (page === currentPage - 2 || page === currentPage + 2) {
                                        return (
                                            <span key={page} className="px-3 py-2 text-sm text-gray-500">
                                                ...
                                            </span>
                                        )
                                    }
                                    return null
                                }

                                return (
                                    <button
                                        key={page}
                                        onClick={() => goToPage(page)}
                                        className={`px-3 py-2 text-sm font-medium rounded-md ${page === currentPage
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            onClick={goToNextPage}
                            disabled={currentPage === totalPages}
                            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </button>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {(showCreateModal || editingPrompt) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">
                                {editingPrompt ? 'Edit Prompt' : 'Add Prompt'}
                            </h3>
                        </div>

                        <form onSubmit={editingPrompt ? handleUpdate : handleCreate} className="px-6 py-4">
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                        Prompt Name
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                                        Type
                                    </label>
                                    <select
                                        id="type"
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as CreatePromptDto['type'] })}
                                        required
                                    >
                                        {promptTypes.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        id="description"
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Optional description"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                                        System Prompt
                                    </label>
                                    <textarea
                                        id="systemPrompt"
                                        rows={6}
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={formData.systemPrompt}
                                        onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                                        required
                                        placeholder="Enter the system prompt..."
                                    />
                                </div>

                                <div>
                                    <label htmlFor="userPromptTemplate" className="block text-sm font-medium text-gray-700 mb-1">
                                        User Prompt Template (Optional)
                                    </label>
                                    <textarea
                                        id="userPromptTemplate"
                                        rows={4}
                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={formData.userPromptTemplate}
                                        onChange={(e) => setFormData({ ...formData, userPromptTemplate: e.target.value })}
                                        placeholder="Enter the user prompt template..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center">
                                        <input
                                            id="isGlobal"
                                            name="isGlobal"
                                            type="checkbox"
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            checked={formData.isGlobal}
                                            onChange={(e) => setFormData({ ...formData, isGlobal: e.target.checked })}
                                        />
                                        <label htmlFor="isGlobal" className="ml-2 block text-sm text-gray-900">
                                            Global
                                        </label>
                                    </div>
                                    <div className="flex items-center">
                                        <input
                                            id="isActive"
                                            name="isActive"
                                            type="checkbox"
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        />
                                        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                                            Active
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateModal(false)
                                        setEditingPrompt(null)
                                        setFormData({
                                            name: '',
                                            systemPrompt: '',
                                            userPromptTemplate: '',
                                            description: '',
                                            jsonSchema: undefined,
                                            type: 'chat',
                                            isGlobal: false,
                                            isActive: true,
                                        })
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    {editingPrompt ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function PromptsPage() {
    return <PromptsContent />
}