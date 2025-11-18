'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postsApi, type Post } from '@/lib/api'
import { useToast } from '@/components/ui/simple-toast'
import { Loader2, Search, FileText } from 'lucide-react'

interface PostSelectorModalProps {
    open: boolean
    onClose: () => void
    onSelect: (post: Post) => void
}

export function PostSelectorModal({ open, onClose, onSelect }: PostSelectorModalProps) {
    const { error } = useToast()
    const [posts, setPosts] = useState<Post[]>([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedPost, setSelectedPost] = useState<Post | null>(null)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const limit = 20

    useEffect(() => {
        if (open) {
            loadPosts()
        } else {
            // Reset state when modal closes
            setPosts([])
            setSearchQuery('')
            setSelectedPost(null)
            setPage(1)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, page, searchQuery])

    const loadPosts = async () => {
        setLoading(true)
        try {
            const response = await postsApi.getAll({
                page,
                limit,
                ...(searchQuery ? { title: searchQuery } : {}),
            })
            setPosts(response.data || [])
            setTotal(response.total || 0)
        } catch (err) {
            console.error('Failed to load posts:', err)
            error('Failed to load posts')
        } finally {
            setLoading(false)
        }
    }

    const handleSelect = () => {
        if (selectedPost) {
            onSelect(selectedPost)
            onClose()
        }
    }

    const getPostTitle = (post: Post): string => {
        return post.meta?.thread_title || post.title || 'Untitled Post'
    }

    const getPostContent = (post: Post): string => {
        return post.meta?.post_message || post.meta?.content || post.title || 'No content'
    }

    const getPostPreview = (post: Post): string => {
        const content = getPostContent(post)
        return content.length > 100 ? content.substring(0, 100) + '...' : content
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Select a Post</DialogTitle>
                    <DialogDescription>
                        Choose a post to use its content in the prompt variable
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col space-y-4">
                    {/* Search */}
                    <div className="space-y-2">
                        <Label htmlFor="search">Search Posts</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                id="search"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    setPage(1)
                                }}
                                placeholder="Search posts by title or content..."
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Posts List */}
                    <div className="flex-1 overflow-y-auto border rounded-md">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            </div>
                        ) : posts.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                No posts found
                            </div>
                        ) : (
                            <div className="divide-y">
                                {posts.map((post) => (
                                    <div
                                        key={post.id}
                                        onClick={() => setSelectedPost(post)}
                                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selectedPost?.id === post.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <FileText className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-sm mb-1">
                                                    {getPostTitle(post)}
                                                </h4>
                                                <p className="text-sm text-gray-600 line-clamp-2">
                                                    {getPostPreview(post)}
                                                </p>
                                                {post.source && (
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Source: {post.source}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {total > limit && (
                        <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>
                                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} posts
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page * limit >= total || loading}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSelect}
                        disabled={!selectedPost}
                    >
                        Select Post
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

