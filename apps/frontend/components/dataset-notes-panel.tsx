'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Check, X, StickyNote, Save, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
// import { Textarea } from '@/components/ui/textarea'

interface Note {
    id: string
    title: string
    content: string
    createdAt: Date
    updatedAt: Date
}

interface DatasetNotesPanelProps {
    datasetId: string
    onCollapse?: () => void
    showCollapseButton?: boolean
}

export function DatasetNotesPanel({ datasetId, onCollapse, showCollapseButton = true }: DatasetNotesPanelProps) {
    const [notes, setNotes] = useState<Note[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editContent, setEditContent] = useState('')
    const [showAddNote, setShowAddNote] = useState(false)
    const [newNoteTitle, setNewNoteTitle] = useState('')
    const [newNoteContent, setNewNoteContent] = useState('')

    useEffect(() => {
        loadNotes()
    }, [datasetId])

    const loadNotes = async () => {
        try {
            // TODO: Implement actual notes API
            // For now, load from localStorage
            const savedNotes = localStorage.getItem(`notes_${datasetId}`)
            if (savedNotes) {
                const parsedNotes = JSON.parse(savedNotes).map((note: any) => ({
                    ...note,
                    createdAt: new Date(note.createdAt),
                    updatedAt: new Date(note.updatedAt)
                }))
                setNotes(parsedNotes)
            }
        } catch (error) {
            console.error('Failed to load notes:', error)
        }
    }

    const saveNotes = (updatedNotes: Note[]) => {
        localStorage.setItem(`notes_${datasetId}`, JSON.stringify(updatedNotes))
        setNotes(updatedNotes)
    }

    const handleAddNote = () => {
        if (!newNoteTitle.trim() || !newNoteContent.trim()) return

        const newNote: Note = {
            id: Date.now().toString(),
            title: newNoteTitle.trim(),
            content: newNoteContent.trim(),
            createdAt: new Date(),
            updatedAt: new Date()
        }

        const updatedNotes = [newNote, ...notes]
        saveNotes(updatedNotes)
        setNewNoteTitle('')
        setNewNoteContent('')
        setShowAddNote(false)
    }

    const handleEdit = (note: Note) => {
        setEditingId(note.id)
        setEditTitle(note.title)
        setEditContent(note.content)
    }

    const handleSaveEdit = () => {
        if (!editTitle.trim() || !editContent.trim()) return

        const updatedNotes = notes.map(note =>
            note.id === editingId
                ? {
                    ...note,
                    title: editTitle.trim(),
                    content: editContent.trim(),
                    updatedAt: new Date()
                }
                : note
        )

        saveNotes(updatedNotes)
        setEditingId(null)
        setEditTitle('')
        setEditContent('')
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setEditTitle('')
        setEditContent('')
    }

    const handleDelete = (noteId: string) => {
        if (confirm('Are you sure you want to delete this note?')) {
            const updatedNotes = notes.filter(note => note.id !== noteId)
            saveNotes(updatedNotes)
        }
    }

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
            {/* Header */}
            <div className="h-16 px-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={() => setShowAddNote(true)}
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add Note
                    </Button>
                    {onCollapse && showCollapseButton && (
                        <button
                            onClick={onCollapse}
                            className="p-1 hover:bg-gray-100 rounded"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {showAddNote && (
                <div className="p-4 border-b border-gray-200 space-y-3">
                    <Input
                        placeholder="Note title"
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        className="text-sm"
                    />
                    <textarea
                        placeholder="Write your note..."
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={handleAddNote}
                            className="flex-1"
                            disabled={!newNoteTitle.trim() || !newNoteContent.trim()}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            Save Note
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setShowAddNote(false)
                                setNewNoteTitle('')
                                setNewNoteContent('')
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto">
                {notes.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                        <StickyNote className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-sm">No notes yet</p>
                        <p className="text-xs text-gray-400 mt-1">Add your first note to get started</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-2">
                        {notes.map((note) => (
                            <div
                                key={note.id}
                                className="group border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                            >
                                {editingId === note.id ? (
                                    <div className="space-y-2">
                                        <Input
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="text-sm font-medium"
                                            placeholder="Note title"
                                        />
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="Note content"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={handleSaveEdit}
                                                className="flex-1"
                                                disabled={!editTitle.trim() || !editContent.trim()}
                                            >
                                                <Check className="h-3 w-3 mr-1" />
                                                Save
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleCancelEdit}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="text-sm font-medium text-gray-900 line-clamp-1">
                                                {note.title}
                                            </h3>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(note)}
                                                    className="p-1 hover:bg-gray-200 rounded"
                                                >
                                                    <Edit2 className="h-3 w-3 text-gray-500" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(note.id)}
                                                    className="p-1 hover:bg-gray-200 rounded"
                                                >
                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-600 line-clamp-3 mb-2">
                                            {note.content}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatDate(note.updatedAt)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div >
    )
}
