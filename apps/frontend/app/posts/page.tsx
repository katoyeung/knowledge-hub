'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, Filter, X, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { postsApi, Post, CreatePostDto } from '@/lib/api';
import { useToast } from '@/components/ui/simple-toast';

export default function PostsPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);

    // Filters state
    const [filters, setFilters] = useState({
        hash: '',
        provider: '',
        source: '',
        title: '',
        metaKey: '',
        metaValue: '',
    });

    // Dialog states
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);

    // Form state
    const [formData, setFormData] = useState<CreatePostDto>({
        hash: '',
        provider: '',
        source: '',
        title: '',
        meta: {},
    });

    // Store raw JSON string for editing (allows invalid JSON during typing)
    const [metaJsonString, setMetaJsonString] = useState<string>('');
    const [metaJsonError, setMetaJsonError] = useState<string | null>(null);

    // Load posts
    useEffect(() => {
        loadPosts();
    }, [page, filters]);

    const loadPosts = async () => {
        try {
            setLoading(true);
            const params: Record<string, string | number> = {
                page,
                limit: pageSize,
            };

            // Add filters if provided
            if (filters.hash) params.hash = filters.hash;
            if (filters.provider) params.provider = filters.provider;
            if (filters.source) params.source = filters.source;
            if (filters.title) params.title = filters.title;
            if (filters.metaKey) params.metaKey = filters.metaKey;
            if (filters.metaValue) params.metaValue = filters.metaValue;

            const response = await postsApi.getAll(params);
            setPosts(response.data || []);
            setTotal(response.total || 0);
        } catch (error: unknown) {
            console.error('Failed to load posts:', error);
            showError('Failed to load posts');
            setPosts([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (): Promise<void> => {
        try {
            // Validate and parse meta JSON
            const { meta, error } = parseMetaJson(metaJsonString);
            if (error) {
                showError(`Invalid JSON: ${error}`);
                return;
            }

            // Generate hash if not provided
            if (!formData.hash) {
                // Generate a simple hash from title + timestamp
                const content = formData.title || JSON.stringify(meta) || Date.now().toString();
                const timestamp = Date.now();
                // Simple hash-like string (not cryptographic, but unique)
                formData.hash = `gen_${btoa(content + timestamp).replace(/[^a-zA-Z0-9]/g, '').substring(0, 64)}`;
            }

            await postsApi.create({
                ...formData,
                meta,
            });
            success('Post created successfully');
            setCreateDialogOpen(false);
            resetForm();
            loadPosts();
        } catch (error: unknown) {
            console.error('Failed to create post:', error);
            const errorMessage =
                (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message ||
                'Failed to create post';
            showError(errorMessage);
        }
    };

    const handleUpdate = async (): Promise<void> => {
        if (!selectedPost) return;

        try {
            // Validate and parse meta JSON
            const { meta, error } = parseMetaJson(metaJsonString);
            if (error) {
                showError(`Invalid JSON: ${error}`);
                return;
            }

            await postsApi.update(selectedPost.id, {
                ...formData,
                meta,
            });
            success('Post updated successfully');
            setEditDialogOpen(false);
            resetForm();
            loadPosts();
        } catch (error: unknown) {
            console.error('Failed to update post:', error);
            const errorMessage =
                (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message ||
                'Failed to update post';
            showError(errorMessage);
        }
    };

    const handleDelete = async (): Promise<void> => {
        if (!selectedPost) return;

        try {
            await postsApi.delete(selectedPost.id);
            success('Post deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedPost(null);
            loadPosts();
        } catch (error: unknown) {
            console.error('Failed to delete post:', error);
            const errorMessage =
                (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message ||
                'Failed to delete post';
            showError(errorMessage);
        }
    };

    const handleEdit = (post: Post) => {
        setSelectedPost(post);
        const meta = post.meta || {};
        setFormData({
            hash: post.hash,
            provider: post.provider || '',
            source: post.source || '',
            title: post.title || '',
            meta,
        });
        // Initialize JSON string for editing
        setMetaJsonString(JSON.stringify(meta, null, 2));
        setMetaJsonError(null);
        setEditDialogOpen(true);
    };

    const handleDeleteClick = (post: Post) => {
        setSelectedPost(post);
        setDeleteDialogOpen(true);
    };

    const resetForm = () => {
        setFormData({
            hash: '',
            provider: '',
            source: '',
            title: '',
            meta: {},
        });
        setMetaJsonString('');
        setMetaJsonError(null);
        setSelectedPost(null);
    };

    // Validate and parse JSON string to meta object
    const parseMetaJson = (jsonString: string): { meta: Record<string, any>; error: string | null } => {
        if (!jsonString.trim()) {
            return { meta: {}, error: null };
        }
        try {
            const parsed = JSON.parse(jsonString);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return { meta: {}, error: 'Meta must be a JSON object' };
            }
            return { meta: parsed, error: null };
        } catch (err) {
            return { meta: {}, error: err instanceof Error ? err.message : 'Invalid JSON format' };
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1); // Reset to first page when filter changes
    };

    const clearFilters = () => {
        setFilters({
            hash: '',
            provider: '',
            source: '',
            title: '',
            metaKey: '',
            metaValue: '',
        });
        setPage(1);
    };

    const totalPages = Math.ceil(total / pageSize);
    const hasFilters = Object.values(filters).some((v) => v !== '');

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Button>
                </div>
                <h1 className="text-3xl font-bold mb-2">Posts</h1>
                <p className="text-muted-foreground">
                    Manage and view all posts with filtering and pagination
                </p>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            Filters
                        </CardTitle>
                        {hasFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                                <X className="h-4 w-4 mr-2" />
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="filter-hash">Hash</Label>
                            <Input
                                id="filter-hash"
                                placeholder="Search by hash"
                                value={filters.hash}
                                onChange={(e) => handleFilterChange('hash', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="filter-provider">Provider</Label>
                            <Input
                                id="filter-provider"
                                placeholder="Filter by provider"
                                value={filters.provider}
                                onChange={(e) => handleFilterChange('provider', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="filter-source">Source</Label>
                            <Input
                                id="filter-source"
                                placeholder="Filter by source"
                                value={filters.source}
                                onChange={(e) => handleFilterChange('source', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="filter-title">Title</Label>
                            <Input
                                id="filter-title"
                                placeholder="Search in title"
                                value={filters.title}
                                onChange={(e) => handleFilterChange('title', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="filter-meta-key">Meta Key</Label>
                            <Input
                                id="filter-meta-key"
                                placeholder="Meta key (e.g., site)"
                                value={filters.metaKey}
                                onChange={(e) => handleFilterChange('metaKey', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="filter-meta-value">Meta Value</Label>
                            <Input
                                id="filter-meta-value"
                                placeholder="Meta value"
                                value={filters.metaValue}
                                onChange={(e) => handleFilterChange('metaValue', e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Actions and Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Posts List</CardTitle>
                            <CardDescription>
                                {loading
                                    ? 'Loading...'
                                    : `Showing ${posts.length} of ${total} posts`}
                            </CardDescription>
                        </div>
                        <Button onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Post
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : posts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No posts found
                        </div>
                    ) : (
                        <>
                            <div className="rounded-md border">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Hash</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Title</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Provider</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Meta</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Created</th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {posts.map((post) => (
                                            <tr key={post.id} className="border-b transition-colors hover:bg-muted/50">
                                                <td className="p-4 align-middle font-mono text-xs">
                                                    {post.hash.substring(0, 12)}...
                                                </td>
                                                <td className="p-4 align-middle max-w-xs truncate">
                                                    {post.title || '-'}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {post.provider ? (
                                                        <Badge variant="outline">{post.provider}</Badge>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {post.source ? (
                                                        <Badge variant="secondary">{post.source}</Badge>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {post.meta && Object.keys(post.meta).length > 0 ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {Object.keys(post.meta).length} fields
                                                        </span>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle text-sm text-muted-foreground">
                                                    {new Date(post.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="p-4 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(post)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteClick(post)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                    <div className="text-sm text-muted-foreground">
                                        Page {page} of {totalPages}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Create Drawer */}
            {createDialogOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setCreateDialogOpen(false)}
                    />
                    {/* Drawer */}
                    <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl z-50 transform transition-transform border-l border-gray-200">
                        <div className="flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900">
                                        Create New Post
                                    </h2>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Hash will be auto-generated if not provided.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setCreateDialogOpen(false)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="create-hash">Hash *</Label>
                                    <Input
                                        id="create-hash"
                                        placeholder="Auto-generated if empty"
                                        value={formData.hash}
                                        onChange={(e) =>
                                            setFormData({ ...formData, hash: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="create-title">Title</Label>
                                    <Input
                                        id="create-title"
                                        placeholder="Post title"
                                        value={formData.title}
                                        onChange={(e) =>
                                            setFormData({ ...formData, title: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="create-provider">Provider</Label>
                                        <Input
                                            id="create-provider"
                                            placeholder="e.g., google api, lenx api"
                                            value={formData.provider}
                                            onChange={(e) =>
                                                setFormData({ ...formData, provider: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="create-source">Source</Label>
                                        <Input
                                            id="create-source"
                                            placeholder="e.g., facebook, twitter"
                                            value={formData.source}
                                            onChange={(e) =>
                                                setFormData({ ...formData, source: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="create-meta">Meta (JSON)</Label>
                                    <Textarea
                                        id="create-meta"
                                        placeholder='{"content": "Post content", "site": "example.com"}'
                                        value={metaJsonString}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setMetaJsonString(value);
                                            // Validate JSON in real-time but allow editing
                                            const { error } = parseMetaJson(value);
                                            setMetaJsonError(error);
                                        }}
                                        onBlur={() => {
                                            // Try to parse and format JSON on blur if valid
                                            const { meta, error } = parseMetaJson(metaJsonString);
                                            if (!error && metaJsonString.trim()) {
                                                setMetaJsonString(JSON.stringify(meta, null, 2));
                                                setMetaJsonError(null);
                                            }
                                        }}
                                        className={`font-mono text-sm resize-none ${metaJsonError ? 'border-red-300 focus:border-red-500' : ''
                                            }`}
                                        rows={20}
                                    />
                                    {metaJsonError ? (
                                        <p className="text-xs text-red-600">
                                            Invalid JSON: {metaJsonError}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Enter valid JSON format. JSON will be formatted on blur.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                                <Button
                                    variant="outline"
                                    onClick={() => setCreateDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={handleCreate}>Create</Button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Edit Drawer */}
            {editDialogOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setEditDialogOpen(false)}
                    />
                    {/* Drawer */}
                    <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl z-50 transform transition-transform border-l border-gray-200">
                        <div className="flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900">
                                        Edit Post
                                    </h2>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Update post information. Hash cannot be changed.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEditDialogOpen(false)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-hash">Hash</Label>
                                    <Input
                                        id="edit-hash"
                                        value={formData.hash}
                                        disabled
                                        className="bg-muted"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-title">Title</Label>
                                    <Input
                                        id="edit-title"
                                        placeholder="Post title"
                                        value={formData.title}
                                        onChange={(e) =>
                                            setFormData({ ...formData, title: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-provider">Provider</Label>
                                        <Input
                                            id="edit-provider"
                                            placeholder="e.g., google api, lenx api"
                                            value={formData.provider}
                                            onChange={(e) =>
                                                setFormData({ ...formData, provider: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-source">Source</Label>
                                        <Input
                                            id="edit-source"
                                            placeholder="e.g., facebook, twitter"
                                            value={formData.source}
                                            onChange={(e) =>
                                                setFormData({ ...formData, source: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-meta">Meta (JSON)</Label>
                                    <Textarea
                                        id="edit-meta"
                                        placeholder='{"content": "Post content", "site": "example.com"}'
                                        value={metaJsonString}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setMetaJsonString(value);
                                            // Validate JSON in real-time but allow editing
                                            const { error } = parseMetaJson(value);
                                            setMetaJsonError(error);
                                        }}
                                        onBlur={() => {
                                            // Try to parse and format JSON on blur if valid
                                            const { meta, error } = parseMetaJson(metaJsonString);
                                            if (!error && metaJsonString.trim()) {
                                                setMetaJsonString(JSON.stringify(meta, null, 2));
                                                setMetaJsonError(null);
                                            }
                                        }}
                                        className={`font-mono text-sm resize-none ${metaJsonError ? 'border-red-300 focus:border-red-500' : ''
                                            }`}
                                        rows={20}
                                    />
                                    {metaJsonError ? (
                                        <p className="text-xs text-red-600">
                                            Invalid JSON: {metaJsonError}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Enter valid JSON format. JSON will be formatted on blur.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                                <Button
                                    variant="outline"
                                    onClick={() => setEditDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={handleUpdate}>Update</Button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Post</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this post? This action cannot be
                            undone.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPost && (
                        <div className="py-4">
                            <p className="text-sm text-muted-foreground">
                                Hash: <span className="font-mono">{selectedPost.hash}</span>
                            </p>
                            {selectedPost.title && (
                                <p className="text-sm text-muted-foreground mt-2">
                                    Title: {selectedPost.title}
                                </p>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

