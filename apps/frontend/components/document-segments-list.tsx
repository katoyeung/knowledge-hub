"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { documentSegmentApi, DocumentSegment, Document } from "@/lib/api";
import { Toggle } from "@/components/ui/toggle";
import { Edit3, Trash2 } from "lucide-react";
import SegmentEditDrawer from "./segment-edit-drawer";

// Simple date formatter
const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
};

// Extract keywords from the keywords object
const extractKeywords = (keywords?: Record<string, unknown>): string[] => {
    if (!keywords) return [];

    // Handle the structure we created in the backend: { extracted: string[], count: number, extractedAt: string }
    if (keywords.extracted && Array.isArray(keywords.extracted)) {
        return keywords.extracted as string[];
    }

    // Fallback for other possible structures
    if (Array.isArray(keywords)) {
        return keywords as string[];
    }

    return [];
};

// Keyword tags component
const KeywordTags = ({ keywords }: { keywords?: Record<string, unknown> }) => {
    const keywordList = extractKeywords(keywords);

    if (keywordList.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-1 mt-2">
            {keywordList.map((keyword, index) => (
                <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                    {keyword}
                </span>
            ))}
        </div>
    );
};

interface DocumentSegmentsListProps {
    document: Document;
    onBack: () => void;
}

export default function DocumentSegmentsList({
    document,
    onBack,
}: DocumentSegmentsListProps) {
    const [segments, setSegments] = useState<DocumentSegment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
    const [togglingSegments, setTogglingSegments] = useState<Set<string>>(new Set());

    // Edit drawer state
    const [editingSegment, setEditingSegment] = useState<DocumentSegment | null>(null);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

    // Delete confirmation state
    const [deleteConfirmSegment, setDeleteConfirmSegment] = useState<DocumentSegment | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Unsaved changes warning state
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [pendingEditSegment, setPendingEditSegment] = useState<DocumentSegment | null>(null);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
    const [triggerSave, setTriggerSave] = useState(false);

    // Ref to track if fetch is in progress to prevent duplicate calls
    const fetchInProgressRef = useRef(false);
    const currentDocumentIdRef = useRef<string | null>(null);

    // Enhanced function to get document creation date
    const getDocumentCreationDate = (doc: Document): string => {
        // Try createdAt first (if available)
        if (doc.createdAt) {
            return formatDate(doc.createdAt);
        }

        // Fallback to uploadedAt from metadata
        if (doc.docMetadata?.uploadedAt && typeof doc.docMetadata.uploadedAt === 'string') {
            return formatDate(doc.docMetadata.uploadedAt);
        }

        // Fallback to completedAt
        if (doc.completedAt) {
            return formatDate(doc.completedAt);
        }

        return 'N/A';
    };

    // Function to calculate word count from segments if document wordCount is null
    const getWordCount = (doc: Document, segmentsList: DocumentSegment[]): string => {
        // Use document wordCount if available
        if (doc.wordCount && doc.wordCount > 0) {
            return doc.wordCount.toLocaleString();
        }

        // Calculate from segments if available
        if (segmentsList.length > 0) {
            const totalWords = segmentsList.reduce((total, segment) => total + (segment.wordCount || 0), 0);
            return totalWords > 0 ? totalWords.toLocaleString() : 'N/A';
        }

        return 'N/A';
    };

    const loadSegments = useCallback(async () => {
        // Prevent duplicate calls for the same document
        if (fetchInProgressRef.current && currentDocumentIdRef.current === document.id) {
            console.log('🚫 Skipping duplicate segments API call for documentId:', document.id);
            return;
        }

        console.log('🔍 loadSegments called for documentId:', document.id);
        fetchInProgressRef.current = true;
        currentDocumentIdRef.current = document.id;

        try {
            setLoading(true);
            setError(null);

            // Just load segments, no need to fetch document details again
            const segmentsData = await documentSegmentApi.getByDocument(document.id);

            console.log('📄 Segments fetched:', segmentsData.length, 'segments');
            setSegments(segmentsData);
        } catch (err) {
            console.error("Failed to load document segments:", err);
            setError("Failed to load document segments");
        } finally {
            setLoading(false);
            fetchInProgressRef.current = false;
        }
    }, [document.id]);

    useEffect(() => {
        console.log('🔄 segments useEffect triggered with documentId:', document.id);
        loadSegments();
    }, [loadSegments]);

    const handleToggleStatus = async (segmentId: string, currentEnabled: boolean) => {
        // Add to toggling set to show loading state
        setTogglingSegments(prev => new Set(prev).add(segmentId));

        try {
            await documentSegmentApi.toggleStatus(segmentId);

            // Update the local state immediately for better UX
            setSegments(prev => prev.map(segment =>
                segment.id === segmentId
                    ? { ...segment, enabled: !currentEnabled }
                    : segment
            ));
        } catch (err) {
            console.error("Failed to toggle segment status:", err);
            // Revert the optimistic update on error
            await loadSegments();
        } finally {
            // Remove from toggling set
            setTogglingSegments(prev => {
                const newSet = new Set(prev);
                newSet.delete(segmentId);
                return newSet;
            });
        }
    };

    const handleToggleExpand = (segmentId: string) => {
        setExpandedSegments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(segmentId)) {
                newSet.delete(segmentId);
            } else {
                newSet.add(segmentId);
            }
            return newSet;
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed":
                return "text-green-600 bg-green-50";
            case "waiting":
                return "text-yellow-600 bg-yellow-50";
            case "parsing":
                return "text-blue-600 bg-blue-50";
            case "failed":
                return "text-red-600 bg-red-50";
            default:
                return "text-gray-600 bg-gray-50";
        }
    };

    const truncateContent = (content: string, maxLength: number = 200) => {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength) + "...";
    };

    const renderSegmentContent = (segment: DocumentSegment) => {
        const isExpanded = expandedSegments.has(segment.id);
        const shouldTruncate = segment.content.length > 200;

        return (
            <div>
                <div className="text-gray-800 text-sm leading-relaxed mb-3">
                    {isExpanded || !shouldTruncate ? segment.content : truncateContent(segment.content)}
                </div>

                {shouldTruncate && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent triggering edit
                            handleToggleExpand(segment.id);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                        {isExpanded ? "Show less" : "Show more"}
                    </button>
                )}
            </div>
        );
    };

    // Handle edit segment
    const handleEditSegment = (segment: DocumentSegment) => {
        // Check if there are unsaved changes
        if (hasUnsavedChanges && editingSegment && editingSegment.id !== segment.id) {
            setPendingEditSegment(segment);
            setShowUnsavedWarning(true);
            return;
        }

        setEditingSegment(segment);
        setIsEditDrawerOpen(true);
    };

    // Handle save segment
    const handleSaveSegment = (updatedSegment: DocumentSegment) => {
        setSegments(prev => prev.map(segment =>
            segment.id === updatedSegment.id ? updatedSegment : segment
        ));
    };

    // Handle close edit drawer
    const handleCloseEditDrawer = () => {
        setIsEditDrawerOpen(false);
        setEditingSegment(null);
    };

    // Handle delete segment
    const handleDeleteSegment = (segment: DocumentSegment) => {
        setDeleteConfirmSegment(segment);
    };

    // Handle confirm delete
    const handleConfirmDelete = async () => {
        if (!deleteConfirmSegment) return;

        setIsDeleting(true);
        try {
            await documentSegmentApi.delete(deleteConfirmSegment.id);

            // Remove from local state
            setSegments(prev => prev.filter(segment => segment.id !== deleteConfirmSegment.id));

            // Close modal
            setDeleteConfirmSegment(null);
        } catch (err) {
            console.error("Failed to delete segment:", err);
            // Could add error state here if needed
        } finally {
            setIsDeleting(false);
        }
    };

    // Handle cancel delete
    const handleCancelDelete = () => {
        setDeleteConfirmSegment(null);
    };

    // Handle unsaved changes callback
    const handleUnsavedChanges = (hasChanges: boolean) => {
        setHasUnsavedChanges(hasChanges);
    };

    // Handle unsaved changes warning actions
    const handleSaveAndContinue = async () => {
        if (editingSegment) {
            setTriggerSave(true);
        }
    };

    const handleSaveTriggered = () => {
        setTriggerSave(false);
        setShowUnsavedWarning(false);
        if (pendingEditSegment) {
            // Small delay to ensure save is complete
            setTimeout(() => {
                setEditingSegment(pendingEditSegment);
                setIsEditDrawerOpen(true);
                setPendingEditSegment(null);
            }, 100);
        }
    };

    const handleDiscardAndContinue = () => {
        setShowUnsavedWarning(false);
        if (pendingEditSegment) {
            setEditingSegment(pendingEditSegment);
            setIsEditDrawerOpen(true);
            setPendingEditSegment(null);
        }
    };

    const handleCancelUnsavedWarning = () => {
        setShowUnsavedWarning(false);
        setPendingEditSegment(null);
    };

    // Disable body scrolling when modals are open
    useEffect(() => {
        if (typeof window !== 'undefined' && window.document?.body) {
            if (deleteConfirmSegment || showUnsavedWarning) {
                window.document.body.style.overflow = 'hidden';
            } else {
                window.document.body.style.overflow = '';
            }
        }

        // Cleanup on unmount
        return () => {
            if (typeof window !== 'undefined' && window.document?.body) {
                window.document.body.style.overflow = '';
            }
        };
    }, [deleteConfirmSegment, showUnsavedWarning]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading segments...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg
                                className="h-5 w-5 text-red-400"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">Error</h3>
                            <div className="mt-2 text-sm text-red-700">{error}</div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={loadSegments}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <button
                        onClick={onBack}
                        className="flex items-center text-gray-600 hover:text-gray-800 mb-2"
                    >
                        <svg
                            className="w-4 h-4 mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                        Back to Documents
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Document Segments
                    </h1>
                    <p className="text-gray-600 mt-1">
                        {document.name} • {segments.length} segments
                    </p>
                </div>
                <div className="text-sm text-gray-500">
                    Status:
                    <span className={`ml-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(document.indexingStatus)}`}>
                        {document.indexingStatus}
                    </span>
                </div>
            </div>

            {/* Document Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-gray-700">Type:</span>
                        <span className="ml-1 text-gray-600">{document.docType || 'Unknown'}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Language:</span>
                        <span className="ml-1 text-gray-600">{document.docLanguage || 'en'}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Words:</span>
                        <span className="ml-1 text-gray-600">{getWordCount(document, segments)}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Created:</span>
                        <span className="ml-1 text-gray-600">{getDocumentCreationDate(document)}</span>
                    </div>
                </div>
            </div>

            {/* Segments List */}
            {segments.length === 0 ? (
                <div className="text-center py-12">
                    <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                        No segments found
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        This document hasn&apos;t been processed into segments yet.
                    </p>
                    {document.indexingStatus === 'waiting' && (
                        <p className="mt-2 text-sm text-blue-600">
                            Processing will begin shortly...
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {segments.map((segment) => (
                        <div
                            key={segment.id}
                            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                                        Segment {segment.position}
                                    </span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(segment.status)}`}>
                                        {segment.status}
                                    </span>
                                    {!segment.enabled && (
                                        <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded">
                                            Disabled
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className="text-xs text-gray-500">
                                        {segment.wordCount} words • {segment.tokens} tokens
                                    </span>

                                    {/* Edit Button */}
                                    <button
                                        onClick={() => handleEditSegment(segment)}
                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Edit segment"
                                    >
                                        <Edit3 className="h-4 w-4" />
                                    </button>

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => handleDeleteSegment(segment)}
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Delete segment"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>

                                    <Toggle
                                        checked={segment.enabled}
                                        onCheckedChange={() => handleToggleStatus(segment.id, segment.enabled)}
                                        disabled={togglingSegments.has(segment.id)}
                                        size="sm"
                                    />
                                </div>
                            </div>

                            {/* Content area - clickable for editing */}
                            <div
                                className="cursor-pointer hover:bg-gray-50 rounded p-2 -m-2 transition-colors"
                                onClick={() => handleEditSegment(segment)}
                            >
                                {renderSegmentContent(segment)}

                                {/* Keywords Tags */}
                                <KeywordTags keywords={segment.keywords} />
                            </div>

                            {segment.completedAt && (
                                <div className="mt-3 text-xs text-gray-500">
                                    Completed: {formatDate(segment.completedAt)}
                                </div>
                            )}

                            {segment.error && (
                                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                    Error: {segment.error}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Drawer */}
            <SegmentEditDrawer
                segment={editingSegment}
                isOpen={isEditDrawerOpen}
                onClose={handleCloseEditDrawer}
                onSave={handleSaveSegment}
                onUnsavedChanges={handleUnsavedChanges}
                triggerSave={triggerSave}
                onSaveTriggered={handleSaveTriggered}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmSegment && (
                <div
                    className="fixed inset-0 bg-black/5 flex items-center justify-center z-50 overscroll-none"
                    style={{ touchAction: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.preventDefault()}
                    onTouchMove={(e) => e.preventDefault()}
                >
                    <div
                        className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Delete Segment
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete Segment {deleteConfirmSegment.position}?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 min-w-[80px]"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unsaved Changes Warning Modal */}
            {showUnsavedWarning && (
                <div
                    className="fixed inset-0 bg-black/5 flex items-center justify-center z-50 overscroll-none"
                    style={{ touchAction: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.preventDefault()}
                    onTouchMove={(e) => e.preventDefault()}
                >
                    <div
                        className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Unsaved Changes
                        </h3>
                        <p className="text-gray-600 mb-6">
                            You have unsaved changes in the current segment. What would you like to do?
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleSaveAndContinue}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                            >
                                Save and Continue
                            </button>
                            <button
                                onClick={handleDiscardAndContinue}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                            >
                                Discard Changes
                            </button>
                            <button
                                onClick={handleCancelUnsavedWarning}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 