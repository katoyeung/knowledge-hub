'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { postsApi, Post, CreatePostDto } from '@/lib/api';
import { useToast } from '@/components/ui/simple-toast';
import { Navbar } from '@/components/navbar';

export default function PostsPage() {
    const { success, error: showError } = useToast();

    const handleLogout = () => {
        // The navbar handles the actual logout logic
    };
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);

    // Input values state (for immediate UI updates)
    const [inputValues, setInputValues] = useState({
        hash: '',
        provider: '',
        source: '',
        title: '',
        metaKey: '',
        metaValue: '',
        postedAtStart: '',
        postedAtEnd: '',
    });

    // Filters state (debounced, used for actual search)
    const [filters, setFilters] = useState({
        hash: '',
        provider: '',
        source: '',
        title: '',
        metaKey: '',
        metaValue: '',
        postedAtStart: '',
        postedAtEnd: '',
    });

    // Debounce timeout ref
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Dialog states
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
    const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

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

    // Filter collapse state
    const [filtersExpanded, setFiltersExpanded] = useState(false);

    // Meta value regex validation
    const [metaValueError, setMetaValueError] = useState<string | null>(null);

    // Page number input state
    const [pageInput, setPageInput] = useState<string>('');

    // Debounce filter changes - update filters state after user stops typing
    useEffect(() => {
        // Clear existing timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // Don't update filters if meta value has regex error
        if (metaValueError) {
            return;
        }

        // Set new timeout to update filters after 500ms of no typing
        debounceTimeoutRef.current = setTimeout(() => {
            setFilters({ ...inputValues });
            setPage(1); // Reset to first page when filter changes
        }, 500);

        // Cleanup on unmount
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [inputValues, metaValueError]);

    // Load posts when filters or page changes
    useEffect(() => {
        loadPosts();
        // Clear selection when page or filters change
        setSelectedPostIds(new Set());
        // Sync page input with current page
        setPageInput(String(page));
    }, [page, filters]);

    // Sync page input when page changes externally
    useEffect(() => {
        setPageInput(String(page));
    }, [page]);

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
            if (filters.postedAtStart) params.postedAtStart = filters.postedAtStart;
            if (filters.postedAtEnd) params.postedAtEnd = filters.postedAtEnd;

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

    const handleSelectAll = () => {
        if (selectedPostIds.size === posts.length) {
            setSelectedPostIds(new Set());
        } else {
            setSelectedPostIds(new Set(posts.map((post) => post.id)));
        }
    };

    const handleSelectPost = (postId: string, checked: boolean) => {
        setSelectedPostIds((prev) => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(postId);
            } else {
                newSet.delete(postId);
            }
            return newSet;
        });
    };

    const handleBatchDelete = async (): Promise<void> => {
        if (selectedPostIds.size === 0) return;

        try {
            setBatchDeleteLoading(true);
            const postIds = Array.from(selectedPostIds);
            const result = await postsApi.batchDelete(postIds);
            success(`${result.deleted} post(s) deleted successfully`);
            setBatchDeleteDialogOpen(false);
            setSelectedPostIds(new Set());
            loadPosts();
        } catch (error: unknown) {
            console.error('Failed to batch delete posts:', error);
            const errorMessage =
                (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message ||
                'Failed to delete posts';
            showError(errorMessage);
        } finally {
            setBatchDeleteLoading(false);
        }
    };

    const handleDeleteAll = async (): Promise<void> => {
        try {
            setBatchDeleteLoading(true);
            const params: Record<string, string | number> = {};
            if (filters.hash) params.hash = filters.hash;
            if (filters.provider) params.provider = filters.provider;
            if (filters.source) params.source = filters.source;
            if (filters.title) params.title = filters.title;
            if (filters.metaKey) params.metaKey = filters.metaKey;
            if (filters.metaValue) params.metaValue = filters.metaValue;
            if (filters.postedAtStart) params.postedAtStart = filters.postedAtStart;
            if (filters.postedAtEnd) params.postedAtEnd = filters.postedAtEnd;

            const result = await postsApi.deleteAll(params);
            success(`${result.deleted} post(s) deleted successfully`);
            setDeleteAllDialogOpen(false);
            setSelectedPostIds(new Set());
            loadPosts();
        } catch (error: unknown) {
            console.error('Failed to delete all posts:', error);
            const errorMessage =
                (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
                (error as { message?: string })?.message ||
                'Failed to delete posts';
            showError(errorMessage);
        } finally {
            setBatchDeleteLoading(false);
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

    // Validate regex pattern
    const validateRegexPattern = (value: string): string | null => {
        if (!value.trim()) {
            return null; // Empty is valid
        }

        // Check if it's in /pattern/flags format
        const regexFormat = /^\/(.+)\/([gimsuvy]*)$/;
        const regexMatch = value.match(regexFormat);

        if (regexMatch) {
            // Validate the pattern inside the slashes
            try {
                new RegExp(regexMatch[1], regexMatch[2]);
                return null; // Valid regex
            } catch (error) {
                return `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }

        // Check if it contains regex metacharacters (indicating it should be a regex)
        const hasRegexMetacharacters = /[()|\[\]*+?{}^$\.]/.test(value);

        if (hasRegexMetacharacters && !value.includes('/')) {
            // Try to validate as a regex pattern
            try {
                new RegExp(value);
                return null; // Valid regex
            } catch (error) {
                return `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }

        return null; // Not a regex pattern, treat as plain text
    };

    const handleFilterChange = (key: string, value: string) => {
        // Update input values immediately (for UI responsiveness)
        setInputValues((prev) => ({ ...prev, [key]: value }));

        // Validate meta value if it's being changed
        if (key === 'metaValue') {
            const error = validateRegexPattern(value);
            setMetaValueError(error);
        } else {
            // Clear meta value error if changing other fields
            if (metaValueError) {
                setMetaValueError(null);
            }
        }

        // Filters will be updated via debounced useEffect
    };

    const clearFilters = () => {
        const emptyFilters = {
            hash: '',
            provider: '',
            source: '',
            title: '',
            metaKey: '',
            metaValue: '',
            postedAtStart: '',
            postedAtEnd: '',
        };
        setInputValues(emptyFilters);
        setFilters(emptyFilters);
        setPage(1);
    };

    const totalPages = Math.ceil(total / pageSize);
    const hasFilters = Object.values(inputValues).some((v) => v !== '');

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar onLogout={handleLogout} />
            <div className="container mx-auto py-8 px-4">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">Posts</h1>
                    <p className="text-muted-foreground">
                        Manage and view all posts with filtering and pagination
                    </p>
                </div>

                {/* Filters */}
                <Card className="mb-6">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                className="flex items-center gap-2 p-0 h-auto font-semibold"
                                onClick={() => setFiltersExpanded(!filtersExpanded)}
                            >
                                <Filter className="h-5 w-5" />
                                <span>Filters</span>
                                {filtersExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                            {hasFilters && (
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    <X className="h-4 w-4 mr-2" />
                                    Clear Filters
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    {filtersExpanded && (
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <Label htmlFor="filter-hash">Hash</Label>
                                    <Input
                                        id="filter-hash"
                                        placeholder="Search by hash"
                                        value={inputValues.hash}
                                        onChange={(e) => handleFilterChange('hash', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="filter-provider">Provider</Label>
                                    <Input
                                        id="filter-provider"
                                        placeholder="Filter by provider"
                                        value={inputValues.provider}
                                        onChange={(e) => handleFilterChange('provider', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="filter-source">Source</Label>
                                    <Input
                                        id="filter-source"
                                        placeholder="Filter by source"
                                        value={inputValues.source}
                                        onChange={(e) => handleFilterChange('source', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="filter-title">Title</Label>
                                    <Input
                                        id="filter-title"
                                        placeholder="Search in title"
                                        value={inputValues.title}
                                        onChange={(e) => handleFilterChange('title', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="filter-posted-at-start">Posted At Start</Label>
                                    <Input
                                        id="filter-posted-at-start"
                                        type="date"
                                        value={inputValues.postedAtStart}
                                        onChange={(e) => handleFilterChange('postedAtStart', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="filter-posted-at-end">Posted At End</Label>
                                    <Input
                                        id="filter-posted-at-end"
                                        type="date"
                                        value={inputValues.postedAtEnd}
                                        onChange={(e) => handleFilterChange('postedAtEnd', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t">
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="filter-meta-key">Meta Key</Label>
                                        <Input
                                            id="filter-meta-key"
                                            placeholder="Meta key (e.g., site)"
                                            value={inputValues.metaKey}
                                            onChange={(e) => handleFilterChange('metaKey', e.target.value)}
                                        />
                                    </div>
                                    {inputValues.metaKey && (
                                        <div>
                                            <Label htmlFor="filter-meta-value">Meta Value (Supports Regex)</Label>
                                            <Textarea
                                                id="filter-meta-value"
                                                placeholder="Meta value or regex pattern (e.g., /pattern/i or (限时|特惠))"
                                                value={inputValues.metaValue}
                                                onChange={(e) => handleFilterChange('metaValue', e.target.value)}
                                                rows={3}
                                                className={`resize-none ${metaValueError ? 'border-red-300 focus:border-red-500' : ''}`}
                                            />
                                            {metaValueError ? (
                                                <p className="text-xs text-red-600 mt-1">
                                                    {metaValueError}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Use regex pattern: /pattern/flags (e.g., /test/i) or just pattern with metacharacters (e.g., (限时|特惠))
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    )}
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
                            <div className="flex items-center gap-2">
                                {selectedPostIds.size > 0 && (
                                    <>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => setBatchDeleteDialogOpen(true)}
                                            disabled={batchDeleteLoading}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete Selected ({selectedPostIds.size})
                                        </Button>
                                        {selectedPostIds.size === posts.length && posts.length > 0 && total > posts.length && (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setDeleteAllDialogOpen(true)}
                                                disabled={batchDeleteLoading}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete All ({total})
                                            </Button>
                                        )}
                                    </>
                                )}
                                <Button onClick={() => setCreateDialogOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Post
                                </Button>
                            </div>
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
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-12">
                                                    <Checkbox
                                                        checked={posts.length > 0 && selectedPostIds.size === posts.length}
                                                        onCheckedChange={handleSelectAll}
                                                    />
                                                </th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Hash</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Title</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Provider</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Meta</th>
                                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Dates</th>
                                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {posts.map((post) => (
                                                <tr key={post.id} className="border-b transition-colors hover:bg-muted/50">
                                                    <td className="p-4 align-middle">
                                                        <Checkbox
                                                            checked={selectedPostIds.has(post.id)}
                                                            onCheckedChange={(checked) => handleSelectPost(post.id, checked as boolean)}
                                                        />
                                                    </td>
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
                                                        <div className="space-y-1">
                                                            {post.postedAt && (
                                                                <div>
                                                                    <span className="font-medium">Posted:</span>{' '}
                                                                    {new Date(post.postedAt).toLocaleDateString()}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <span className="font-medium">Created:</span>{' '}
                                                                {new Date(post.createdAt).toLocaleDateString()}
                                                            </div>
                                                        </div>
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
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">Go to</span>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={totalPages}
                                                    value={pageInput}
                                                    onChange={(e) => setPageInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const newPage = parseInt(pageInput, 10);
                                                            if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
                                                                setPage(newPage);
                                                            } else {
                                                                setPageInput(String(page));
                                                            }
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        const newPage = parseInt(pageInput, 10);
                                                        if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
                                                            setPage(newPage);
                                                        } else {
                                                            setPageInput(String(page));
                                                        }
                                                    }}
                                                    className="w-16 text-center"
                                                    placeholder={String(page)}
                                                />
                                                <span className="text-sm text-muted-foreground">of {totalPages}</span>
                                            </div>
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

                {/* Batch Delete Confirmation Dialog */}
                <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Selected Posts</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete {selectedPostIds.size} selected post(s)? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setBatchDeleteDialogOpen(false)}
                                disabled={batchDeleteLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleBatchDelete}
                                disabled={batchDeleteLoading}
                            >
                                {batchDeleteLoading ? 'Deleting...' : `Delete ${selectedPostIds.size} Post(s)`}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete All Confirmation Dialog */}
                <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete All Posts</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete all {total} post(s){Object.values(filters).some(v => v !== '') ? ' matching current filters' : ''}? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        {Object.values(filters).some(v => v !== '') && (
                            <div className="py-4">
                                <p className="text-sm text-muted-foreground font-semibold mb-2">Current filters:</p>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    {filters.hash && <p>Hash: {filters.hash}</p>}
                                    {filters.provider && <p>Provider: {filters.provider}</p>}
                                    {filters.source && <p>Source: {filters.source}</p>}
                                    {filters.title && <p>Title: {filters.title}</p>}
                                    {filters.metaKey && <p>Meta Key: {filters.metaKey}</p>}
                                    {filters.metaValue && <p>Meta Value: {String(filters.metaValue)}</p>}
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setDeleteAllDialogOpen(false)}
                                disabled={batchDeleteLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDeleteAll}
                                disabled={batchDeleteLoading}
                            >
                                {batchDeleteLoading ? 'Deleting...' : `Delete All ${total} Post(s)`}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

